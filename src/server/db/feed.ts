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

import type { Item } from "./items";
import { item, seenItem } from "./schema";

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
 */
export async function getTopicPools(
  topicIds: string[],
  opts: {
    userId: string;
    anchor: Date;
    scoreFloor: number;
    excludeIds: string[];
  },
): Promise<Map<string, Item[]>> {
  const pools = new Map<string, Item[]>();
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
  // notInArray(id, []) is invalid SQL (an empty IN-list) — the same footgun items.ts's
  // drawFromTopic already guards against, so only add the clause when there's something to
  // exclude (page 1's "nothing seen yet on this page" case included).
  if (opts.excludeIds.length > 0) {
    conditions.push(notInArray(item.id, opts.excludeIds));
  }

  const rows = await db
    .select()
    .from(item)
    .where(and(...conditions))
    .orderBy(asc(item.id));

  for (const row of rows) pools.get(row.topicId)?.push(row);
  return pools;
}

/**
 * Batch-inserts this page's served items into `seen_item`, `onConflictDoNothing` so refetching a
 * cursor — which deliberately re-marks the same items (SPEC §7's stability promise) — never
 * throws on the composite `(userId, itemId)` primary key.
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
