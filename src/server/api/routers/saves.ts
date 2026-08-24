// The `saves` router (SPEC §7). Every procedure protected — saving is inherently a per-user
// action, unlike `items.byId`'s public read.
//
// Phase 5.5 replaced the original `toggle` with the three collection-aware procedures below. The
// toggle was verified dead at that point (nothing in `src/` or `e2e/` called it, not even the
// `/feed` placeholder), and a collection-less save is semantically wrong now that every save in
// the redesign goes through the save-to-collection sheet.
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  createCollection,
  getCollectionForUser,
  getCollections,
  setItemCollection,
} from "~/server/db/collections";
import { getItemById } from "~/server/db/items";
import {
  getSavedCount,
  getSavedItems,
  getSavedItemCollection,
  isItemSaved,
  unsaveItem,
} from "~/server/db/saves";
import { bumpTopicWeight, getTopicLabel } from "~/server/db/topics";

export const savesRouter = createTRPCRouter({
  /**
   * The save sheet's row list: every collection the user has, with its item count. Seeds the three
   * defaults (Articles / Art / Photos) on a user's first call — see `db/collections.ts`.
   */
  collections: protectedProcedure.query(({ ctx }) =>
    getCollections(ctx.user.id),
  ),

  /**
   * Makes a new named collection (Phase 5.10's new-collection sheet on `/profile`).
   *
   * A duplicate name comes back from the repo as `undefined` (its `onConflictDoNothing` swallowed
   * the write) and becomes a `CONFLICT` the sheet renders inline, under the field, without closing.
   *
   * Flag, accepted: the `(user_id, name)` unique constraint is **case-sensitive**, so "art" and
   * "Art" can coexist. Case-insensitive uniqueness would mean a `citext` column or a functional
   * index, and neither is worth a migration for a list the user reads whole and can't yet rename.
   */
  createCollection: protectedProcedure
    .input(z.object({ name: z.string().trim().min(1).max(40) }))
    .mutation(async ({ ctx, input }) => {
      const row = await createCollection(ctx.user.id, input.name);
      if (!row) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `You already have a collection called "${input.name}"`,
        });
      }
      return row;
    }),

  /**
   * Files an item into a collection, saving it if it wasn't already. Picking a different
   * collection for an already-saved item *moves* it (SPEC §5.4's one-collection-per-item rule).
   *
   * The two guards run before any write, and their order matters less than their existence:
   *
   * 1. The item has to exist, or the `saved_item.item_id` foreign key would be the only thing
   *    catching a bad id — as a 500 rather than a clean client error.
   * 2. The collection has to exist **and belong to the caller**. This is the only place in the API
   *    where a client supplies the id of a *user-owned row* (`items.byId` is public; everything
   *    else is scoped by `ctx.user.id` alone), so it's the only place that check is needed — and
   *    it's why `getCollectionForUser` returns `undefined` for "someone else's" as well as "no
   *    such": both map to `NOT_FOUND` here, so probing can't tell a real id from a fake one.
   *
   * Returns the collection's name so the caller can toast "Saved to {name}" without a second
   * round trip — plus, on a *new* save (not a move between collections), a `drift` field naming
   * the topic whose weight just got bumped (Phase 6.1, SPEC §9): the toast grows into
   * "Saved to Art · Now drifting toward Cartography". `drift` is null on a move, because moving
   * an item between collections is housekeeping, not a fresh signal of interest.
   */
  saveToCollection: protectedProcedure
    .input(z.object({ itemId: z.string(), collectionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const item = await getItemById(input.itemId);
      if (!item) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `No item with id ${input.itemId}`,
        });
      }

      const collection = await getCollectionForUser(
        ctx.user.id,
        input.collectionId,
      );
      if (!collection) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `No collection with id ${input.collectionId}`,
        });
      }

      const wasSaved = await isItemSaved(ctx.user.id, input.itemId);
      await setItemCollection(ctx.user.id, input.itemId, input.collectionId);
      if (wasSaved) {
        return { collectionName: collection.name, drift: null } as const;
      }
      // Accepted race: two concurrent first-saves of the same item can both see `wasSaved ===
      // false` and double-bump. The client's in-flight guard makes that rare, and WEIGHT_CAP
      // bounds the damage — not worth a serializable transaction.
      const bumped = await bumpTopicWeight(ctx.user.id, item.topicId);
      const topicLabel = (await getTopicLabel(item.topicId)) ?? item.topicId;
      return {
        collectionName: collection.name,
        drift: { topicLabel, isNew: bumped.isNew },
      } as const;
    }),

  /**
   * Removes a save entirely. Deleting the `saved_item` row takes its `collection_id` with it, so
   * there's no separate "remove from collection" step. A no-op on an item that isn't saved.
   */
  unsave: protectedProcedure
    .input(z.object({ itemId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await unsaveItem(ctx.user.id, input.itemId);
      return { saved: false } as const;
    }),

  /**
   * The `/saved` page's data source (SPEC §8.1) — most-recently-saved first. `collectionId`
   * narrows to a single collection (5.9's chips); omitting it returns everything the user has
   * kept, including items in no collection at all.
   */
  list: protectedProcedure
    .input(z.object({ collectionId: z.string().optional() }).optional())
    .query(({ ctx, input }) =>
      getSavedItems(ctx.user.id, { collectionId: input?.collectionId }),
    ),

  /** Total number of saved items — the "Everything kept" row's count in the collections sheet. */
  count: protectedProcedure.query(({ ctx }) => getSavedCount(ctx.user.id)),

  /**
   * Whether the caller has saved one specific item, and where they filed it — what an item page's
   * bookmark control needs to render lit rather than idle, and what tells the save sheet which row
   * to mark "Already saved here".
   *
   * A flat `{saved, collectionId}` rather than `string | null | undefined`, because "saved but
   * uncollected" and "not saved" are genuinely different states and a single nullable field
   * collapses them (see `getSavedItemCollection`'s own note).
   */
  forItem: protectedProcedure
    .input(z.object({ itemId: z.string() }))
    .query(async ({ ctx, input }) => {
      const collectionId = await getSavedItemCollection(
        ctx.user.id,
        input.itemId,
      );
      return collectionId === undefined
        ? ({ saved: false, collectionId: null } as const)
        : ({ saved: true, collectionId } as const);
    }),
});
