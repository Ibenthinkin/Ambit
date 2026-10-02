// Scores → the reveal's opening list: which topics, and at what level.
import { groupOf } from "~/server/config/topic-groups";
import { weightOf, type Level } from "~/server/config/topic-levels";
import type { ReadingAmount } from "~/server/config/reading-amount";

import {
  GROUP_CAP,
  LOT_FROM,
  MAX_PICKS,
  MIN_PICKS,
  SKIP,
  SOME_FROM,
} from "./config";
import type { Answer, Question } from "./types";

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
  for (const topicId of starters) {
    if (picks.length >= MIN_PICKS) break;
    if (taken.has(topicId) || !listed.has(topicId)) continue;
    if ((scores.get(topicId) ?? 0) < 0) continue;
    picks.push({ topicId, weight: weightOf("some") });
    taken.add(topicId);
  }
  return picks;
}

/** The level the `amount` question's answer stores — null if it was skipped or never asked,
 *  which leaves `user.writing_amount` NULL and the feed on its default. */
export function readingAmountFrom(
  bank: readonly Question[],
  answers: readonly Answer[],
): ReadingAmount | null {
  for (const q of bank) {
    if (q.kind !== "amount") continue;
    const a = answers.find((x) => x.questionId === q.id);
    if (!a || a.keys[0] === SKIP) return null;
    return q.options.find((o) => o.key === a.keys[0])?.reading ?? null;
  }
  return null;
}
