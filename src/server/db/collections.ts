// Repository for `collection` (SPEC §5.4c, §6.3) — the named buckets a saved item lands in,
// backing the redesign's save-to-collection sheet (Phase 5.5). Every function is user-scoped by
// design: `userId` is always an explicit parameter so a caller can't accidentally read or write
// across users (SPEC §11's authorization rule), and `getCollectionForUser` exists specifically so
// the router can prove a client-supplied `collectionId` belongs to the caller.
import { and, asc, count, desc, eq, isNotNull } from "drizzle-orm";

import { collection, item, savedItem } from "~/server/db/schema";

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
  /**
   * The image URL of the most recently saved *image* item in this collection, or null when the
   * collection is empty or holds only articles. Phase 5.10's Profile grid paints it as the tile's
   * cover; the two sheets that predate it simply ignore the field, which is why this could be
   * added to the shared shape rather than forked into a second read.
   */
  cover: string | null;
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

  let rows = await read();
  if (rows.length === 0) {
    // NOTE, still live after 5.10 (creation landed; deletion did not): this keys seeding on "the
    // user has no collections", not "the user has never been seeded". Today those are the same
    // thing, because collections can't be deleted. Once they can, a user who deliberately deletes
    // all three defaults gets them silently recreated on their next sheet open, with no way to opt
    // out — so deletion needs a per-user `collections_seeded_at` marker (or equivalent) landing
    // with it.
    await seedDefaultCollections(userId);
    rows = await read();
  }

  return withCovers(userId, rows);
}

/**
 * Attaches each collection's cover image — the most recently saved image item in it (Phase 5.10's
 * Profile grid). A second round trip rather than a join onto the count query above, because the
 * two want different shapes: the count is a `GROUP BY` aggregate, and a cover is one specific row
 * per group. `DISTINCT ON` is Postgres' own answer to "the first row of each group under this
 * ordering", so the ordering here isn't cosmetic — `collection_id` first is what `DISTINCT ON`
 * requires, and `saved_at DESC` is what makes the surviving row the newest save.
 *
 * Only image items qualify (`imageUrl IS NOT NULL`), so an article-only collection reports null and
 * the tile falls back to its bookmark placeholder — a cover slot is a picture or it's nothing.
 */
async function withCovers(
  userId: string,
  rows: Omit<CollectionWithCount, "cover">[],
): Promise<CollectionWithCount[]> {
  if (rows.length === 0) return [];
  const { db } = await import("./client");

  const covers = await db
    .selectDistinctOn([savedItem.collectionId], {
      collectionId: savedItem.collectionId,
      imageUrl: item.imageUrl,
    })
    .from(savedItem)
    .innerJoin(item, eq(item.id, savedItem.itemId))
    .where(
      and(
        eq(savedItem.userId, userId),
        // Uncollected saves (a null `collection_id`) belong to no tile, and an item with no image
        // can't be a cover — both are excluded here rather than filtered out afterwards so the
        // `DISTINCT ON` picks the newest *qualifying* save rather than discarding a group whose
        // newest save happens to be an article.
        isNotNull(savedItem.collectionId),
        isNotNull(item.imageUrl),
      ),
    )
    .orderBy(savedItem.collectionId, desc(savedItem.savedAt));

  const byCollection = new Map(
    covers.map((row) => [row.collectionId, row.imageUrl]),
  );
  return rows.map((row) => ({
    ...row,
    cover: byCollection.get(row.id) ?? null,
  }));
}

/**
 * Creates one named collection for a user — Phase 5.10's new-collection sheet on `/profile`.
 *
 * `onConflictDoNothing` against the same `(user_id, name)` unique constraint the seeding insert
 * uses, so a duplicate name returns `undefined` rather than throwing: the caller maps that to a
 * clean `CONFLICT` the sheet can render inline. (House idiom — the "undefined means the constraint
 * caught it" shape is exactly what `getCollectionForUser` does for authorization.)
 *
 * One interplay worth naming: a create that lands *before* this user has ever read their
 * collections leaves them with one collection and therefore suppresses the lazy default seeding
 * above (which triggers only on a zero-row read). Unreachable through the UI — the Profile screen
 * renders the grid, and therefore reads, before the sheet can be opened — and accepted rather than
 * defended against, because the defense (seeding here too) would double the write on every create.
 */
export async function createCollection(
  userId: string,
  name: string,
): Promise<{ id: string; name: string } | undefined> {
  const { db } = await import("./client");
  const [row] = await db
    .insert(collection)
    .values({ userId, name })
    .onConflictDoNothing()
    .returning({ id: collection.id, name: collection.name });
  return row;
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
