// The questionnaire's one write (docs/PLAN_onboarding-questionnaire.md §2): everything a pass
// through `/onboarding` produces, in a single transaction.
//
// **Why one transaction.** `hasCompletedOnboarding` is "does this user have any `user_topic`
// row", and `/feed` and `/onboarding` both route on it. If the picks landed and the answer log
// didn't (or the other way round), a reader would either be let into a feed with no record of
// what they said, or be sent round the questions again with half a run already logged. Abandoning
// the flow writes nothing at all — the screen holds every answer in memory until the reveal's
// "Start exploring" — so the gate stays honest.
import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import type { ReadingAmount } from "~/server/config/reading-amount";
import type { Taste } from "~/lib/interview/taste";
import { interviewAnswer, user, userTaste } from "~/server/db/schema";
import { replaceUserTopicsTx, type TopicPick } from "~/server/db/topics";

/** One `interview_answer` row's content, already in its stored shape (the router maps to it). */
export interface AnswerRow {
  questionId: string;
  /** Option keys, a sentinel, or — for a free-text question — the mapped topic ids. */
  answer: string[];
  /** The reader's own words; null for every non-text question. */
  text: string | null;
}

export interface OnboardingRun {
  picks: readonly TopicPick[];
  /** Null = not said (bank v2's amount question skipped, or a v3 run without the reveal's
   *  Reading row): the column is left as it was. */
  writingAmount: ReadingAmount | null;
  answers: readonly AnswerRow[];
  bankVersion: number;
  /** What the reveal showed (docs/DESIGN_first-exhibition.md §4), validated by the router;
   *  absent from a bank-v1 client, which leaves any stored taste as it was. */
  taste?: Taste;
}

/**
 * Writes one pass: the picks (**overwriting** — a retake ends on a reveal, and what is stored
 * must be what it showed), the answers under a fresh `run_id`, and whichever user columns the
 * reader actually gave. Returns the run id.
 *
 * **Skipped means untouched, never cleared.** A retake that skips the reading question keeps the
 * amount the reader set last time (or in Settings). The only way to clear the reading amount is the Settings sheet.
 */
export async function completeOnboarding(
  userId: string,
  run: OnboardingRun,
): Promise<{ runId: string }> {
  const { db } = await import("./client");
  const runId = nanoid();

  await db.transaction(async (tx) => {
    // Only the columns that were given. Drizzle ignores `undefined` keys in `.set()`, and an
    // update with nothing to set is skipped outright (it would be invalid SQL).
    const given = {
      writingAmount: run.writingAmount ?? undefined,
    };
    if (Object.values(given).some((v) => v !== undefined)) {
      await tx.update(user).set(given).where(eq(user.id, userId));
    }

    if (run.answers.length > 0) {
      await tx.insert(interviewAnswer).values(
        run.answers.map((a) => ({
          userId,
          runId,
          questionId: a.questionId,
          answer: a.answer,
          text: a.text,
          bankVersion: run.bankVersion,
        })),
      );
    }

    // One taste per reader, replaced by every run that sends one — a retake's reveal is the
    // new truth, exactly as its picks are.
    if (run.taste) {
      await tx
        .insert(userTaste)
        .values({
          userId,
          runId,
          bankVersion: run.bankVersion,
          taste: run.taste,
        })
        .onConflictDoUpdate({
          target: userTaste.userId,
          set: {
            runId,
            bankVersion: run.bankVersion,
            taste: run.taste,
            createdAt: sql`now()`,
          },
        });
    }

    // Last, so the rollback test means something: an unknown topic id fails here, on the
    // foreign key, after the two writes above — and takes them with it.
    await replaceUserTopicsTx(tx, userId, run.picks, "overwrite");
  });

  return { runId };
}
