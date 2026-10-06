// The travel compass (docs/DESIGN_first-exhibition.md §4): "Where would you go next?" is not a
// place question — it reads *taste* off the places. Each destination carries four bipolar axes,
// wild (+) / built (−), old (+) / new (−), still (+) / lively (−), far (+) / near (−), each
// −1…1 (config/interview-destinations.ts), and the reveal shows their average as four bars and
// one sentence. Pure; nothing here is stored except as part of the taste (taste.ts).
import { joinAnd } from "./join";

export interface Axes {
  wild: number;
  old: number;
  still: number;
  far: number;
}

/** An axis closer to the centre than this says nothing worth a clause. */
export const COMPASS_THRESHOLD = 0.15;

/** The mean of the chosen destinations' axes; null when none was chosen ("Nowhere in particular"). */
export function compassFrom(chosen: readonly Axes[]): Axes | null {
  if (chosen.length === 0) return null;
  const sum = { wild: 0, old: 0, still: 0, far: 0 };
  for (const a of chosen) {
    sum.wild += a.wild;
    sum.old += a.old;
    sum.still += a.still;
    sum.far += a.far;
  }
  const n = chosen.length;
  return {
    wild: sum.wild / n,
    old: sum.old / n,
    still: sum.still / n,
    far: sum.far / n,
  };
}

/** Each axis's clause for its positive and negative pole, in the order the sentence reads them. */
const CLAUSES: readonly [keyof Axes, string, string][] = [
  ["wild", "wild places over cities", "cities over wild places"],
  ["old", "the old over the new", "the new over the old"],
  ["still", "quiet over crowds", "crowds over quiet"],
  ["far", "a long way from home", "somewhere close to home"],
];

/** "You’d travel for wild places over cities, the old over the new and a long way from home." —
 *  only the axes past `threshold`; empty when none is. */
export function compassSentence(
  axes: Axes,
  threshold: number = COMPASS_THRESHOLD,
): string {
  const parts = CLAUSES.flatMap(([key, plus, minus]) => {
    const v = axes[key];
    if (Math.abs(v) <= threshold) return [];
    return [v > 0 ? plus : minus];
  });
  if (parts.length === 0) return "";
  return `You’d travel for ${joinAnd(parts)}.`;
}

/**
 * Which pole of one axis the reader leans to — "plus" (wild, old, still, far), "minus", or null
 * inside the threshold. The reveal sets that pole's label in ink and leaves the other grey, and
 * it is `compassSentence`'s own cut, so a bar never emphasises a pole the sentence left out.
 */
export function activePole(
  value: number,
  threshold: number = COMPASS_THRESHOLD,
): "plus" | "minus" | null {
  if (Math.abs(value) <= threshold) return null;
  return value > 0 ? "plus" : "minus";
}
