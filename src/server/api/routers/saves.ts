// The `saves` router (SPEC §7). Both procedures protected — saving is inherently a per-user
// action, unlike `items.byId`'s public read.
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { getItemById } from "~/server/db/items";
import {
  getSavedItems,
  isItemSaved,
  saveItem,
  unsaveItem,
} from "~/server/db/saves";

export const savesRouter = createTRPCRouter({
  /**
   * Insert-or-delete toggle (SPEC §7): a second call on the same item flips it back off. Checks
   * current membership first (via `isItemSaved`) so unsaving never needs to touch `items` at all,
   * and only verifies the item actually exists (`NOT_FOUND` otherwise) on the save-it path — the
   * one direction where the `saved_item.item_id` foreign key would otherwise be the only thing
   * catching a bad id, as a 500 rather than a clean client error.
   */
  toggle: protectedProcedure
    .input(z.object({ itemId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const alreadySaved = await isItemSaved(ctx.user.id, input.itemId);

      if (alreadySaved) {
        await unsaveItem(ctx.user.id, input.itemId);
        return { saved: false } as const;
      }

      const item = await getItemById(input.itemId);
      if (!item) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `No item with id ${input.itemId}`,
        });
      }

      await saveItem(ctx.user.id, input.itemId);
      return { saved: true } as const;
    }),

  /** The `/saved` page's data source (SPEC §8.1) — most-recently-saved first. */
  list: protectedProcedure.query(({ ctx }) => getSavedItems(ctx.user.id)),
});
