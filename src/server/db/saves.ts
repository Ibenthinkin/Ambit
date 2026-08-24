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
 * Whether `itemId` is currently saved by `userId` — what `saves.saveToCollection` uses to tell a
 * *new* save (which bumps the topic's weight — Phase 6.1) from a move between collections (which
 * doesn't). Split out from `getSavedItems` (which returns full `Item` rows, more than a single
 * membership check needs to fetch).
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
 * Which collection `itemId` is filed in for `userId`, or `undefined` if the user hasn't saved it
 * at all. Backs `saves.forItem`, which is what tells an item page's bookmark control whether to
 * render lit, and which row of the save sheet to mark "Already saved here".
 *
 * `null` and `undefined` mean different things here and the distinction is load-bearing:
 * `undefined` is "not saved", while `null` is "saved but uncollected" — a real state, since
 * `saved_item.collection_id` is nullable.
 */
export async function getSavedItemCollection(
  userId: string,
  itemId: string,
): Promise<string | null | undefined> {
  const { db } = await import("./client");
  const [row] = await db
    .select({ collectionId: savedItem.collectionId })
    .from(savedItem)
    .where(and(eq(savedItem.userId, userId), eq(savedItem.itemId, itemId)))
    .limit(1);
  return row ? row.collectionId : undefined;
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

/**
 * The pure half of taste-keyword derivation (Phase 6.1), split out so it can be unit-tested
 * without a database. `tagLists` is expected most-recent-save first, each item's stored tag order
 * preserved; the flatten keeps that order, so the result is recency-ordered. Dedupe is
 * case-insensitive, keeping the first-seen form — matching `pickItem`'s lowercase comparison, so
 * "Etching" and "etching" can never both occupy a slot in the window.
 */
export function deriveTasteKeywords(
  tagLists: string[][],
  cap: number,
): string[] {
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const tag of tagLists.flat()) {
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    keywords.push(tag);
    if (keywords.length >= cap) break;
  }
  return keywords;
}

/**
 * The user's current taste keywords: the last-`cap` unique `aesthetic_tags` across their most
 * recent saves, recency-ordered (phase0's rolling last-24 window, SPEC §9). **Derived at feed
 * time, never stored** — a deliberate divergence from phase0's persisted profile: there is no
 * schema to migrate, nothing to decay, and unsaving an item self-heals the list on the next
 * read. The cost is one extra small query per feed page, which is fine.
 *
 * `scanLimit` bounds the row scan: 30 recent saves is comfortably enough to fill a 24-keyword
 * window (items average several tags each) without ever pulling a power-user's full history.
 */
export async function getTasteKeywords(
  userId: string,
  opts: { cap?: number; scanLimit?: number } = {},
): Promise<string[]> {
  const cap = opts.cap ?? 24;
  const scanLimit = opts.scanLimit ?? 30;
  const { db } = await import("./client");
  const rows = await db
    .select({ aestheticTags: item.aestheticTags })
    .from(savedItem)
    .innerJoin(item, eq(savedItem.itemId, item.id))
    .where(eq(savedItem.userId, userId))
    .orderBy(desc(savedItem.savedAt))
    .limit(scanLimit);
  return deriveTasteKeywords(
    rows.map((row) => row.aestheticTags),
    cap,
  );
}
