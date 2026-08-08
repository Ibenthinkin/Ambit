// The `items` router (SPEC §7). `byId` is the one deliberately public procedure in the whole API
// — it backs `/i/[itemId]` (SPEC §8.1), a read-only page anyone with a link can view, invite or
// not. Every other router in this app is protected; this is the sole, intentional exception (SPEC
// §11).
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { getItemById } from "~/server/db/items";

export const itemsRouter = createTRPCRouter({
  byId: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const found = await getItemById(input.id);
      if (!found) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `No item with id ${input.id}`,
        });
      }
      return found;
    }),
});
