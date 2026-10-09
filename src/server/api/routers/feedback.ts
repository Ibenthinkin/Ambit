// The `feedback` router (docs/DESIGN_more-or-less.md D4): "More of this" / "Less of this" — a
// reader's verdict on one item, the shelf of "more" items on Saved, and the marked-state ids.
// Every procedure is protected and user-scoped; the work is in `db/feedback.ts`.
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  clearFeedback,
  getFeedbackIds,
  getMoreItems,
  setFeedback,
} from "~/server/db/feedback";
import { getItemById, resolveSlotTopic } from "~/server/db/items";
import { getTopicLabel } from "~/server/db/topics";

export const feedbackRouter = createTRPCRouter({
  /**
   * Records "more" or "less" on an item and applies it (D2). Like `saves.saveToCollection`, the
   * item must exist (`NOT_FOUND`, not a foreign-key 500) and `topicId` — the slot the card was
   * served under — is honoured only for a member (`resolveSlotTopic`), so a client cannot charge
   * an arbitrary topic. `drift` names the charged topic for the toast, `null` for an un-homed
   * item. `isNew` is "created the pick" for more and "first cool of that topic" for less.
   * Re-sending the same verdict is a no-op; the other verdict flips it (one net effect).
   */
  set: protectedProcedure
    .input(
      z.object({
        itemId: z.string(),
        verdict: z.enum(["more", "less"]),
        topicId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const found = await getItemById(input.itemId);
      if (!found) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `No item with id ${input.itemId}`,
        });
      }
      const charged = await resolveSlotTopic(found, input.topicId);
      const effect = await setFeedback(
        ctx.user.id,
        input.itemId,
        input.verdict,
        charged,
      );
      if (effect.topicId === null) {
        return { verdict: effect.verdict, drift: null } as const;
      }
      const topicLabel =
        (await getTopicLabel(effect.topicId)) ?? effect.topicId;
      return {
        verdict: effect.verdict,
        drift: {
          topicLabel,
          isNew:
            effect.verdict === "more" ? effect.isNewPick : effect.isNewCool,
        },
      } as const;
    }),

  /** Takes a verdict back, reversing exactly what it did. `cleared` is false when there was none. */
  clear: protectedProcedure
    .input(z.object({ itemId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const effect = await clearFeedback(ctx.user.id, input.itemId);
      return { cleared: effect !== null };
    }),

  /** Item ids by verdict — what lights the pair's marked state (the shape `saves.ids` has). */
  mine: protectedProcedure.query(({ ctx }) => getFeedbackIds(ctx.user.id)),

  /** The "More of this" shelf on Saved: newest verdict first, in `saves.list`'s row shape. */
  list: protectedProcedure.query(({ ctx }) => getMoreItems(ctx.user.id)),
});
