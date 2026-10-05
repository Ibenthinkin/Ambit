// The playoff's display rule (docs/DESIGN_first-exhibition.md §2). A question with `show.top`
// is an ordinary `choice` in the bank — all twelve wings, each with its own picture and its own
// effects — and the *screen* shows only the reader's top few, ranked by what the answers so far
// have already scored each option's targets. Nothing else looks at `show`: scoring and filtering
// see the whole question, an option's effects never change, and the logged answer is just a key.
//
// Mean, not sum: a wing with fourteen topics must not outrank one with five because its spread
// score lands on more rows. Negative scores count as zero — a wing the reader scored *down*
// should sort with the untouched ones, not below them, since the question is "which of your
// favourites", and ties keep bank order so the result is stable.
import { optionTargets } from "./targets";
import type { Option, Question } from "./types";

/** The mean positive score over an option's listed targets; 0 when it has none. */
function meanScore(
  option: Option,
  scores: ReadonlyMap<string, number>,
  listed: ReadonlySet<string>,
): number {
  const targets = optionTargets(option, listed);
  if (targets.length === 0) return 0;
  let sum = 0;
  for (const id of targets) sum += Math.max(0, scores.get(id) ?? 0);
  return sum / targets.length;
}

/** The options to show, best first — all of them for a question without `show`. */
export function rankOptions(
  q: Question,
  scores: ReadonlyMap<string, number>,
  listed: ReadonlySet<string>,
): Option[] {
  if (!q.show) return [...q.options];
  return q.options
    .map((option, index) => ({
      option,
      index,
      mean: meanScore(option, scores, listed),
    }))
    .sort((a, b) => b.mean - a.mean || a.index - b.index)
    .slice(0, q.show.top)
    .map((x) => x.option);
}

/** The question as the screen should render it. Returns the same object when there is nothing
 *  to do, so React sees no change. */
export function shown(
  q: Question,
  scores: ReadonlyMap<string, number>,
  listed: ReadonlySet<string>,
): Question {
  if (!q.show) return q;
  return { ...q, options: rankOptions(q, scores, listed) };
}
