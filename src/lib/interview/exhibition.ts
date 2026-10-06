// The exhibition title and subtitle (docs/DESIGN_first-exhibition.md §6): the reveal names the
// reader's first show — "Quiet Weathers" — from an adjective (the top *look* topic over a floor,
// else the top *medium*) and a noun (the top wing's). Wings are config/interview-wings.ts; a
// wing's score is the mean positive score over its listed topics, the same arithmetic as the
// playoff's ranking (show.ts), so the title agrees with the screen the reader just saw. Pure.
//
// The *words* — the adjectives, the nouns, "First Exhibition" — are the frame's (frame.ts), so
// renaming the reveal never touches this file. The sentences under the title (the subtitle, what
// the reader opened) are built here too: they are arithmetic over the same taste.
import { WINGS } from "~/server/config/interview-wings";
import { facetOf } from "~/server/config/topic-facets";
import type { WritingKind } from "~/server/config/writing";
import type { TopicFacet } from "~/server/db/schema";

import { FRAME } from "./frame";
import { joinAnd } from "./join";
import { LONG_READ_MINUTES } from "./picks";

/** A look must score at least this to name the show; below it the medium speaks. */
export const TITLE_LOOK_FLOOR = 0.6;

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
    adjective = FRAME.lookAdjectives[look];
  if (!adjective) {
    const medium = topByFacet(scores, listed, "medium", 1)[0];
    if (medium) adjective = FRAME.mediumAdjectives[medium];
  }
  const [top] = wingRanking(scores, listed);
  const noun = top && top.score > 0 ? FRAME.nouns[top.id] : undefined;
  return {
    adjective: adjective ?? FRAME.untitled.adjective,
    noun: noun ?? FRAME.untitled.noun,
  };
}

/** A label as it reads mid-sentence. Wing and topic labels are sentence-case common nouns
 *  ("Growing things", "Photography"); one that is a proper noun would need an exception here. */
const inSentence = (label: string) => label.toLowerCase();
const capitalised = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The line under the title, as a sentence rather than a row of dots: "Creatures, growing things
 * and myth. Mostly photography and painting." — the top wings' labels, then the top mediums'.
 * Either half is left out when it has nothing to say; both empty is "".
 */
export function exhibitionSubtitle(
  wingLabels: readonly string[],
  mediumLabels: readonly string[],
): string {
  const sentences: string[] = [];
  if (wingLabels.length > 0)
    sentences.push(`${capitalised(joinAnd(wingLabels.map(inSentence)))}.`);
  if (mediumLabels.length > 0)
    sentences.push(`Mostly ${joinAnd(mediumLabels.map(inSentence))}.`);
  return sentences.join(" ");
}

/** "You like something short" at or under this mean; "a long read" at or over LONG_READER_MIN. */
export const SHORT_READER_MAX = 4;
export const LONG_READER_MIN = LONG_READ_MINUTES + 2;

/** A writing kind as the thing a reader "went for". Copy — Ben edits freely. */
export const KIND_WENT_FOR: Readonly<Record<WritingKind, string>> = {
  essay: "essays",
  curiosity: "curiosities",
  criticism: "criticism",
  archive: "the archive",
};

/**
 * What the reading cards said, in one sentence: how long a read (only when the mean is clearly
 * long or short) and which kinds, in the order they were opened — "You like a long read, and you
 * went for essays and criticism." A reader who opened neither card gets "You’d rather look than
 * read." and no promise about how much writing follows: that is the reveal's Reading row,
 * which replaced bank v2's amount question, and they may have set it to anything.
 */
export function readingSummary(taste: {
  opened: readonly { kind: WritingKind }[];
  readingMinutes: number | null;
}): string {
  const { opened, readingMinutes } = taste;
  if (opened.length === 0) return "You’d rather look than read.";
  const kinds = joinAnd([...new Set(opened.map((o) => KIND_WENT_FOR[o.kind]))]);
  const length =
    readingMinutes === null
      ? null
      : readingMinutes >= LONG_READER_MIN
        ? "a long read"
        : readingMinutes <= SHORT_READER_MAX
          ? "something short"
          : null;
  return length
    ? `You like ${length}, and you went for ${kinds}.`
    : `You went for ${kinds}.`;
}
