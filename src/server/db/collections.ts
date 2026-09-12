// Repository for `collection` (SPEC §5.4c, §6.3) — the named buckets a saved item lands in,
// backing the redesign's save-to-collection sheet (Phase 5.5). Every function is user-scoped by
// design: `userId` is always an explicit parameter so a caller can't accidentally read or write
// across users (SPEC §11's authorization rule), and `getCollectionForUser` exists specifically so
// the router can prove a client-supplied `collectionId` belongs to the caller.
import { and, asc, count, eq, isNotNull, lte, sql } from "drizzle-orm";

import { imageSrc } from "~/lib/image-src";
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
   * The picture srcs of the four most recently saved *image* items in this collection, newest
   * first — `[]` when the collection is empty or holds only articles. Srcs, not stored URLs:
   * `/api/img/<itemId>` through `lib/image-src.ts`, because the page's CSP allows only same-origin
   * images and a raw museum URL renders as a broken image. The Collections tab paints them as a 2×2
   * mosaic and every picker row as a 36 px one (docs/DESIGN_list-screens.md §2, §7);
   * `TileActions` ignores the field, which is why it could change shape here rather than fork into
   * a second read.
   */
  covers: string[];
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

/** A face is four pictures; the fifth is the one a 2×2 has no cell for. */
export const COVER_COUNT = 4;

/**
 * Attaches each collection's cover images — the four most recently saved image items in it
 * (docs/DESIGN_list-screens.md §2). A second round trip rather than a join onto the count query
 * above, because the two want different shapes: the count is a `GROUP BY` aggregate, and a face is
 * specific rows per group.
 *
 * `row_number() over (partition by collection_id order by saved_at desc)` numbers every collected
 * picture inside its own collection, newest save first, and the outer query keeps the rows
 * numbered ≤ `COVER_COUNT`. (Until 09-12-26 this was a `DISTINCT ON`, which is Postgres' answer to
 * "the first row of each group" — exactly one, and a face holds four.)
 *
 * Only image items qualify (`imageUrl IS NOT NULL`), so an article-only collection reports `[]` and
 * the tile falls back to its bookmark placeholder — a cover slot is a picture or it's nothing.
 */
async function withCovers(
  userId: string,
  rows: Omit<CollectionWithCount, "covers">[],
): Promise<CollectionWithCount[]> {
  if (rows.length === 0) return [];
  const { db } = await import("./client");

  // Rank every collected picture inside its collection, newest save first. The filter is applied
  // *before* ranking rather than after, for the same reason it was before the `DISTINCT ON`: an
  // uncollected save (`collection_id` null) belongs to no tile, and an article cannot be a cover —
  // filtered afterwards, an article that is the newest save would take slot 1 and leave a hole.
  const ranked = db
    .select({
      collectionId: savedItem.collectionId,
      itemId: item.id,
      imageUrl: item.imageUrl,
      n: sql<number>`row_number() over (partition by ${savedItem.collectionId} order by ${savedItem.savedAt} desc)`.as(
        "n",
      ),
    })
    .from(savedItem)
    .innerJoin(item, eq(item.id, savedItem.itemId))
    .where(
      and(
        eq(savedItem.userId, userId),
        isNotNull(savedItem.collectionId),
        isNotNull(item.imageUrl),
      ),
    )
    .as("ranked");

  const covers = await db
    .select({
      collectionId: ranked.collectionId,
      itemId: ranked.itemId,
      imageUrl: ranked.imageUrl,
    })
    .from(ranked)
    .where(lte(ranked.n, COVER_COUNT))
    // `n` ascending is newest-first, which is the order the mosaic fills its cells in.
    .orderBy(ranked.collectionId, ranked.n);

  const byCollection = new Map<string, string[]>();
  for (const row of covers) {
    // Both non-null by the WHERE above; the guard narrows the types rather than handling a case.
    if (!row.collectionId || !row.imageUrl) continue;
    const list = byCollection.get(row.collectionId) ?? [];
    list.push(imageSrc(row.itemId, row.imageUrl));
    byCollection.set(row.collectionId, list);
  }
  return rows.map((row) => ({
    ...row,
    covers: byCollection.get(row.id) ?? [],
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
