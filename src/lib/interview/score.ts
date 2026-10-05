// Answers → a score per topic. The reveal (picks.ts) ranks these and turns them into levels.
//
// **The one piece of arithmetic: an effect gives each of its n targets `score / √n`.**
// Dividing by n would make a twelve-topic group answer nearly worthless per topic; not dividing
// would let it outvote twelve single-topic answers. √n sits between: "Space" over twelve topics
// gives each 0.29, "Music" over one gives it 1.0. And n counts the *listed* targets, so on a
// small database the survivors of a group get more each, not less.
import {
  EITHER,
  EITHER_FACTOR,
  NEITHER,
  NEITHER_FACTOR,
  SKIP,
  TEXT_SCORE,
} from "./config";
import { targetsOf } from "./targets";
import type { Answer, Effect, Question } from "./types";

function apply(
  scores: Map<string, number>,
  effect: Effect,
  factor: number,
  listed: ReadonlySet<string>,
) {
  const targets = targetsOf(effect, listed);
  if (targets.length === 0) return;
  const each = (factor * effect.score) / Math.sqrt(targets.length);
  for (const t of targets) scores.set(t, (scores.get(t) ?? 0) + each);
}

/**
 * A topic → score map, in first-touched order (picks.ts leans on that order to break ties the
 * way the bank's author wrote them). Tolerant by design: an answer to a question the bank no
 * longer has, or a key an option no longer has, adds nothing rather than throwing — a retake
 * after the bank changed must still score.
 */
export function scoreAnswers(
  bank: readonly Question[],
  answers: readonly Answer[],
  listed: ReadonlySet<string>,
): Map<string, number> {
  const byId = new Map(bank.map((q) => [q.id, q]));
  const scores = new Map<string, number>();
  for (const a of answers) {
    const q = byId.get(a.questionId);
    if (!q || a.keys[0] === SKIP) continue;
    if (q.kind === "text") {
      // The model's ids are one effect, shared like any other.
      apply(scores, { topics: a.topicIds ?? [], score: TEXT_SCORE }, 1, listed);
      continue;
    }
    // Either / Neither mean "every side of this pair", scaled.
    const whole =
      a.keys[0] === EITHER
        ? EITHER_FACTOR
        : a.keys[0] === NEITHER
          ? NEITHER_FACTOR
          : null;
    for (const o of q.options) {
      const factor = whole ?? (a.keys.includes(o.key) ? 1 : null);
      if (factor === null) continue;
      for (const e of o.effects) apply(scores, e, factor, listed);
    }
  }
  return scores;
}
