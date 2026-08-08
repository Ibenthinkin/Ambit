// The `topics` router (SPEC §7): the onboarding chip grid's read (`list`) and write (`setMine`).
// Both protected — even `list` needs a session, since there's no anonymous-browsing use for the
// topic catalog (unlike `items.byId`, which genuinely backs a public route).
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { listTopics, setUserTopics } from "~/server/db/topics";

export const topicsRouter = createTRPCRouter({
  /** All sixteen v1 topics — the source for the onboarding chip grid (SPEC §8.2's TopicChips). */
  list: protectedProcedure.query(() => listTopics()),

  /**
   * Replaces the caller's topic selection (SPEC §7). Validates every id against the real topic
   * catalog *before* touching `user_topic` — an unknown id is a client bug (a stale chip list, a
   * typo'd id), not something the DB's foreign key should be the one to catch, so this throws a
   * clean `BAD_REQUEST` instead of letting a constraint violation surface as a 500.
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
