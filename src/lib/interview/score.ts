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
  READ_SCORE,
  SKIP,
  TEXT_SCORE,
} from "./config";
import { KIND_FORM } from "~/server/config/writing";

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
      apply(scores, { topics: a.topicIds ?? [], score: TEXT_SCORE }, 1, listed);
      continue;
    }

    // "None of these" on a choice (the wing screens, the playoff): each option's FIRST effect
    // goes down — the wing's subject spread, not its face bonus. On a pair, Neither still takes
    // every effect of both sides down, as v1 did.
    if (a.keys[0] === NEITHER && q.kind === "choice") {
      for (const o of q.options) {
        const first = o.effects[0];
        if (first) apply(scores, first, NEITHER_FACTOR, listed);
      }
      continue;
    }

    // NEITHER on a multi is Rather not's "Show it all" (Ben, 10-05-26): nothing is to be kept
    // out, so nothing is scored — it is logged as said, unlike a skip. (Without this, the line
    // below would multiply each -2 by NEITHER_FACTOR and *raise* the topics the reader was
    // offered to avoid.)
    if (a.keys[0] === NEITHER && q.kind === "multi") continue;

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

      // A reading card scores the *item* it showed, not a fixed effect: the screen put the
      // item's topic memberships on `topicIds` when the card was chosen. Its kind's form topic
      // (config/writing.ts KIND_FORM) is a second, whole effect — dropped by targetsOf until the
      // Form facet's topics are listed.
      if (o.face?.writing && a.keys.includes(o.key)) {
        apply(
          scores,
          { topics: a.topicIds ?? [], score: READ_SCORE },
          1,
          listed,
        );
        const form = KIND_FORM[o.face.writing.kind];
        if (form)
          apply(scores, { topics: [form], score: READ_SCORE }, 1, listed);
      }
    }
  }
  return scores;
}
