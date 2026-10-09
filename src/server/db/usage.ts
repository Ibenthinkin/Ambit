// The Cut 0 usage readers (docs/DESIGN_usage.md, "What already answers"): plain SQL over tables
// that already exist — `seen_item`, `saved_item`, `session`, `interview_answer`, `item` — with no
// schema change. One function per section of `bun run usage:report` (Task 3 composes them).
//
// Three conventions every reader shares:
//
//  1. A half-open window `[since, until)`. "Half-open" means `since` is included and `until` is
//     not, so two adjacent windows (this week, last week) never count the same row twice.
//  2. Readers only. Personas and e2e accounts are excluded by email (`readerFilter`): the caller
//     passes the persona emails in `excludeEmails`, and `E2E_EMAIL_PATTERN` is applied on top.
//  3. Dynamic `import("./client")`, like every other db module: a static import would load
//     `~/env` and crash `bun run test` in CI, which has no environment at all.
//
// The SQL is written with Drizzle's `sql` tag (raw SQL with safe, parameterised `${…}` holes)
// because the interesting queries here — window functions, FILTER aggregates — are not what the
// query builder is for. Timestamps go in as ISO strings cast `::timestamptz`, and counts come out
// `::int`, because Postgres returns `count(*)` as a bigint, which the driver hands back as a
// string.
import { sql, type SQL } from "drizzle-orm";

import { SUSPENDED_SOURCES } from "~/server/config/suspended-sources";

/** The e2e suite signs up `ambit-<something>@example.com`; none of those are readers. */
export const E2E_EMAIL_PATTERN = "ambit-%@example.com";

/** Every windowed reader takes this. */
export type UsageWindow = {
  since: Date;
  until: Date;
  /** Emails that are not readers (the personas). The e2e pattern is always excluded as well. */
  excludeEmails: string[];
};

/** Fixed minutes between two served items that start a new sitting. */
export const SITTING_GAP_MINUTES = 30;

// ---- shared SQL fragments -------------------------------------------------------------------

const ts = (d: Date): SQL => sql`${d.toISOString()}::timestamptz`;

/**
 * A `WHERE`-ready condition keeping only readers. `col` is the user id column of the table being
 * read; the subquery asks `"user"` whether that id belongs to someone we exclude. Written as
 * `NOT IN (subquery)` rather than a join so it drops into any reader's WHERE unchanged.
 */
function readerFilter(col: SQL, excludeEmails: string[]): SQL {
  const listed =
    excludeEmails.length > 0
      ? sql`or u.email in (${sql.join(
          excludeEmails.map((e) => sql`${e}`),
          sql`, `,
        )})`
      : sql``;
  return sql`${col} not in (
    select u.id from "user" u where u.email like ${E2E_EMAIL_PATTERN} ${listed}
  )`;
}

// `db.execute` bypasses Drizzle's column mapping, so timestamps arrive as Postgres text
// ("2020-03-02 10:00:00+00"); readers that return one wrap it in `new Date(…)`.
async function rows<T>(query: SQL): Promise<T[]> {
  const { db } = await import("./client");
  // postgres-js returns the rows array itself (node-postgres would wrap it in `{ rows }`).
  return (await db.execute(query)) as unknown as T[];
}

// ---- 2.1 readersActive ----------------------------------------------------------------------

export type ReaderActivity = {
  userId: string;
  /** Distinct UTC days with a served item or a save. */
  days: number;
  served: number;
  saves: number;
  firstAt: Date;
  lastAt: Date;
};

/**
 * Who was active in the window: per reader, the days they showed up, items served, items saved.
 * "Activity" is the union of `seen_item.served_at` and `saved_item.saved_at`, so a reader who
 * only saved something still appears.
 */
export async function readersActive(w: UsageWindow): Promise<ReaderActivity[]> {
  const out = await rows<ReaderActivity>(sql`
    with events as (
      select user_id, served_at as at, 1 as served, 0 as saves from seen_item
      where served_at >= ${ts(w.since)} and served_at < ${ts(w.until)}
      union all
      select user_id, saved_at as at, 0 as served, 1 as saves from saved_item
      where saved_at >= ${ts(w.since)} and saved_at < ${ts(w.until)}
    )
    select
      user_id as "userId",
      count(distinct (at at time zone 'UTC')::date)::int as days,
      sum(served)::int as served,
      sum(saves)::int as saves,
      min(at) as "firstAt",
      max(at) as "lastAt"
    from events
    where ${readerFilter(sql`user_id`, w.excludeEmails)}
    group by user_id
    order by user_id
  `);
  return out.map((r) => ({
    ...r,
    firstAt: new Date(r.firstAt),
    lastAt: new Date(r.lastAt),
  }));
}

// ---- 2.2 sittings ---------------------------------------------------------------------------

export type Sitting = {
  userId: string;
  startedAt: Date;
  endedAt: Date;
  served: number;
};

/**
 * A reader's sittings: runs of served items with no gap of `gapMinutes` or more between them.
 *
 * This is the classic SQL **gaps-and-islands** problem — turning a flat list of timestamps into
 * groups ("islands") separated by gaps. Three steps, one CTE each:
 *
 *  1. `lag(served_at)` looks one row back within the same reader (rows ordered by time), so each
 *     item knows when the previous one was served.
 *  2. Flag an item `1` if it *starts* an island — it is the reader's first, or the gap since the
 *     previous one is at least the threshold — else `0`.
 *  3. A running `sum()` of those flags numbers the islands: every item inherits the count of
 *     starts so far, so all items in one sitting share a number. Group on it and you have the
 *     sittings. (Any two items in the same island have the same running total because no start
 *     flag lies between them.)
 */
export async function sittings(
  w: UsageWindow,
  gapMinutes: number = SITTING_GAP_MINUTES,
): Promise<Sitting[]> {
  const out = await rows<Sitting>(sql`
    with prev as (
      select user_id, served_at,
             lag(served_at) over (partition by user_id order by served_at) as prev_at
      from seen_item
      where served_at >= ${ts(w.since)} and served_at < ${ts(w.until)}
        and ${readerFilter(sql`user_id`, w.excludeEmails)}
    ),
    flagged as (
      select user_id, served_at,
             case when prev_at is null
                    or served_at - prev_at >= make_interval(mins => ${gapMinutes})
                  then 1 else 0 end as starts
      from prev
    ),
    numbered as (
      select user_id, served_at,
             sum(starts) over (partition by user_id order by served_at) as n
      from flagged
    )
    select user_id as "userId", min(served_at) as "startedAt",
           max(served_at) as "endedAt", count(*)::int as served
    from numbered
    group by user_id, n
    order by user_id, "startedAt"
  `);
  return out.map((r) => ({
    ...r,
    startedAt: new Date(r.startedAt),
    endedAt: new Date(r.endedAt),
  }));
}

// ---- 2.3 savesPerHundred --------------------------------------------------------------------

export type SaveRate = { served: number; saves: number; perHundred: number };

/** Saves per hundred items served, across all readers in the window. 0 when nothing was served. */
export async function savesPerHundred(w: UsageWindow): Promise<SaveRate> {
  const [r] = await rows<{ served: number; saves: number }>(sql`
    select
      (select count(*)::int from seen_item
        where served_at >= ${ts(w.since)} and served_at < ${ts(w.until)}
          and ${readerFilter(sql`user_id`, w.excludeEmails)}) as served,
      (select count(*)::int from saved_item
        where saved_at >= ${ts(w.since)} and saved_at < ${ts(w.until)}
          and ${readerFilter(sql`user_id`, w.excludeEmails)}) as saves
  `);
  const served = r?.served ?? 0;
  const saves = r?.saves ?? 0;
  return { served, saves, perHundred: served > 0 ? (saves * 100) / served : 0 };
}

// ---- 2.4 onboardingRuns ---------------------------------------------------------------------

export type OnboardingSummary = {
  userId: string;
  /** Distinct questionnaire passes (`run_id`s) answered in the window. */
  runs: number;
  /** Questions answered "skip" in the reader's most recent run. */
  skippedInLatest: number;
  /** Whether any answer in the window carries the reader's own words. */
  freeText: boolean;
};

export async function onboardingRuns(
  w: UsageWindow,
): Promise<OnboardingSummary[]> {
  return rows<OnboardingSummary>(sql`
    with a as (
      select * from interview_answer
      where asked_at >= ${ts(w.since)} and asked_at < ${ts(w.until)}
        and ${readerFilter(sql`user_id`, w.excludeEmails)}
    ),
    -- distinct on keeps the first row per user in the given order: the newest answer, whose
    -- run_id is therefore the latest run.
    latest as (
      select distinct on (user_id) user_id, run_id from a order by user_id, asked_at desc
    )
    select a.user_id as "userId",
           count(distinct a.run_id)::int as runs,
           (count(*) filter (where a.run_id = latest.run_id and a.answer = array['skip']))::int
             as "skippedInLatest",
           bool_or(a.text is not null) as "freeText"
    from a join latest on latest.user_id = a.user_id
    group by a.user_id
    order by a.user_id
  `);
}

// ---- 2.5 signIns ----------------------------------------------------------------------------

export type SignInDay = { day: string; sessions: number; readers: number };

/** Sessions created per UTC day, and how many different readers they were. `day` is YYYY-MM-DD. */
export async function signIns(w: UsageWindow): Promise<SignInDay[]> {
  return rows<SignInDay>(sql`
    select to_char(created_at at time zone 'UTC', 'YYYY-MM-DD') as day,
           count(*)::int as sessions,
           count(distinct user_id)::int as readers
    from session
    where created_at >= ${ts(w.since)} and created_at < ${ts(w.until)}
      and ${readerFilter(sql`user_id`, w.excludeEmails)}
    group by 1 order by 1
  `);
}

// ---- 2.6 sourceShare ------------------------------------------------------------------------

export type SourceShare = {
  source: string;
  served: number;
  servedShare: number;
  corpus: number;
  corpusShare: number;
  /** servedShare / corpusShare: above 1 the feed over-shows the source. null if not in corpus. */
  ratio: number | null;
};

/**
 * Is the feed over-showing a source? Compares each source's share of what was *served* in the
 * window with its share of the *drawable* corpus (images scoring 4+, from sources not
 * suspended). The corpus side is a snapshot of now, not of the window.
 *
 * `sources` limits both sides to those sources, so the shares are among that set: used by the
 * test to isolate its fixtures from the real corpus; the report omits it.
 */
export async function sourceShare(
  w: UsageWindow,
  sources?: string[],
): Promise<SourceShare[]> {
  const only =
    sources && sources.length > 0
      ? sql`and i.source in (${sql.join(
          sources.map((s) => sql`${s}`),
          sql`, `,
        )})`
      : sql``;
  const suspended =
    SUSPENDED_SOURCES.length > 0
      ? sql`and i.source not in (${sql.join(
          SUSPENDED_SOURCES.map((s) => sql`${s}`),
          sql`, `,
        )})`
      : sql``;
  const out = await rows<{
    source: string;
    served: number;
    corpus: number;
  }>(sql`
    with served as (
      select i.source, count(*)::int as n
      from seen_item s join item i on i.id = s.item_id
      where s.served_at >= ${ts(w.since)} and s.served_at < ${ts(w.until)}
        and ${readerFilter(sql`s.user_id`, w.excludeEmails)} ${only}
      group by i.source
    ),
    corpus as (
      select i.source, count(*)::int as n from item i
      where i.type = 'image' and i.curation_score >= 4 ${suspended} ${only}
      group by i.source
    )
    select coalesce(served.source, corpus.source) as source,
           coalesce(served.n, 0) as served, coalesce(corpus.n, 0) as corpus
    from served full join corpus on corpus.source = served.source
  `);
  const servedTotal = out.reduce((n, r) => n + r.served, 0);
  const corpusTotal = out.reduce((n, r) => n + r.corpus, 0);
  return out
    .map((r) => {
      const servedShare = servedTotal > 0 ? r.served / servedTotal : 0;
      const corpusShare = corpusTotal > 0 ? r.corpus / corpusTotal : 0;
      return {
        ...r,
        servedShare,
        corpusShare,
        ratio: corpusShare > 0 ? servedShare / corpusShare : null,
      };
    })
    .sort((a, b) => (b.ratio ?? -1) - (a.ratio ?? -1));
}

// ---- 2.7 retentionByWeek --------------------------------------------------------------------

export type RetentionWeek = {
  /** The Monday (UTC) the ISO week starts, YYYY-MM-DD. */
  week: string;
  /** Readers served at least one item that week. */
  active: number;
  /** Of those, how many were also active the week before. */
  returning: number;
};

/**
 * Weekly active readers and how many of them came back. "Active" means served an item
 * (`seen_item`). `now` is injectable so tests can look at fixed historical weeks.
 *
 * The self-join is the trick: `weeks` holds one row per (reader, week); joining it to itself on
 * `prev.week = cur.week - 7 days` leaves a match only for readers who were also active the
 * previous week.
 */
export async function retentionByWeek(opts: {
  weeks?: number;
  excludeEmails: string[];
  now?: Date;
}): Promise<RetentionWeek[]> {
  const weeks = opts.weeks ?? 6;
  const now = opts.now ?? new Date();
  // The Monday (UTC, as a plain timestamp) of the week containing `now`.
  const thisWeek = sql`date_trunc('week', ${ts(now)} at time zone 'UTC')`;
  return rows<RetentionWeek>(sql`
    with w as (
      -- one extra week back, so the first reported week can still look at the one before it
      select distinct user_id, date_trunc('week', served_at at time zone 'UTC') as wk
      from seen_item
      where served_at >= (${thisWeek} - make_interval(weeks => ${weeks})) at time zone 'UTC'
        and served_at < ${ts(now)}
        and ${readerFilter(sql`user_id`, opts.excludeEmails)}
    )
    select to_char(cur.wk, 'YYYY-MM-DD') as week,
           count(*)::int as active,
           count(prev.user_id)::int as returning
    from w cur
    left join w prev on prev.user_id = cur.user_id and prev.wk = cur.wk - interval '7 days'
    where cur.wk >= ${thisWeek} - make_interval(weeks => ${weeks - 1})
    group by cur.wk order by cur.wk
  `);
}
