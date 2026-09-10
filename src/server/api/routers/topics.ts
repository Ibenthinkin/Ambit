// The `topics` router (SPEC §7): the pickers' read (`list`) and write (`setMine`) — onboarding's
// four stages and /profile/topics's four tabs, both of them chip grids over the same list.
// Both protected — even `list` needs a session, since there's no anonymous-browsing use for the
// topic catalog (unlike `items.byId`, which genuinely backs a public route).
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { getUserTopicIds, listTopics, setUserTopics } from "~/server/db/topics";

export const topicsRouter = createTRPCRouter({
  /** Every pickable topic — faceted, ordered by label — for onboarding's stages and
   *  /profile/topics's tabs (SPEC §8.2). */
  list: protectedProcedure.query(() => listTopics()),

  /**
   * The ids the caller has currently picked (Phase 5.10) — what Settings' "What you see" row labels
   * itself from, and what its sheet opens pre-selected. Ids only, not weights: the weights are the
   * feed engine's business, and a picker that could read them would soon be a picker that shows
   * them.
   */
  mine: protectedProcedure.query(({ ctx }) => getUserTopicIds(ctx.user.id)),

  /**
   * Replaces the caller's topic selection (SPEC §7). Validates every id against `listTopics()` —
   * the pickable set, so an unfaceted or era id is refused here, not by the FK — *before*
   * touching `user_topic`. An unpickable id is a client bug (a stale chip list, a typo'd id),
   * not something the DB's foreign key should be the one to catch, so this throws a clean
   * `BAD_REQUEST` instead of letting a constraint violation surface as a 500.
   */
  setMine: protectedProcedure
    .input(z.object({ topicIds: z.array(z.string()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const validIds = new Set((await listTopics()).map((t) => t.id));
      const unknown = input.topicIds.filter((id) => !validIds.has(id));
      if (unknown.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unknown topic id(s): ${unknown.join(", ")}`,
        });
      }

      await setUserTopics(ctx.user.id, input.topicIds);
      return { ok: true } as const;
    }),
});
