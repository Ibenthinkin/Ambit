// What a press makes of the answer — pure, so the click (question-step.tsx) and the key
// (onboarding-screen.tsx's listener over keys.ts) build exactly the same Answer.
import { SENTINELS, SKIP } from "./config";
import { faceKey, type QuestionFaces } from "./faces";
import type { Answer, Question } from "./types";

/** Has the reader actually said something? An empty box or an emptied multi is not an answer. */
export function isAnswered(answer: Answer | undefined): answer is Answer {
  if (!answer) return false;
  if (answer.text !== undefined) return answer.text.trim() !== "";
  return answer.keys.length > 0 && answer.keys[0] !== SKIP;
}

/**
 * A whole answer in one press: a pair's side, a choice, or a sentinel (EITHER / NEITHER). A
 * reading card also carries the article's topic memberships — choosing it scores *that piece*
 * (score.ts), and the answer log keeps only the option key.
 */
export function pickAnswer(
  q: Question,
  key: string,
  faces: QuestionFaces,
): Answer {
  const w = faces[faceKey(q.id, key)]?.writing;
  return w
    ? { questionId: q.id, keys: [key], topicIds: w.topicIds }
    : { questionId: q.id, keys: [key] };
}

/**
 * A multi's chip or card pressed. A sentinel (Show it all's NEITHER) is a whole answer of its
 * own, so a key picked after it replaces it. At `max` the newest answer pushes out the oldest,
 * rather than the press being refused — a reader who changes their mind shouldn't have to
 * un-press something first.
 */
export function toggleAnswer(
  q: Question,
  keys: readonly string[],
  key: string,
): Answer {
  const picked = keys.filter((k) => !SENTINELS.includes(k));
  let next: string[];
  if (picked.includes(key)) {
    next = picked.filter((k) => k !== key);
  } else {
    next = [...picked, key];
    if (q.max && next.length > q.max) next = next.slice(next.length - q.max);
  }
  return { questionId: q.id, keys: next };
}

/**
 * One decision on the keep stack (DESIGN_redesign §5.2, "Keep or pass"): the card at `at` is
 * kept or passed, and the stack moves to the next. The answer is still the kept keys (decision
 * 10 — a pass is not an answer), in the cards' order. Pass *removes* the card if it was kept, so
 * a reader who comes Back and walks the stack again can change their mind either way.
 * `done` is true once the last card is decided: that decision is the whole answer.
 */
export function keepOrPass(
  q: Question,
  answer: Answer | undefined,
  at: number,
  keep: boolean,
): { answer: Answer; at: number; done: boolean } {
  const card = q.options[at]?.key;
  const kept = new Set(
    (answer?.keys ?? []).filter((k) => !SENTINELS.includes(k)),
  );
  if (card !== undefined) {
    if (keep) kept.add(card);
    else kept.delete(card);
  }
  const next = at + 1;
  return {
    answer: {
      questionId: q.id,
      keys: q.options.map((o) => o.key).filter((k) => kept.has(k)),
    },
    at: next,
    done: next >= q.options.length,
  };
}
