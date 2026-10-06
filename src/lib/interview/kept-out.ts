// "Kept out" on the reveal (docs/PLAN_onboarding-critique.md §4): what the reader said they'd
// rather not see, shown back to them as chips with an **Allow** — because a −2 on horror is the
// one answer whose effect is otherwise invisible on a screen that lists only what made it in.
//
// Allowing edits the *answer*, not the scores: the screen owns the answers, the proposal is
// recomputed from them, and the log that `onboarding.complete` stores then says what the reader
// ended on — v1's rule that what is stored is what the reveal showed. Pure.
import { SENTINELS, SKIP } from "./config";
import type { Answer, Question } from "./types";

/** The bank's "rather not" question (bank.ts §7). */
export const KEPT_OUT_QUESTION = "rather-not";

/** The options the reader chose to keep out, in the question's own order. */
export function keptOut(
  bank: readonly Question[],
  answers: readonly Answer[],
  questionId: string = KEPT_OUT_QUESTION,
): { key: string; label: string }[] {
  const question = bank.find((q) => q.id === questionId);
  const answer = answers.find((a) => a.questionId === questionId);
  if (!question || !answer) return [];
  const chosen = new Set(answer.keys.filter((k) => !SENTINELS.includes(k)));
  return question.options
    .filter((o) => chosen.has(o.key))
    .map((o) => ({ key: o.key, label: o.label }));
}

/**
 * The answers with one kept-out choice let back in. Allowing the last one leaves the question
 * as a skip — "nothing said" — which is what an untouched "rather not" always was. A key that
 * was never chosen changes nothing, and returns the same array.
 */
export function allow(
  answers: readonly Answer[],
  key: string,
  questionId: string = KEPT_OUT_QUESTION,
): readonly Answer[] {
  const answer = answers.find((a) => a.questionId === questionId);
  if (!answer?.keys.includes(key) || SENTINELS.includes(key)) return answers;
  const keys = answer.keys.filter((k) => k !== key);
  return answers.map((a) =>
    a === answer ? { ...a, keys: keys.length > 0 ? keys : [SKIP] } : a,
  );
}
