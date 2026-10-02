// The `onboarding` router (10-02-26, docs/PLAN_onboarding-questionnaire.md §2) — the
// questionnaire's server half. The questions themselves, the scoring and the reveal are all
// client-side and pure (src/lib/interview/); what needs a server is the write at the end.
//
// There is deliberately **no "start" or "save progress" procedure**: the screen keeps the answers
// in memory and sends them once, from the reveal. A reader who closes the tab half-way has
// written nothing, so `/feed` still sends them back to `/onboarding` — the gate
// (`hasCompletedOnboarding`) never sees a half-finished run. A retake is the same mutation again.
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  READING_AMOUNTS,
  type ReadingAmount,
} from "~/server/config/reading-amount";
import { completeOnboarding } from "~/server/db/onboarding";
import { listTopics } from "~/server/db/topics";
import { interpretTexts } from "~/server/services/interview-interpret";

/** The reveal's floor, and a ceiling comfortably above the questionnaire's own MAX_PICKS (12) —
 *  the reader can add back what they like on the reveal, but not the whole vocabulary. */
const MIN_PICKS = 3;
const MAX_PICKS = 24;
/** A free-text answer's cap — enough for a list of favourites, too short to be an essay. */
export const MAX_ANSWER_TEXT = 500;

/** An optional About-you field: trimmed, capped, and "" read as "not given" (null). */
const aboutField = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

const answerSchema = z.object({
  questionId: z.string().min(1).max(64),
  // Option keys, or one sentinel ("skip" / "either" / "neither"). Not checked against the bank:
  // this is a log, the bank is client code that changes, and an answer to a since-retired
  // question is still a true record of what was asked and said.
  keys: z.array(z.string().min(1).max(64)).max(24),
  text: z.string().trim().max(MAX_ANSWER_TEXT).optional(),
  topicIds: z.array(z.string().min(1).max(64)).max(12).optional(),
});

export const onboardingRouter = createTRPCRouter({
  /**
   * Ends a pass through the questionnaire: writes the reveal's picks (overwriting — see
   * db/topics.ts's `replaceUserTopicsTx`), the reading amount, the answer log and the optional
   * About-you fields, in one transaction.
   *
   * Picks are validated against `listTopics()` exactly as `topics.setMine` does, so an
   * unpickable id is a clean `BAD_REQUEST`, not a foreign-key 500. Each weight is the client's
   * (a level's canonical number); it is trusted the way `setMine` trusts it.
   */
  complete: protectedProcedure
    .input(
      z.object({
        picks: z
          .array(
            z.object({
              topicId: z.string(),
              // `.finite()` as well: SuperJSON can carry Infinity, and `.positive()` lets it by.
              weight: z.number().positive().finite(),
            }),
          )
          .min(MIN_PICKS)
          .max(MAX_PICKS)
          .refine(
            (picks) =>
              new Set(picks.map((p) => p.topicId)).size === picks.length,
            "Each topic once",
          ),
        writingAmount: z
          .enum(READING_AMOUNTS as unknown as [string, ...string[]])
          .nullable(),
        answers: z.array(answerSchema).max(40),
        bankVersion: z.number().int().positive(),
        about: z
          .object({
            ageRange: aboutField(40),
            location: aboutField(80),
            gender: aboutField(40),
          })
          .optional(),
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

      return completeOnboarding(ctx.user.id, {
        picks: input.picks,
        writingAmount: input.writingAmount as ReadingAmount | null,
        // To the stored shape: a free-text question's row holds the reader's words and the
        // topic ids they were mapped to; every other row holds its keys and no text.
        answers: input.answers.map((a) =>
          a.text !== undefined && a.text !== ""
            ? {
                questionId: a.questionId,
                answer: a.topicIds ?? [],
                text: a.text,
              }
            : { questionId: a.questionId, answer: a.keys, text: null },
        ),
        bankVersion: input.bankVersion,
        about: input.about,
      });
    }),

  /**
   * Maps the free-text answers to topic ids — one model call, made once as the reader leaves the
   * last question (services/interview-interpret.ts has the four rules). A mutation because it
   * costs money and must never be retried or refetched by the query cache. Signed-in only: the
   * model call is on Ambit's account, and `/onboarding` is behind the session anyway.
   *
   * **Never an error the screen has to handle**: the service answers empty lists on any failure.
   * Writes nothing — the words are stored by `complete`, if the reader gets that far.
   */
  interpret: protectedProcedure
    .input(
      z.object({
        texts: z
          .array(
            z.object({
              questionId: z.string().min(1).max(64),
              text: z.string().trim().max(MAX_ANSWER_TEXT),
            }),
          )
          .max(3),
      }),
    )
    .mutation(async ({ input }) => {
      const topics = await listTopics();
      return interpretTexts(
        input.texts,
        topics.map((t) => ({ id: t.id, label: t.label })),
      );
    }),
});
