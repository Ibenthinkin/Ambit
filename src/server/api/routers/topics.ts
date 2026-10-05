// The `topics` router (SPEC §7): the pickers' read (`list`) and write (`setMine`) — onboarding's
// four stages and /profile/topics's four tabs, both of them chip grids over the same list.
// Both protected — even `list` needs a session, since there's no anonymous-browsing use for the
// topic catalog (unlike `items.byId`, which genuinely backs a public route).
//
// **09-28-26 — the pickers read levels now.** Both screens grew a per-topic segmented control
// (docs/DESIGN_onboarding-interview.md §2: "a little / some / a lot" over the real
// `user_topic.weight`), so `mine` stopped answering with bare ids and started answering with
// `TopicPick[]` — id *and* weight, in one read, for every caller, not just a dev build. That's
// also what retires the old `weights` procedure: it existed only because `mine` didn't carry
// weights and a product build was FORBIDDEN from asking a separate dev-gated query for them —
// once `mine` carries the number itself there is nothing left for a second procedure to gate.
// `setWeight` is the new one-topic write the segmented control needs: snap an *existing* pick
// straight to a level's canonical weight (never a nudge, and never a fresh row — that's still
// `setMine`'s job).
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  getUserTopicPicks,
  listTopics,
  resetUserTopicWeights,
  setUserTopics,
  setUserTopicWeight,
} from "~/server/db/topics";
import { weightOf } from "~/server/config/topic-levels";
import { feedDebugEnabled } from "~/server/services/feed-debug";

export const topicsRouter = createTRPCRouter({
  /** Every pickable topic — faceted, ordered by label — for onboarding's stages and
   *  /profile/topics's tabs (SPEC §8.2). */
  list: protectedProcedure.query(() => listTopics()),

  /**
   * The caller's current picks, id and weight (Phase 5.10; weights since 09-28-26) — what
   * Settings' "What you see" row labels itself from, what its sheet opens pre-selected, and what
   * both pickers' segmented controls read straight off without a second round trip.
   */
  mine: protectedProcedure.query(({ ctx }) => getUserTopicPicks(ctx.user.id)),

  /**
   * Replaces the caller's topic selection (SPEC §7). Validates every picked id against
   * `listTopics()` — the pickable set, so an unfaceted or era id is refused here, not by the FK —
   * *before* touching `user_topic`. An unpickable id is a client bug (a stale chip list, a typo'd
   * id), not something the DB's foreign key should be the one to catch, so this throws a clean
   * `BAD_REQUEST` instead of letting a constraint violation surface as a 500. Each pick's `weight`
   * is the client's to decide (`pickWeight`, §2) — this procedure trusts the number the same way
   * `setUserTopics` does.
   */
  setMine: protectedProcedure
    .input(
      z.object({
        picks: z
          .array(
            z.object({
              topicId: z.string(),
              // `.finite()` on top of `.positive()`: SuperJSON (the tRPC transformer) can carry
              // `Infinity` as a real value over the wire, and `.positive()` alone lets it through.
              weight: z.number().positive().finite(),
            }),
          )
          .min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const validIds = new Set((await listTopics()).map((t) => t.id));
      const unknown = input.picks
        .map((p) => p.topicId)
        .filter((id) => !validIds.has(id));
      if (unknown.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unknown topic id(s): ${unknown.join(", ")}`,
        });
      }

      await setUserTopics(ctx.user.id, input.picks);
      return { ok: true } as const;
    }),

  /**
   * Snaps one already-picked topic straight to a hand-picked level's weight (the segmented
   * control's write). `NOT_FOUND` when the caller has never picked this topic — there's no row
   * for a level to apply to, and creating one here would make this a second, narrower `setMine`.
   */
  setWeight: protectedProcedure
    .input(
      z.object({
        topicId: z.string(),
        level: z.enum(["little", "some", "lot"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const weight = weightOf(input.level);
      const ok = await setUserTopicWeight(ctx.user.id, input.topicId, weight);
      if (!ok) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `No pick for topic ${input.topicId}`,
        });
      }
      return { topicId: input.topicId, weight };
    }),

  /** Dev only: every weight back to 1.0, so a feel test can start from a flat prior. */
  resetWeights: protectedProcedure.mutation(async ({ ctx }) => {
    if (!(await feedDebugEnabled())) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "topics.resetWeights is a dev affordance (FEED_DEBUG is off)",
      });
    }
    const reset = await resetUserTopicWeights(ctx.user.id);
    return { reset } as const;
  }),
});
