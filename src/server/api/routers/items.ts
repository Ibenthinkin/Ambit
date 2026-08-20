// The `items` router (SPEC §7). This router holds **both** of the API's deliberately public
// procedures — everything else in the app is protected. They exist for the same reason: they back
// `/i/[itemId]` (SPEC §8.1), a read-only page anyone with a link can view, invite or not.
//
//   - `byId` — the item itself.
//   - `wanderNext` (5.7) — the "where Ambit would wander next" teaser at the foot of that page.
//
// Both are intentional exceptions to SPEC §11's auth rule, and both are covered by the shared
// rate-limit middleware, which is what makes an unauthenticated read surface safe to expose.
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { getItemById } from "~/server/db/items";
import { getWanderNext } from "~/server/services/wander";

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

  /**
   * Three items the feed could have drifted to from this one, each labelled with the walk that
   * would have reached it (services/wander.ts).
   *
   * **Public on purpose, and safe by construction.** The teaser renders for a stranger who
   * followed a shared link, so it cannot be user-scoped — and it isn't: there is no `userId`
   * parameter to pass, the topic graph it walks is checked-in config, and the return shape is
   * `{id, title, reason}` and nothing more. Personalization is not something this procedure
   * declines to do; it is something it has no means to do.
   */
  wanderNext: publicProcedure
    .input(z.object({ itemId: z.string() }))
    .query(({ input }) => getWanderNext(input.itemId)),
});
