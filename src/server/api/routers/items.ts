// The `items` router (SPEC §7). This router holds **all three** of the API's deliberately public
// procedures — everything else in the app is protected. They exist for the same reason: they back
// the app's two public routes, `/i/[itemId]` and `/g/[itemId]` (SPEC §8.1), which anyone with a
// link can view, invite or not.
//
//   - `byId` — the item itself.
//   - `wanderNext` (5.7) — the "where Ambit would wander next" teaser at the foot of that page.
//   - `galleryRail` (5.8) — the endless images-only rail the immersive gallery swipes through.
//
// All three are intentional exceptions to SPEC §11's auth rule, and all three are covered by the
// shared rate-limit middleware, which is what makes an unauthenticated read surface safe to expose.
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { getItemById } from "~/server/db/items";
import { getGalleryRail } from "~/server/services/gallery-rail";
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

  /**
   * The next stretch of the gallery's wander rail from `itemId` (services/gallery-rail.ts).
   *
   * **Public for the same reason as `wanderNext`**: the gallery opens from the hero on the public
   * `/i/[itemId]`, and `/g/[itemId]` is itself deep-linkable — the person swiping may be a stranger
   * who followed a shared link. Safe by the same construction, too: no `userId` parameter exists,
   * the topic graph it walks is checked-in config, and the return shape is public item data only.
   *
   * **Draws here are reads. This path writes no `seen_item` rows, ever.** That sentence exists
   * because of the 08-20-26 corpus-burn postmortem (log.md): render-time seen-marking spent 1,116
   * items in six minutes on pages nobody read. An endless rail drawn from `feed.page` would have
   * re-created the same defect one swipe at a time, which is why the rail is its own machinery.
   */
  galleryRail: publicProcedure
    .input(
      z.object({
        itemId: z.string(),
        count: z.number().int().min(1).max(16).default(8),
        // The cap bounds the SQL `IN`-list this becomes. A rail longer than 200 cells simply stops
        // excluding its oldest ids, which accepts a rare repeat far behind the reader rather than
        // letting one query grow without limit — the right trade for a sequence with no end.
        exclude: z.array(z.string()).max(200).default([]),
        // Zod-bounded mirror of `Partial<GalleryKnobs>`, same contract as `feed.page`'s knobs:
        // accepted always, applied only when the server's FEED_DEBUG gate is on (that decision
        // belongs to `getGalleryRail`, so the router never does its own redundant gating that
        // could disagree with it), never an error either way.
        knobs: z
          .object({ wildcardChance: z.number().min(0).max(1) })
          .partial()
          .optional(),
      }),
    )
    .query(({ input }) =>
      getGalleryRail(input.itemId, {
        count: input.count,
        excludeIds: input.exclude,
        knobs: input.knobs,
      }),
    ),
});
