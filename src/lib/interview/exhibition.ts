// The exhibition title and subtitle (docs/DESIGN_first-exhibition.md §6): the reveal names the
// reader's first show — "Quiet Weathers" — from an adjective (the top *look* topic over a floor,
// else the top *medium*) and a noun (the top wing's). Wings are config/interview-wings.ts; a
// wing's score is the mean positive score over its listed topics, the same arithmetic as the
// playoff's ranking (show.ts), so the title agrees with the screen the reader just saw. Pure.
import { WINGS } from "~/server/config/interview-wings";
import { facetOf } from "~/server/config/topic-facets";
import type { TopicFacet } from "~/server/db/schema";

/** A look must score at least this to name the show; below it the medium speaks. */
export const TITLE_LOOK_FLOOR = 0.6;

/** Look topic → adjective. Ben edits freely; a look not here simply yields to the medium. */
export const LOOK_ADJECTIVES: Readonly<Record<string, string>> = {
  minimal: "Quiet",
  eerie: "Nocturnal",
  melancholy: "Nocturnal",
  neon: "Electric",
  color: "Chromatic",
  "black-and-white": "Monochrome",
  surreal: "Dreaming",
  psychedelic: "Dreaming",
  whimsical: "Whimsical",
  painterly: "Painted",
  "aerial-view": "Aerial",
  brutalist: "Concrete",
  retrofuturism: "Atomic",
  "art-deco": "Streamlined",
  "mid-century-modern": "Streamlined",
  cozy: "Hearthside",
  ornate: "Gilded",
  gothic: "Gothic",
};

/** Medium topic → adjective, the fallback. */
export const MEDIUM_ADJECTIVES: Readonly<Record<string, string>> = {
  photography: "Exposed",
  engraving: "Engraved",
  "scientific-illustration": "Measured",
  ceramics: "Glazed",
  textiles: "Woven",
  collage: "Assembled",
  painting: "Painted",
  drawing: "Drawn",
  illustration: "Illustrated",
};

function meanPositive(
  ids: readonly string[],
  scores: ReadonlyMap<string, number>,
  listed: ReadonlySet<string>,
): number {
  const live = ids.filter((id) => listed.has(id));
  if (live.length === 0) return 0;
  let sum = 0;
  for (const id of live) sum += Math.max(0, scores.get(id) ?? 0);
  return sum / live.length;
}

/** Every wing with its score, best first; ties keep config order. */
export function wingRanking(
  scores: ReadonlyMap<string, number>,
  listed: ReadonlySet<string>,
): { id: string; score: number }[] {
  return WINGS.map((w, index) => ({
    id: w.id,
    index,
    score: meanPositive(w.topics, scores, listed),
  }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ id, score }) => ({ id, score }));
}

/** The top `n` listed topics of one facet with a positive score, best first (first-touched order
 *  breaks ties, as picks.ts does). */
export function topByFacet(
  scores: ReadonlyMap<string, number>,
  listed: ReadonlySet<string>,
  facet: TopicFacet,
  n: number,
): string[] {
  return [...scores.entries()]
    .filter(([id, s]) => s > 0 && listed.has(id) && facetOf(id) === facet)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id]) => id);
}

export function exhibitionTitle(
  scores: ReadonlyMap<string, number>,
  listed: ReadonlySet<string>,
): { adjective: string; noun: string } {
  let adjective: string | undefined;
  const look = topByFacet(scores, listed, "look", 1)[0];
  if (look && (scores.get(look) ?? 0) > TITLE_LOOK_FLOOR)
    adjective = LOOK_ADJECTIVES[look];
  if (!adjective) {
    const medium = topByFacet(scores, listed, "medium", 1)[0];
    if (medium) adjective = MEDIUM_ADJECTIVES[medium];
  }
  const [top] = wingRanking(scores, listed);
  const noun =
    top && top.score > 0
      ? WINGS.find((w) => w.id === top.id)!.noun
      : "Exhibition";
  return { adjective: adjective ?? "First", noun };
}
