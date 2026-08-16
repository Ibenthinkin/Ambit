// Repository for `collection` (SPEC §5.4c, §6.3) — the named buckets a saved item lands in,
// backing the redesign's save-to-collection sheet (Phase 5.5). Every function is user-scoped by
// design: `userId` is always an explicit parameter so a caller can't accidentally read or write
// across users (SPEC §11's authorization rule), and `getCollectionForUser` exists specifically so
// the router can prove a client-supplied `collectionId` belongs to the caller.
import { and, asc, count, eq } from "drizzle-orm";

import { collection, savedItem } from "~/server/db/schema";

/**
 * The three collections every user starts with. Exported because the seeding logic below and its
 * tests both need them, and because the order here is the order they appear in the sheet — see
 * `seedDefaultCollections` for how that order is made to survive a round trip through Postgres.
 */
export const DEFAULT_COLLECTION_NAMES = ["Articles", "Art", "Photos"] as const;

export interface CollectionWithCount {
  id: string;
  name: string;
  createdAt: Date;
  itemCount: number;
}

/**
 * Inserts the three default collections for a user, idempotently.
 *
 * Two things here are deliberate:
 *
 * 1. `onConflictDoNothing` against the `(user_id, name)` unique constraint. This is what makes
 *    lazy seeding safe under concurrency — two simultaneous first-reads (a double-mounted React 19
 *    dev render is enough to produce them) both run this insert, and the loser becomes a no-op
 *    rather than a duplicate "Articles" row.
 * 2. **Staggered `createdAt` values.** All three rows would otherwise share a single `now()` —
 *    Postgres' `now()` is transaction start time, identical for every row in one statement — which
 *    would leave `ORDER BY created_at` with a three-way tie and no stable sheet order. Offsetting
 *    by the index costs nothing, keeps the ordering column honest ("the defaults were created
 *    first, in this order"), and means a collection the user makes later sorts naturally after
 *    them.
 */
async function seedDefaultCollections(userId: string): Promise<void> {
  // Dynamic import — same CI-has-no-env-vars reason as every other repo file in this codebase
  // (see items.ts's drawFromTopic comment for the canonical explanation).
  const { db } = await import("./client");
  const now = Date.now();
  await db
    .insert(collection)
    .values(
      DEFAULT_COLLECTION_NAMES.map((name, i) => ({
        userId,
        name,
        createdAt: new Date(now + i),
      })),
    )
    .onConflictDoNothing();
}

/**
 * A user's collections with their item counts — the save sheet's only read (SPEC §7's
 * `saves.collections`).
 *
 * Seeds the three defaults on first call, which is why this is the *only* place seeding happens:
 * nothing before Phase 5.5 created collections, so seeding on read gets existing users theirs
 * without a backfill migration, and every path that shows collections goes through here first.
 *
 * The count is a `LEFT JOIN` so an empty collection reports `0` rather than dropping out of the
 * result entirely — `count(savedItem.itemId)` counts non-null rows, so the left join's null row
 * contributes nothing. The join also re-asserts `userId` even though `collection_id` already
 * implies it (a collection belongs to exactly one user): it costs nothing and keeps this query
 * obeying the "every user-scoped query filters by userId" rule on its own terms.
 */
export async function getCollections(
  userId: string,
): Promise<CollectionWithCount[]> {
  const { db } = await import("./client");

  const read = async () =>
    db
      .select({
        id: collection.id,
        name: collection.name,
        createdAt: collection.createdAt,
        itemCount: count(savedItem.itemId),
      })
      .from(collection)
      .leftJoin(
        savedItem,
        and(
          eq(savedItem.collectionId, collection.id),
          eq(savedItem.userId, userId),
        ),
      )
      .where(eq(collection.userId, userId))
      .groupBy(collection.id)
      .orderBy(asc(collection.createdAt));

  const rows = await read();
  if (rows.length > 0) return rows;

  // NOTE for 5.10, when collection *creation* (and eventually deletion) lands: this keys seeding on
  // "the user has no collections", not "the user has never been seeded". Today those are the same
  // thing, because collections can't be deleted. Once they can, a user who deliberately deletes all
  // three defaults gets them silently recreated on their next sheet open, with no way to opt out —
  // so deletion needs a per-user `collections_seeded_at` marker (or equivalent) landing with it.
  await seedDefaultCollections(userId);
  return read();
}

/**
 * A single collection, but only if `userId` owns it — the router's authorization check before
 * writing a client-supplied `collectionId` (SPEC §7). Returns `undefined` for both "no such
 * collection" and "someone else's collection", which is the point: the caller maps both to
 * `NOT_FOUND` so a probe can't distinguish a real id from a fake one.
 */
export async function getCollectionForUser(
  userId: string,
  collectionId: string,
): Promise<{ id: string; name: string } | undefined> {
  const { db } = await import("./client");
  const [row] = await db
    .select({ id: collection.id, name: collection.name })
    .from(collection)
    .where(and(eq(collection.id, collectionId), eq(collection.userId, userId)))
    .limit(1);
  return row;
}

/**
 * Files an item into a collection, saving it first if it wasn't already.
 *
 * One statement does both because `saved_item`'s primary key is `(user_id, item_id)`: the insert
 * covers a first-time save, and `onConflictDoUpdate` covers re-filing an already-saved item. That
 * update-in-place *is* the "one collection per item" rule from the design — picking a different
 * collection moves the item rather than adding a second membership (SPEC §5.4).
 *
 * Callers must have verified the collection belongs to this user first (`getCollectionForUser`);
 * this function trusts its arguments, like every other repo write here.
 */
export async function setItemCollection(
  userId: string,
  itemId: string,
  collectionId: string,
): Promise<void> {
  const { db } = await import("./client");
  await db
    .insert(savedItem)
    .values({ userId, itemId, collectionId })
    .onConflictDoUpdate({
      target: [savedItem.userId, savedItem.itemId],
      set: { collectionId },
    });
}
