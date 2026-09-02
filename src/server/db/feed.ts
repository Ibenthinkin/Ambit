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
  lt,
  notExists,
  notInArray,
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
  /** Never null here: `getTopicPools` filters with `inArray(item.topicId, …)`, which no NULL row
   *  matches, so an un-homed item (Cut 1) cannot enter a pool. The column is `string | null` on
   *  `Item`; this is the one place the narrowing is written down. */
  topicId: string;
};

/**
 * One SELECT per page, not one per topic (SPEC §9's "slot plan first, pools second" — see
 * services/feed.ts's `getFeedPage`): every item across `topicIds` that's above `scoreFloor` and
 * that this user hasn't been served before `anchor` (`seen_item.served_at < anchor` — a strict
 * `<`, deliberately not `<=`; see schema.ts's comment on `seenItem.servedAt` for why), excluding
 * `excludeIds` (the previous page's own item ids — a separate guard because they share `anchor`
 * exactly, so the `served_at < anchor` clause alone wouldn't catch them). Rides `idx_item_topic_
 * score` (topicId, curationScore) for the `IN (...) AND curationScore >=` half of the filter.
 *
 * Returns a Map keyed by every id in `topicIds` (even ones with zero eligible items — an empty
 * array, not a missing key) so services/feed.ts's `composePage` can do a plain `.get(topicId)`
 * without a null-vs-missing distinction to worry about.
 *
 * `ORDER BY id` is load-bearing, not cosmetic: `composePage`'s `weightedPick` walks each pool's
 * array in order, so SPEC §7's "refetching the same cursor returns a stable page" promise depends
 * on this query returning rows in the *same* order every time it's asked the same question.
 * Postgres makes no ordering guarantee without an explicit `ORDER BY` — a query plan flip as the
 * table grows, a parallel scan, or a HOT update moving a tuple could otherwise reorder results
 * between two calls with identical inputs, silently changing which item a fixed rng draw lands on.
 *
 * **A projection, not whole rows** (Phase 7.3, decision D6). This used to be a bare `select()`,
 * and on 08-28-26 that meant **9,848 full rows — about 35.8 MB — dragged out of Postgres to
 * compose twelve cards**. Most of the weight was the `body` column: ~2,200 Wikipedia rows carry
 * one, averaging 13 KB, and `composePage` never reads it. It reads exactly five fields, which is
 * what `PoolItem` is. The ~12 winners are re-fetched whole afterwards, by id, in one query
 * (`getItemsByIds` → `getFeedPage`) — twelve full rows instead of ten thousand.
 *
 * On this laptop, over a local socket, that was worth ~10 ms; the reason to do it anyway is the
 * VPS in 8.1, where the database is a network hop away and 35 MB per page is the whole latency
 * budget.
 */
export async function getTopicPools(
  topicIds: string[],
  opts: {
    userId: string;
    anchor: Date;
    scoreFloor: number;
    excludeIds: string[];
  },
): Promise<Map<string, PoolItem[]>> {
  const pools = new Map<string, PoolItem[]>();
  for (const topicId of topicIds) pools.set(topicId, []);
  if (topicIds.length === 0) return pools;

  const { db } = await import("./client");

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
    inArray(item.topicId, topicIds),
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

  const rows = await db
    .select({
      id: item.id,
      topicId: item.topicId,
      source: item.source,
      curationScore: item.curationScore,
      aestheticTags: item.aestheticTags,
    })
    .from(item)
    .where(and(...conditions))
    .orderBy(asc(item.id));

  for (const row of rows) {
    // Unreachable in practice — see PoolItem's comment — but the projection is typed
    // `string | null` because the column is, and a `!` here would hide the day this ever changes.
    if (row.topicId === null) continue;
    pools.get(row.topicId)?.push({ ...row, topicId: row.topicId });
  }
  return pools;
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
