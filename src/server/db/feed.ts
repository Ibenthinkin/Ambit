// Repository under the feed engine (SPEC §6.3, §9) — the two DB touchpoints Phase 4.1's pure
// `composePage` (services/feed.ts) doesn't own itself: fetching every reachable topic's eligible
// item pool in one batched query, and recording which items a user has now been served. Everything
// algorithmic (tier/topic/item weighting, diversity constraints) lives in services/feed.ts; this
// file is pure repository — no randomness, no business logic, just the SQL. Same dynamic-`db`-
// import pattern as items.ts's `drawFromTopic`/`upsertItem` throughout, for the same reason: CI's
// `bun run test` step sets no env vars at all, so a static "./client" import (which reads `~/env`)
// would crash the whole test run before a single test executes.
import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  notExists,
  notInArray,
  sql,
} from "drizzle-orm";

import { SUSPENDED_SOURCES } from "~/server/config/suspended-sources";
import type { Item } from "./items";
import { item, seenItem } from "./schema";

/**
 * The slice of an `Item` the feed engine actually reads while composing a page: `topicId` keys the
 * pool, `source` drives the no-adjacent-same-source constraint, and `curationScore` +
 * `aestheticTags` are the whole of `drawWeight`'s input. Everything else on the row — title,
 * summary, the 13 KB `body`, image and licence fields — is for *rendering*, and rendering only
 * happens for the twelve cards that win (see `getTopicPools` below, and `getItemsByIds`).
 */
export type PoolItem = Pick<
  Item,
  "id" | "source" | "curationScore" | "aestheticTags"
> & {
  /** Null ONLY for a row from `getWildPool` (09-06-26) — an un-homed item, which is the entire
   *  point of that pool. `getTopicPools` filters with `inArray(item.topicId, …)`, which no NULL
   *  row matches, so a topic pool still cannot contain one. Downstream, `composePage` turns a
   *  null here into exactly one thing: a WILD card. */
  topicId: string | null;
};

/**
 * One SELECT per page, not one per topic (SPEC §9's "slot plan first, pools second" — see
 * services/feed.ts's `getFeedPage`): for every id in `topicIds`, a deterministic **sample** of
 * the items above `scoreFloor` that this user hasn't been served before `anchor`
 * (`seen_item.served_at < anchor` — a strict `<`, deliberately not `<=`; see schema.ts's comment
 * on `seenItem.servedAt` for why), excluding `excludeIds` (the previous page's own item ids — a
 * separate guard because they share `anchor` exactly). Rides `idx_item_topic_score` for the
 * `IN (...) AND curationScore >=` half of the filter.
 *
 * Returns a Map keyed by every id in `topicIds` (even ones with zero eligible items — an empty
 * array, not a missing key) so services/feed.ts's `composePage` can do a plain `.get(topicId)`
 * without a null-vs-missing distinction to worry about.
 *
 * **A sample, not the pool** (09-08-26, docs/DESIGN_feed-pool-sampling.md). This used to return
 * every eligible row — a projection of five columns (Phase 7.3), which was the right fix when
 * the corpus was 9,848 rows and the weight was the `body` column. At 122,458 rows the *count* is
 * the cost: `reachableTopics` reaches 101 of 104 topics from three picks, so a page fetched
 * 133,698 rows / 22.4 MB and the process paid for materialising them (2.6 GB of dev-server RSS
 * in eight loads; a one-row insert stalling 1.7 s behind a compose). Now each topic contributes
 * at most `TOPIC_POOL_SAMPLE` rows, at most `TOPIC_POOL_PER_SOURCE` per source, chosen by
 * `md5(id || sampleKey)` — the same cursor-keyed hash `getWildPool` has used since 09-06-26 —
 * so a page costs O(topics × 60) whatever the corpus does. Postgres still scans every eligible
 * row to rank it (md5 over ~130k rows is milliseconds); what stops crossing the wire is the
 * other 95 %.
 *
 * The one thing this changes for the reader: `pickItem`'s curated-weighted draw runs over the
 * sample rather than the whole pool, so a top-scored item in a topic of thousands has to be in
 * the sixty first. `bun run probe:feed`'s score summary is what says whether that shows; the
 * design doc has the escalation (a score-tilted sample) if it does.
 *
 * The ~12 winners are re-fetched whole afterwards, by id, in one query (`getItemsByIds` →
 * `getFeedPage`) — twelve full rows instead of six thousand.
 */
export async function getTopicPools(
  topicIds: string[],
  opts: {
    userId: string;
    anchor: Date;
    scoreFloor: number;
    excludeIds: string[];
    /** `${seed}:${page}` from the cursor — what makes the sample a pure function of the page. */
    sampleKey: string;
  },
): Promise<Map<string, PoolItem[]>> {
  const pools = new Map<string, PoolItem[]>();
  for (const topicId of topicIds) pools.set(topicId, []);
  if (topicIds.length === 0) return pools;

  const { db } = await import("./client");

  // Rank every eligible row inside its topic (and inside its (topic, source)) by a hash of its
  // id and the page's key. `md5(id || key)` rather than `random()` for the same reason as
  // `getWildPool`: SPEC §7 promises a refetched cursor returns the same page, and a random()
  // sample would give a different one each time. The eligibility clauses are the shared
  // `eligibilityConditions`, applied *inside* the ranking, so a row that eligibility refuses is
  // never counted toward a cap — an exclusion is backfilled, not a hole in the sample.
  const ranked = db
    .select({
      id: item.id,
      topicId: item.topicId,
      source: item.source,
      curationScore: item.curationScore,
      aestheticTags: item.aestheticTags,
      n: sql<number>`row_number() over (partition by ${item.topicId} order by md5(${item.id} || ${opts.sampleKey}))`.as(
        "n",
      ),
      nSrc: sql<number>`row_number() over (partition by ${item.topicId}, ${item.source} order by md5(${item.id} || ${opts.sampleKey}))`.as(
        "n_src",
      ),
    })
    .from(item)
    .where(
      and(inArray(item.topicId, topicIds), ...eligibilityConditions(db, opts)),
    )
    .as("ranked");

  // `ORDER BY topic_id, id` is load-bearing, not cosmetic: `composePage`'s `weightedPick` walks
  // each pool's array in order, so the stable-page promise also depends on the *order* being
  // the same every time — and Postgres guarantees none without an explicit ORDER BY.
  const rows = await db
    .select({
      id: ranked.id,
      topicId: ranked.topicId,
      source: ranked.source,
      curationScore: ranked.curationScore,
      aestheticTags: ranked.aestheticTags,
    })
    .from(ranked)
    .where(
      and(
        lte(ranked.n, TOPIC_POOL_SAMPLE),
        lte(ranked.nSrc, TOPIC_POOL_PER_SOURCE),
      ),
    )
    .orderBy(asc(ranked.topicId), asc(ranked.id));

  for (const row of rows) {
    // Unreachable in practice — the `inArray(topicId, …)` above cannot match a NULL — but the
    // projection is typed `string | null` because the column is, and a `!` here would hide the
    // day this ever changes.
    if (row.topicId === null) continue;
    pools.get(row.topicId)?.push({ ...row, topicId: row.topicId });
  }
  return pools;
}

/** What makes an item eligible for ANY pool, topic or wild: above the floor, not served to this
 *  user before the page anchor, not from a suspended source, not on the previous page. Factored
 *  out when getWildPool arrived (09-06-26) so the two pools cannot drift apart — an item that a
 *  topic pool would refuse must not reach a reader through the wild one. */
function eligibilityConditions(
  db: Awaited<typeof import("./client")>["db"],
  opts: {
    userId: string;
    anchor: Date;
    scoreFloor: number;
    excludeIds: string[];
  },
) {
  const notSeenBeforeAnchor = notExists(
    db
      .select()
      .from(seenItem)
      .where(
        and(
          eq(seenItem.userId, opts.userId),
          eq(seenItem.itemId, item.id),
          lt(seenItem.servedAt, opts.anchor),
        ),
      ),
  );

  const conditions = [
    gte(item.curationScore, opts.scoreFloor),
    notSeenBeforeAnchor,
  ];
  // A suspended source's rows stay in the table but must never win a slot — see
  // config/suspended-sources.ts for why each one is off and what lifts it. Filtering here rather
  // than at ingest is what makes the switch retroactive: the corpus already holds thousands of
  // rows from a source that was healthy when they were fetched.
  if (SUSPENDED_SOURCES.length > 0) {
    conditions.push(notInArray(item.source, SUSPENDED_SOURCES));
  }
  // notInArray(id, []) is invalid SQL (an empty IN-list) — the same footgun items.ts's
  // drawFromTopic already guards against, so only add the clause when there's something to
  // exclude (page 1's "nothing seen yet on this page" case included).
  if (opts.excludeIds.length > 0) {
    conditions.push(notInArray(item.id, opts.excludeIds));
  }
  return conditions;
}

/** How many un-homed rows one page's WILD slots draw from. Big enough that a page's one-or-two
 *  wild cards are a real choice, small enough to stay a projection of a few hundred rows. */
export const WILD_POOL_SIZE = 200;

/**
 * How many eligible rows one page's draws see per topic, and per (topic, source) within that
 * (09-08-26, docs/DESIGN_feed-pool-sampling.md). Before this, `getTopicPools` returned *every*
 * eligible row in every reachable topic — and `reachableTopics` (services/feed.ts) reaches
 * 101 of 104 topics from three picks, so every page dragged the whole corpus out of Postgres:
 * 133,698 rows / 22.4 MB at 122,458 items, and the dev server materialising that per request
 * grew to 2.6 GB in eight page loads. Sixty is generous: a page draws at most twelve cards and
 * rarely hits one topic more than four times, and `pickItem` still has room to reject most of a
 * sample for `sourceCap` / `lastSource` and find a card.
 *
 * The per-source cap is the diversity rule applied where it is cheapest. A blog-captured topic
 * (`illustration` is ~17,500 items, most from one blog) would otherwise fill its sixty with one
 * source and hand `pickItem` a sample `sourceCap` empties after three; twenty per source means
 * a topic's minority sources are always candidates. Not `FeedKnobs`: those are compose-side.
 */
export const TOPIC_POOL_SAMPLE = 60;
export const TOPIC_POOL_PER_SOURCE = 20;

/**
 * The WILD tier's pool (09-06-26, docs/PLAN_caption-less-and-wild.md T2 / D6): a deterministic
 * sample of eligible **un-homed** items — `topic_id IS NULL`, which since Cut 1 means "stored,
 * curated, and no topic in the vocabulary fits it". Nothing else in the feed can return one.
 *
 * **Sampled in SQL, deterministically.** `ORDER BY md5(id || '<seed>:<page>') LIMIT 200`:
 *  - not the whole set, because loading every un-homed row per request is exactly the
 *    whole-corpus-per-page problem `getTopicPools` had until 09-08-26 (it now samples the same
 *    way — see its header), and a walk of a tagless picture blog can add tens of thousands of
 *    un-homed rows in one night;
 *  - not `random()`, because SPEC §7 promises that refetching a cursor returns the same page, and
 *    feed.integration.test.ts pins it. `sampleKey` is `${seed}:${page}` from the cursor, so the
 *    sample is a pure function of the cursor exactly like every other part of a page.
 * md5 over tens of thousands of rows is milliseconds, and `idx_item_unhomed_score` (a partial
 * index on the NULL-topic rows) is what keeps the set being hashed small as the corpus grows.
 *
 * **No `type` filter** (D7). Ben asked for pictures and the un-homed pool is overwhelmingly
 * pictures, but excluding an un-homed pdr essay would be a rule with no reason behind it. If a
 * wild article card reads wrong on real pages, add `eq(item.type, "image")` here — one line,
 * written down so nobody has to rediscover that it was a choice.
 */
export async function getWildPool(opts: {
  userId: string;
  anchor: Date;
  scoreFloor: number;
  excludeIds: string[];
  /** `${seed}:${page}` — what makes the sample a pure function of the cursor. */
  sampleKey: string;
  limit?: number;
}): Promise<PoolItem[]> {
  const { db } = await import("./client");

  return db
    .select({
      id: item.id,
      topicId: item.topicId,
      source: item.source,
      curationScore: item.curationScore,
      aestheticTags: item.aestheticTags,
    })
    .from(item)
    .where(and(isNull(item.topicId), ...eligibilityConditions(db, opts)))
    .orderBy(sql`md5(${item.id} || ${opts.sampleKey})`)
    .limit(opts.limit ?? WILD_POOL_SIZE);
}

/**
 * Batch-inserts a page's items into `seen_item`. Called from the `feed.markSeen` mutation as of
 * 5.7 — the client acks a page it has actually received, rather than `getFeedPage` marking during
 * a render whose output may be thrown away.
 *
 * `onConflictDoNothing` on the composite `(userId, itemId)` primary key, so a re-ack — refetching
 * a cursor, or a remount replaying cached pages — never throws, and equally never moves an
 * existing row's `served_at`. First write wins, which is exactly what the cursor's anchor
 * arithmetic depends on (SPEC §7's stability promise; see services/feed.ts's cursor design note).
 */
export async function markSeen(
  userId: string,
  itemIds: string[],
  servedAt: Date,
): Promise<void> {
  if (itemIds.length === 0) return;
  const { db } = await import("./client");
  await db
    .insert(seenItem)
    .values(itemIds.map((itemId) => ({ userId, itemId, servedAt })))
    .onConflictDoNothing();
}

/**
 * The dev knob panel's un-burn (plan 09-05-26). Deletes this user's `seen_item` rows with
 * `served_at >= since` and returns how many went. Exposed only through `feed.forgetSince`, which
 * is gated on `feedDebugEnabled()` — in production nothing can reach this.
 *
 * Why it exists rather than "just don't ack while tuning": the cursor's anchor moves to each
 * page's `servedAt`, and the pool query excludes `served_at < anchor`. Within a session, the
 * previous page's ack is what keeps its items out of the next page. Tuning therefore acks like
 * production and forgets afterwards — the readouts stay honest and the corpus stays whole.
 */
export async function forgetSeenSince(
  userId: string,
  since: Date,
): Promise<number> {
  const { db } = await import("./client");
  const deleted = await db
    .delete(seenItem)
    .where(and(eq(seenItem.userId, userId), gte(seenItem.servedAt, since)))
    .returning({ itemId: seenItem.itemId });
  return deleted.length;
}
