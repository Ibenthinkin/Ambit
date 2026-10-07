// Scores → the reveal's opening list: which topics, and at what level.
import { groupOf } from "~/server/config/topic-groups";
import { weightOf, type Level } from "~/server/config/topic-levels";
import type { ReadingAmount } from "~/server/config/reading-amount";

import { GROUP_CAP, LOT_FROM, MAX_PICKS, MIN_PICKS, SOME_FROM } from "./config";

/** The shape `onboarding.complete` and `topics.setMine` take. */
export interface Pick {
  topicId: string;
  weight: number;
}

/** A questionnaire score read as one of the three reader-facing levels. These bands are the
 *  questionnaire's own (config.ts) — not `levelOf`'s, which reads a stored *weight*. */
export function levelFromScore(score: number): Level {
  if (score >= LOT_FROM) return "lot";
  if (score >= SOME_FROM) return "some";
  return "little";
}

/**
 * The proposal the reveal opens on.
 *
 *   1. Positive scores only, highest first. Ties keep the map's own order — the order answers
 *      first touched each topic — so "Music → music, sound, album-art" lists music first.
 *   2. At most GROUP_CAP from one umbrella group, MAX_PICKS in all.
 *   3. Fewer than MIN_PICKS? Top up from `starters`, in order, at "some" — skipping anything
 *      already in, anything the reader scored *down*, and anything this database doesn't list.
 *
 * A reader who skips every question gets the first three starters, and the reveal is where they
 * change them. On a database with fewer than three listed topics the list is simply short.
 */
export function picksFrom(
  scores: ReadonlyMap<string, number>,
  listed: ReadonlySet<string>,
  starters: readonly string[],
): Pick[] {
  const ranked = [...scores.entries()]
    .filter(([id, s]) => s > 0 && listed.has(id))
    // Array.prototype.sort is stable, so equal scores stay in first-touched order.
    .sort((a, b) => b[1] - a[1]);

  const picks: Pick[] = [];
  const perGroup = new Map<string, number>();
  for (const [topicId, score] of ranked) {
    if (picks.length >= MAX_PICKS) break;
    // A topic in no group (none today — the partition test forbids it) is simply uncapped.
    const group = groupOf(topicId)?.id;
    if (group) {
      const n = perGroup.get(group) ?? 0;
      if (n >= GROUP_CAP) continue;
      perGroup.set(group, n + 1);
    }
    picks.push({ topicId, weight: weightOf(levelFromScore(score)) });
  }

  const taken = new Set(picks.map((p) => p.topicId));
  // Two passes over the starters. The first skips any the reader scored down — no point proposing
  // what they turned away. The second exists because the reveal has no way to *add* a topic: a
  // reader who pressed "None of these" on every wing screen has pushed every starter below zero,
  // and an empty reveal would be a dead end. So if the first pass leaves it short, start somewhere
  // anyway; every level can still be turned off.
  for (const allowScoredDown of [false, true]) {
    for (const topicId of starters) {
      if (picks.length >= MIN_PICKS) break;
      if (taken.has(topicId) || !listed.has(topicId)) continue;
      if (!allowScoredDown && (scores.get(topicId) ?? 0) < 0) continue;
      picks.push({ topicId, weight: weightOf("some") });
      taken.add(topicId);
    }
  }
  return picks;
}

/**
 * Is this pick a starter top-up rather than something the answers earned? True when the reader's
 * scores gave its topic nothing positive — the second and third passes of `picksFrom` above. The
 * reveal tags such a row "Proposed" (docs/DESIGN_redesign.md §5.1).
 *
 * Read off the scores, not off which pass added it, so it needs no extra field on `Pick` and
 * stays true after the reader edits a level. (A positively scored starter that the group cap kept
 * out of the first pass and a later pass let in reads as earned — it was.)
 */
export function isStarter(
  pick: Pick,
  scores: ReadonlyMap<string, number>,
): boolean {
  return !((scores.get(pick.topicId) ?? 0) > 0);
}

/** A long read, for the reading default and the reveal's "You like a long read". */
export const LONG_READ_MINUTES = 12;

/**
 * What the reveal's "Reading mixed in" row opens on, read off the article cards
 * (docs/DESIGN_first-exhibition.md §2; the row is docs/DESIGN_redesign.md §5.1's — bank v2 asked
 * it as a question): both declined → none; one opened → a little; two → some, or a lot when both
 * were long reads. Null when no reading question was reached. The reader can change it, and what
 * is stored is the row's value.
 */
export function defaultReadingAmount(
  opened: readonly { minutes: number }[],
  skipped: number,
): ReadingAmount | null {
  if (opened.length + skipped === 0) return null;
  if (opened.length === 0) return "none";
  if (opened.length === 1) return "little";
  return opened.every((o) => o.minutes >= LONG_READ_MINUTES) ? "lot" : "some";
}
