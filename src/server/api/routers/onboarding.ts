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
import { tasteSchema } from "~/lib/interview/taste";
import { getItemsByIds } from "~/server/db/items";
import { completeOnboarding } from "~/server/db/onboarding";
import type { ErrorThrottle } from "~/server/services/error-report";
import { listTopics } from "~/server/db/topics";
import { interpretTexts } from "~/server/services/interview-interpret";
import { RateLimiter } from "~/server/services/rate-limit";

/** The reveal's floor, and a ceiling comfortably above the questionnaire's own MAX_PICKS (12) —
 *  the reader can add back what they like on the reveal, but not the whole vocabulary. */
const MIN_PICKS = 3;
const MAX_PICKS = 24;
/** A free-text answer's cap — enough for a list of favourites, too short to be an essay. */
export const MAX_ANSWER_TEXT = 500;

/**
 * `onboarding.interpret`'s own cap, far below the global 120/min (api/trpc.ts). Each call is a paid
 * model call on the same OpenRouter wallet the nightly ingest spends — a client looping it could
 * empty the wallet, and a 402 then fails the ingest too. A reader needs one call per pass; ten an
 * hour leaves room for retakes and Back-and-forth. Per process, like the global limiter.
 */
export const INTERPRET_PER_HOUR = 10;
const interpretLimiter = new RateLimiter({
  limit: INTERPRET_PER_HOUR,
  windowMs: 60 * 60 * 1000,
});

/** Mails an account-level model failure the way instrumentation.ts mails a thrown error — same
 *  reporter, same once-an-hour-per-signature throttle (shared across calls by module scope). */
let throttle: ErrorThrottle | undefined;
async function reportAccountFailure(err: Error): Promise<void> {
  const [{ ErrorThrottle, reportServerError }, { getMailer }, { env }] =
    await Promise.all([
      import("~/server/services/error-report"),
      import("~/server/services/mailer"),
      import("~/env"),
    ]);
  throttle ??= new ErrorThrottle();
  await reportServerError(
    err,
    { path: "/api/trpc/onboarding.interpret", method: "POST" },
    { routePath: "onboarding.interpret", routeType: "route" },
    {
      log: (line) => console.error(line),
      getMailer,
      opsEmail: env.OPS_EMAIL,
      throttle,
      now: () => new Date(),
    },
  );
}

/** An optional About-you field: trimmed, capped, and "" read as "not given" (null). */
const aboutField = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v == null || v === "" ? null : v));

const answerSchema = z.object({
  questionId: z.string().min(1).max(64),
  // Option keys, or one sentinel ("skip" / "either" / "neither"). Not checked against the bank:
  // this is a log, the bank is client code that changes, and an answer to a since-retired
  // question is still a true record of what was asked and said.
  keys: z.array(z.string().min(1).max(64)).max(24),
  text: z.string().trim().max(MAX_ANSWER_TEXT).optional(),
  // Two writers: the model's mapping of a text answer (≤ 6 per text), and a reading card, which
  // carries the article's whole `item_topic` membership — bounded by the vocabulary, not by the
  // model, and growing with every promotion round. So the cap is the vocabulary's order of
  // magnitude, not the model's.
  topicIds: z.array(z.string().min(1).max(64)).max(256).optional(),
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
        // What the reveal showed (bank v2). Bounded by its own schema: wing ids, 0…1 dimensions,
        // at most two opened cards. Optional so a v1 client still completes.
        taste: tasteSchema.optional(),
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

      if (input.taste) {
        // The opened cards name items; a stale tab after a corpus prune must not store a
        // dangling id. Checked before the transaction, so a refusal writes nothing at all.
        const ids = input.taste.opened.map((o) => o.itemId);
        const found = await getItemsByIds(ids);
        const gone = ids.filter((id) => !found.has(id));
        if (gone.length > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Unknown item id(s): ${gone.join(", ")}`,
          });
        }
        // Mediums must be pickable topics, like picks.
        const badMedium = input.taste.mediums.filter((id) => !validIds.has(id));
        if (badMedium.length > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Unknown medium id(s): ${badMedium.join(", ")}`,
          });
        }
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
        taste: input.taste,
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
              // A bank id is a slug. It is written into the prompt's delimiter attribute, so
              // nothing else gets in.
              questionId: z.string().regex(/^[a-z0-9-]{1,64}$/),
              text: z.string().trim().max(MAX_ANSWER_TEXT),
            }),
          )
          .max(3),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!interpretLimiter.allow(ctx.user.id)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many interpretations this hour.",
        });
      }
      const topics = await listTopics();
      return interpretTexts(
        input.texts,
        topics.map((t) => ({ id: t.id, label: t.label })),
        { onAccountFailure: (err) => void reportAccountFailure(err) },
      );
    }),
});
