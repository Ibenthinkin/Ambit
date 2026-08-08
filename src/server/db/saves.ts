// Repository for `saved_item` (SPEC §6.3, §3.4). Real as of Phase 4.2, backing the
// `saves.toggle`/`saves.list` tRPC procedures. Every function here is user-scoped by design:
// `saveItem`/`unsaveItem`/`isItemSaved`/`getSavedItems` all take `userId` explicitly so a caller
// can't accidentally query across users (SPEC §11's authorization rule).
import { and, desc, eq } from "drizzle-orm";

import type { Item } from "~/server/db/items";
import { item, savedItem } from "~/server/db/schema";

/**
 * Inserts a `saved_item` row. `onConflictDoNothing` on the (userId, itemId) primary key — saving
 * an already-saved item is a no-op, not an error, which keeps the `saves.toggle` procedure's logic
 * simple (it only calls this after confirming via `isItemSaved` that the item isn't saved yet, but
 * this function stays safe to call either way).
 */
export async function saveItem(userId: string, itemId: string): Promise<void> {
  // Dynamic import — same CI-has-no-env-vars reason as every other repo file in this codebase
  // (see items.ts's drawFromTopic comment for the canonical explanation).
  const { db } = await import("./client");
  await db.insert(savedItem).values({ userId, itemId }).onConflictDoNothing();
}

/** Deletes a `saved_item` row, if one exists. A no-op (not an error) when it doesn't. */
export async function unsaveItem(
  userId: string,
  itemId: string,
): Promise<void> {
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
 */
export async function getSavedItems(userId: string): Promise<Item[]> {
  const { db } = await import("./client");
  const rows = await db
    .select({ item })
    .from(savedItem)
    .innerJoin(item, eq(savedItem.itemId, item.id))
    .where(eq(savedItem.userId, userId))
    .orderBy(desc(savedItem.savedAt));
  return rows.map((row) => row.item);
}
