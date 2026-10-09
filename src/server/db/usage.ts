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
import { inArray, sql, type SQL } from "drizzle-orm";

import { SUSPENDED_SOURCES } from "~/server/config/suspended-sources";

import type { NewUsageEvent } from "./schema";

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
/** Anything that can run a query: the shared client, or a transaction (tests use the latter). */
export type Runner = { execute: (q: SQL) => PromiseLike<unknown> };

async function rows<T>(query: SQL, runner?: Runner): Promise<T[]> {
  const run = runner ?? (await import("./client")).db;
  // postgres-js returns the rows array itself (node-postgres would wrap it in `{ rows }`).
  return (await run.execute(query)) as T[];
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
export async function signIns(
  w: UsageWindow,
  runner?: Runner,
): Promise<SignInDay[]> {
  // `session.created_at` is a plain `timestamp` (no zone) holding UTC wall-clock time, unlike
  // the other tables' `timestamptz`. Comparing it to a timestamptz would silently cast it using
  // the database session's TimeZone, so we say "this is UTC" explicitly with `at time zone
  // 'UTC'` (which turns it into a timestamptz) for the comparison, and bucket the plain value
  // directly with to_char, which involves no zone at all.
  return rows<SignInDay>(
    sql`
    select to_char(created_at, 'YYYY-MM-DD') as day,
           count(*)::int as sessions,
           count(distinct user_id)::int as readers
    from session
    where (created_at at time zone 'UTC') >= ${ts(w.since)}
      and (created_at at time zone 'UTC') < ${ts(w.until)}
      and ${readerFilter(sql`user_id`, w.excludeEmails)}
    group by 1 order by 1
  `,
    runner,
  );
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

// ---- 3.x readerLabels -----------------------------------------------------------------------

export type ReaderLabel = {
  userId: string;
  /** 1-based position by account creation, among all non-excluded users. Stable week to week. */
  n: number;
  joinedAt: Date;
};

/**
 * Numbers every reader by when their account was created, so the report can say `#3 (joined
 * 09-20)` instead of an email. It numbers *all* readers, not just the active ones in a window,
 * which is what keeps `#3` meaning the same person from one report to the next.
 * `row_number() over (order by …)` is the numbering; `id` breaks a created_at tie.
 */
export async function readerLabels(
  excludeEmails: string[],
  runner?: Runner,
): Promise<ReaderLabel[]> {
  const out = await rows<{ userId: string; n: number; joinedAt: string }>(
    sql`
    select id as "userId",
           (row_number() over (order by created_at, id))::int as n,
           created_at as "joinedAt"
    from "user"
    where ${readerFilter(sql`id`, excludeEmails)}
    order by n
  `,
    runner,
  );
  return out.map((r) => ({ ...r, joinedAt: new Date(r.joinedAt) }));
}

// =============================================================================================
// Cut 1: the `usage_event` table (docs/DESIGN_usage.md). A writer for `POST /api/usage` (Task 7)
// and readers for `usage:report` (Task 10).
// =============================================================================================

// ---- the writer -----------------------------------------------------------------------------

/**
 * Store a batch of validated events. One multi-row `INSERT` (a single round trip however many
 * events), and it **never throws**: analytics must not be able to break the thing it measures,
 * and the route answers `204` regardless. A failure is one `console.error` line carrying the
 * count only, never the contents. Returns how many rows landed (0 on failure).
 *
 * Two columns are foreign keys to rows that can vanish between the click and the beacon (an item
 * deleted by a re-ingest, a topic removed). One dead id would fail the whole statement, so the
 * ids are checked first, in one query each, and a dead one is set to null: the event still
 * counts, it just no longer points at anything. (Ruled 10-09-26.)
 */
export async function recordEvents(rows: NewUsageEvent[]): Promise<number> {
  if (rows.length === 0) return 0;
  try {
    const { db } = await import("./client");
    const { item, topic, usageEvent } = await import("./schema");

    const itemIds = [
      ...new Set(rows.flatMap((r) => (r.itemId ? [r.itemId] : []))),
    ];
    const topicIds = [
      ...new Set(rows.flatMap((r) => (r.topicId ? [r.topicId] : []))),
    ];
    const [liveItems, liveTopics] = await Promise.all([
      itemIds.length
        ? db.select({ id: item.id }).from(item).where(inArray(item.id, itemIds))
        : [],
      topicIds.length
        ? db
            .select({ id: topic.id })
            .from(topic)
            .where(inArray(topic.id, topicIds))
        : [],
    ]);
    const okItems = new Set(liveItems.map((r) => r.id));
    const okTopics = new Set(liveTopics.map((r) => r.id));

    // `id` is left out: the schema's `$defaultFn(nanoid)` fills it per row on insert.
    await db.insert(usageEvent).values(
      rows.map((r) => ({
        ...r,
        itemId: r.itemId && okItems.has(r.itemId) ? r.itemId : null,
        topicId: r.topicId && okTopics.has(r.topicId) ? r.topicId : null,
      })),
    );
    return rows.length;
  } catch {
    console.error(
      `usage: dropped a batch of ${rows.length} events (insert failed)`,
    );
    return 0;
  }
}

/**
 * Delete events older than `olderThanDays` and return how many went. `now` is injectable for
 * tests. The `WITH d AS (DELETE … RETURNING 1)` form is a data-modifying CTE: Postgres runs the
 * delete and lets the outer `SELECT` count what it removed, in one statement.
 */
export async function pruneEvents(
  olderThanDays: number,
  now: Date = new Date(),
  runner?: Runner,
): Promise<number> {
  const cutoff = new Date(now.getTime() - olderThanDays * 86_400_000);
  const [r] = await rows<{ n: number }>(
    sql`
    with d as (delete from usage_event where at < ${ts(cutoff)} returning 1)
    select count(*)::int as n from d
  `,
    runner,
  );
  return r?.n ?? 0;
}

// ---- shared bits for the event readers ------------------------------------------------------

/**
 * `WHERE`-ready: events inside the window from readers. **Signed-out events (`user_id` null) are
 * part of the data** (a shared-link visit is how the share -> sign-up funnel is seen), so the
 * exclusion is written `user_id is null or <not an excluded user>`. It has to be explicit:
 * `null not in (…)` is not true in SQL, it is *unknown*, and a bare `readerFilter` would silently
 * drop every signed-out row.
 */
function eventFilter(w: UsageWindow, col: SQL = sql`user_id`): SQL {
  return sql`at >= ${ts(w.since)} and at < ${ts(w.until)}
    and (${col} is null or ${readerFilter(col, w.excludeEmails)})`;
}

/** Turns `[{k, n}]` rows into `{ k: n }`. */
function toMap(
  list: { k: string | null; n: number }[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of list) if (r.k != null) out[r.k] = r.n;
  return out;
}

/** Count events of one kind grouped by a meta key (`meta->>'key'`). */
async function countByMeta(
  w: UsageWindow,
  kind: string,
  key: string,
): Promise<Record<string, number>> {
  return toMap(
    await rows<{ k: string | null; n: number }>(sql`
      select meta->>${key} as k, count(*)::int as n from usage_event
      where kind = ${kind} and ${eventFilter(w)}
      group by 1
    `),
  );
}

// ---- visits ---------------------------------------------------------------------------------

export type VisitSummary = {
  /** `visit.start` events: one per visit. */
  count: number;
  /** Of those, how many had no user. */
  signedOut: number;
  /** Median / 90th percentile of `visit.end.seconds`; null with no ended visits. */
  medianSeconds: number | null;
  p90Seconds: number | null;
  device: Record<string, number>;
  via: Record<string, number>;
  /** Fraction of visits run as an installed app; null with no visits. */
  standaloneShare: number | null;
};

export async function visits(w: UsageWindow): Promise<VisitSummary> {
  // `percentile_cont(0.5) within group (order by x)` is Postgres's median (an *ordered-set
  // aggregate*; 0.9 gives p90). It interpolates between the two middle values, and returns null
  // when no row passes the FILTER.
  const [r] = await rows<{
    count: number;
    signedOut: number;
    standalone: number;
    median: number | null;
    p90: number | null;
  }>(sql`
    select
      (count(*) filter (where kind = 'visit.start'))::int as count,
      (count(*) filter (where kind = 'visit.start' and user_id is null))::int as "signedOut",
      (count(*) filter (where kind = 'visit.start' and meta->>'standalone' = 'true'))::int
        as standalone,
      percentile_cont(0.5) within group (order by (meta->>'seconds')::int)
        filter (where kind = 'visit.end') as median,
      percentile_cont(0.9) within group (order by (meta->>'seconds')::int)
        filter (where kind = 'visit.end') as p90
    from usage_event
    where kind in ('visit.start', 'visit.end') and ${eventFilter(w)}
  `);
  const count = r?.count ?? 0;
  return {
    count,
    signedOut: r?.signedOut ?? 0,
    medianSeconds: r?.median ?? null,
    p90Seconds: r?.p90 ?? null,
    device: await countByMeta(w, "visit.start", "device"),
    via: await countByMeta(w, "visit.start", "via"),
    standaloneShare: count > 0 ? (r?.standalone ?? 0) / count : null,
  };
}

// ---- screens per visit ----------------------------------------------------------------------

export type ScreensPerVisit = {
  /** Distinct visits with any event in the window. */
  visits: number;
  total: number;
  mean: number | null;
  median: number | null;
  max: number;
  byScreen: Record<string, number>;
};

export async function screensPerVisit(
  w: UsageWindow,
): Promise<ScreensPerVisit> {
  // One row per visit with its number of `screen.open`s (0 for a visit that opened none), then
  // aggregate those counts.
  const [r] = await rows<{
    visits: number;
    total: number;
    median: number | null;
    max: number | null;
  }>(sql`
    with per as (
      select visit, (count(*) filter (where kind = 'screen.open'))::int as n
      from usage_event where ${eventFilter(w)} group by visit
    )
    select count(*)::int as visits, coalesce(sum(n), 0)::int as total,
           percentile_cont(0.5) within group (order by n) as median, max(n) as max
    from per
  `);
  const byScreen = toMap(
    await rows<{ k: string | null; n: number }>(sql`
      select screen as k, count(*)::int as n from usage_event
      where kind = 'screen.open' and ${eventFilter(w)} group by 1
    `),
  );
  const visitCount = r?.visits ?? 0;
  const total = r?.total ?? 0;
  return {
    visits: visitCount,
    total,
    mean: visitCount > 0 ? total / visitCount : null,
    median: r?.median ?? null,
    max: r?.max ?? 0,
    byScreen,
  };
}

// ---- item opens and swipe depth -------------------------------------------------------------

export type ItemOpens = {
  opens: number;
  /** Opens divided by distinct visits with any event in the window; null with no visits. */
  perVisit: number | null;
  from: Record<string, number>;
  /** Runs of consecutive `from: rail` opens within a visit (the wander's depth). */
  swipe: { runs: number; median: number | null; max: number };
};

export async function itemOpens(w: UsageWindow): Promise<ItemOpens> {
  const [c] = await rows<{ opens: number; visits: number }>(sql`
    select (count(*) filter (where kind = 'item.open'))::int as opens,
           count(distinct visit)::int as visits
    from usage_event where ${eventFilter(w)}
  `);
  // Swipe depth is another gaps-and-islands (see `sittings`), here without timestamps:
  //  - number every `item.open` of a visit in time order (`rn`; the id breaks a same-instant tie);
  //  - number the *rail* ones among themselves (`rr`);
  //  - for consecutive rail opens both counters step by 1, so `rn - rr` is constant across the
  //    run and changes the moment a non-rail open intervenes. Group on (visit, rn - rr).
  // "Consecutive" is among that visit's `item.open` events only: a linkout, zoom or screen.open
  // between two rail opens does not break the run, because the swipe is still going.
  const [s] = await rows<{
    runs: number;
    median: number | null;
    max: number | null;
  }>(sql`
    with opens as (
      select visit, meta->>'from' as frm,
             row_number() over (partition by visit order by at, id) as rn
      from usage_event where kind = 'item.open' and ${eventFilter(w)}
    ),
    rail as (
      select visit, rn, row_number() over (partition by visit order by rn) as rr
      from opens where frm = 'rail'
    ),
    runs as (select count(*) as len from rail group by visit, rn - rr)
    select count(*)::int as runs, percentile_cont(0.5) within group (order by len) as median,
           max(len)::int as max
    from runs
  `);
  const visitCount = c?.visits ?? 0;
  return {
    opens: c?.opens ?? 0,
    perVisit: visitCount > 0 ? (c?.opens ?? 0) / visitCount : null,
    from: await countByMeta(w, "item.open", "from"),
    swipe: { runs: s?.runs ?? 0, median: s?.median ?? null, max: s?.max ?? 0 },
  };
}

// ---- item actions ---------------------------------------------------------------------------

export type Rate = { count: number; per100: number | null };
export type ItemActions = {
  opens: number;
  linkout: Rate;
  /** `byMethod` is the share / copy / image split. */
  share: Rate & { byMethod: Record<string, number> };
  zoom: Rate;
  /** Magazine view switched *on* (the off events are not counted). */
  magazine: Rate;
  unsave: Rate;
};

export async function itemActions(w: UsageWindow): Promise<ItemActions> {
  const [r] = await rows<{
    opens: number;
    linkout: number;
    share: number;
    zoom: number;
    magazine: number;
    unsave: number;
  }>(sql`
    select
      (count(*) filter (where kind = 'item.open'))::int as opens,
      (count(*) filter (where kind = 'item.linkout'))::int as linkout,
      (count(*) filter (where kind = 'item.share'))::int as share,
      (count(*) filter (where kind = 'item.zoom'))::int as zoom,
      (count(*) filter (where kind = 'item.magazine' and meta->>'on' = 'true'))::int as magazine,
      (count(*) filter (where kind = 'item.unsave'))::int as unsave
    from usage_event where ${eventFilter(w)}
  `);
  const opens = r?.opens ?? 0;
  const rate = (count: number): Rate => ({
    count,
    per100: opens > 0 ? (count * 100) / opens : null,
  });
  return {
    opens,
    linkout: rate(r?.linkout ?? 0),
    share: {
      ...rate(r?.share ?? 0),
      byMethod: await countByMeta(w, "item.share", "method"),
    },
    zoom: rate(r?.zoom ?? 0),
    magazine: rate(r?.magazine ?? 0),
    unsave: rate(r?.unsave ?? 0),
  };
}

// ---- topic edits, installs, errors ----------------------------------------------------------

export async function topicEdits(
  w: UsageWindow,
): Promise<{ total: number; byAction: Record<string, number> }> {
  const byAction = await countByMeta(w, "topics.edit", "action");
  return {
    total: Object.values(byAction).reduce((a, b) => a + b, 0),
    byAction,
  };
}

/** `pwa.install` events by `how` (prompt / card / appinstalled). */
export async function installs(
  w: UsageWindow,
): Promise<Record<string, number>> {
  return countByMeta(w, "pwa.install", "how");
}

export type ClientErrorRow = {
  digest: string;
  screen: string | null;
  count: number;
};

/** Client errors grouped by (digest, screen), most frequent first. */
export async function clientErrors(w: UsageWindow): Promise<ClientErrorRow[]> {
  return rows<ClientErrorRow>(sql`
    select meta->>'digest' as digest, screen, count(*)::int as count
    from usage_event where kind = 'client.error' and ${eventFilter(w)}
    group by 1, 2 order by count desc, digest, screen
  `);
}

// ---- onboarding funnel ----------------------------------------------------------------------

export type OnboardingFunnel = {
  /** Readers (or signed-out visits) that touched onboarding in the window. */
  readers: number;
  /** `reached[n-1]`: how many got to step n or beyond in their latest onboarding visit. */
  reached: number[];
  /** `stoppedAt[n-1]`: how many had step n as their final `onboarding.step` event there. */
  stoppedAt: number[];
};

/**
 * Per reader, take their *latest* visit that contains any `onboarding.step` (a retake or a
 * second attempt supersedes the first). A signed-out visitor has no identity, so each of their
 * visits counts as its own "reader". For that visit: the highest step seen says how far they
 * got (`reached`), and the step of the chronologically last event says where they stopped
 * (`stoppedAt`; it differs from the max when they pressed Back).
 */
export async function onboardingFunnel(
  w: UsageWindow,
): Promise<OnboardingFunnel> {
  const steps = 8;
  const out = await rows<{ maxStep: number; lastStep: number }>(sql`
    with per_visit as (
      select coalesce(user_id, 'visit:' || visit) as who, visit,
             max((meta->>'step')::int) as max_step,
             max(at) as last_at,
             -- array_agg ordered by time, then [last]: the step of the final event
             (array_agg((meta->>'step')::int order by at, id))[count(*)] as last_step
      from usage_event
      where kind = 'onboarding.step' and ${eventFilter(w)}
      group by 1, 2
    )
    -- distinct on keeps the first row per reader in the given order: the newest visit.
    select distinct on (who) max_step as "maxStep", last_step as "lastStep"
    from per_visit order by who, last_at desc, visit
  `);
  const reached = Array.from(
    { length: steps },
    (_, i) => out.filter((r) => r.maxStep >= i + 1).length,
  );
  const stoppedAt = Array.from(
    { length: steps },
    (_, i) => out.filter((r) => r.lastStep === i + 1).length,
  );
  return { readers: out.length, reached, stoppedAt };
}
