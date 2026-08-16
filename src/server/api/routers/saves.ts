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
  getCollectionForUser,
  getCollections,
  setItemCollection,
} from "~/server/db/collections";
import { getItemById } from "~/server/db/items";
import { getSavedCount, getSavedItems, unsaveItem } from "~/server/db/saves";

export const savesRouter = createTRPCRouter({
  /**
   * The save sheet's row list: every collection the user has, with its item count. Seeds the three
   * defaults (Articles / Art / Photos) on a user's first call — see `db/collections.ts`.
   */
  collections: protectedProcedure.query(({ ctx }) =>
    getCollections(ctx.user.id),
  ),

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
   * Returns the collection's name so the caller can toast "Saved to {name}" without a second round
   * trip.
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

      await setItemCollection(ctx.user.id, input.itemId, input.collectionId);
      return { collectionName: collection.name } as const;
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
});
