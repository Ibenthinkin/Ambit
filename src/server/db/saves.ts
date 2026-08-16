// Repository for `saved_item` (SPEC §6.3, §3.4). Real as of Phase 4.2, backing the
// `saves.toggle`/`saves.list` tRPC procedures. Every function here is user-scoped by design:
// `saveItem`/`unsaveItem`/`isItemSaved`/`getSavedItems` all take `userId` explicitly so a caller
// can't accidentally query across users (SPEC §11's authorization rule).
import { and, count, desc, eq } from "drizzle-orm";

import type { Item } from "~/server/db/items";
import { item, savedItem } from "~/server/db/schema";

// Note on where saving lives (Phase 5.5): the *write* path is `collections.ts`'s
// `setItemCollection`, because every save in the redesign goes through the save-to-collection
// sheet and therefore always carries a collection. There is deliberately no collection-less
// `saveItem` here anymore — the old `saves.toggle` procedure it existed for was removed as dead
// code, and a second, untested write path into this table is exactly what that removal was
// cleaning up. This file keeps the reads, the delete, and the membership check.

/** Deletes a `saved_item` row, if one exists. A no-op (not an error) when it doesn't. */
export async function unsaveItem(
  userId: string,
  itemId: string,
): Promise<void> {
  // Dynamic import — same CI-has-no-env-vars reason as every other repo file in this codebase
  // (see items.ts's drawFromTopic comment for the canonical explanation).
  const { db } = await import("./client");
  await db
    .delete(savedItem)
    .where(and(eq(savedItem.userId, userId), eq(savedItem.itemId, itemId)));
}

/**
 * Whether `itemId` is currently saved by `userId` — the read the `saves.toggle` procedure needs to
 * decide which direction to toggle, split out from `getSavedItems` (which returns full `Item`
 * rows, more than a single membership check needs to fetch).
 */
export async function isItemSaved(
  userId: string,
  itemId: string,
): Promise<boolean> {
  const { db } = await import("./client");
  const [row] = await db
    .select({ userId: savedItem.userId })
    .from(savedItem)
    .where(and(eq(savedItem.userId, userId), eq(savedItem.itemId, itemId)))
    .limit(1);
  return row !== undefined;
}

/**
 * A user's saved items, most-recently-saved first (SPEC §7's `saves.list`) — joins `saved_item` to
 * `item` so the caller gets full item records, not just ids.
 *
 * `collectionId` narrows to one collection, which is what backs `/saved`'s collection chips (5.9).
 * Omitting it returns everything the user has kept, *including* items whose `collection_id` is
 * null ("saved but uncollected") — the design's "Everything kept" row.
 */
export async function getSavedItems(
  userId: string,
  opts: { collectionId?: string } = {},
): Promise<Item[]> {
  const { db } = await import("./client");
  const rows = await db
    .select({ item })
    .from(savedItem)
    .innerJoin(item, eq(savedItem.itemId, item.id))
    .where(
      opts.collectionId === undefined
        ? eq(savedItem.userId, userId)
        : and(
            eq(savedItem.userId, userId),
            eq(savedItem.collectionId, opts.collectionId),
          ),
    )
    .orderBy(desc(savedItem.savedAt));
  return rows.map((row) => row.item);
}

/**
 * How many items the user has saved in total — the "Everything kept" row's count in the pill's
 * collections sheet. Split out from `getSavedItems` because that row needs only the number, and
 * fetching every full `item` record to call `.length` on it would be absurd once a user has kept a
 * few hundred things.
 */
export async function getSavedCount(userId: string): Promise<number> {
  const { db } = await import("./client");
  const [row] = await db
    .select({ total: count() })
    .from(savedItem)
    .where(eq(savedItem.userId, userId));
  return row?.total ?? 0;
}
