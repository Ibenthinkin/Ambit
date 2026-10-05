// The three reader-facing levels over a topic's real `user_topic.weight` (SPEC §9's underlying
// weighted draw is unchanged — this is purely a display/input band over it), a no-import leaf
// like `services/feed-knobs.ts`: a client component (the onboarding summary, `/profile/topics`)
// needs `LEVELS`/`LEVEL_LABELS`/`weightOf`/`levelOf` without dragging in the rest of
// `db/topics.ts` — and, through it, the Postgres client — into the browser bundle.
//
// docs/DESIGN_onboarding-interview.md §2 ("Reader-facing levels"):
//
//   level    weightOf    levelOf(weight)
//   little   0.5         weight < 0.75
//   some     1.0         0.75 <= weight < 1.5
//   lot      2.0         weight >= 1.5
//
// **Why three words, not the raw number.** The engine (this file's callers, `db/topics.ts`'s
// save nudge, and — once plan 2 builds it — the onboarding interview's answers) keeps writing and
// reading fractional weights underneath — a topic saved from three times sits at
// 1.0 + 3×0.5 = 2.5 — but nobody picking a
// level by hand should have to think in those units. "A little / some / a lot" is the whole
// reader-facing vocabulary; `levelOf` is how a raw weight gets read back into it for display, and
// `weightOf` is how a hand-picked level snaps back down to one of the three canonical numbers the
// engine started from.
//
// **Why the bands are half-open upward.** A boundary weight (0.75, 1.5) reads as the *higher*
// band, not the lower one — so the picker's own writes (which land exactly on 0.5 / 1.0 / 2.0,
// never on a boundary) are unambiguous, and so a reader who nudges a weight up to precisely a
// boundary sees the level actually change rather than needing to clear it by an epsilon. This is
// also why `levelOf` must never throw on an out-of-range or zero weight: `0` is never written by
// any code path (a topic with no picks has no `user_topic` row at all — see D5, "off means
// removed"), but a value that low still needs *some* band, and "little" is the honest one.
//
// **`pickWeight` and what a list pick writes (§2 "What a list pick writes").** Taking a whole
// umbrella group writes every member at "some" — the group is one idea, not N separate strong
// opinions. Taking a *single* topic — whether it's a singleton group or one member picked out of
// a bigger one — writes it at "lot", because naming one thing by itself is a stronger signal than
// sweeping it in with five others. `pickWeight` takes the count of members the picker is about to
// write in one action (`listedMembers`) and applies exactly that rule; it never throws on 0 (an
// empty group writes nothing, so the weight is moot, but the function still has to return a
// number) because it's meant to be called unconditionally, not guarded.
//
// **What stays elsewhere on purpose.** `WEIGHT_BUMP` (0.5) and `WEIGHT_CAP` (3.0) — the amount one
// *save* nudges a topic's weight, and the ceiling that nudge can't cross — are save-side *write*
// constants that live in `db/topics.ts` next to `bumpTopicWeight`, not here. This file only
// converts between a weight and its band; it has no opinion on how a weight got to be what it is.

/** The three reader-facing levels, in the order the summary and picker display them. */
export type Level = "little" | "some" | "lot";

/** Display order — matches the segmented control in `TopicLevels` (§3). */
export const LEVELS: readonly Level[] = ["little", "some", "lot"];

/** The exact copy, one place, so the copy pass never has to hunt for a hardcoded string.
 *  `"off"` isn't a `Level` (off means no `user_topic` row at all — D5), but the segmented
 *  control needs a fourth label alongside the three real ones. */
export const LEVEL_LABELS: Record<Level | "off", string> = {
  little: "a little",
  some: "some",
  lot: "a lot",
  off: "off",
};

/** The canonical weight a hand-picked level snaps to. */
const WEIGHT: Record<Level, number> = { little: 0.5, some: 1.0, lot: 2.0 };

// Band edges. Both are inclusive on their *higher* band — see the file header.
const LOT_FROM = 1.5;
const SOME_FROM = 0.75;

export function weightOf(level: Level): number {
  return WEIGHT[level];
}

/** Reads a raw weight back into its display band. Never throws — 0 (never written) and a
 *  fixture's hand-set super-cap value (e.g. 7, past `WEIGHT_CAP`) both land safely in a band. */
export function levelOf(weight: number): Level {
  if (weight >= LOT_FROM) return "lot";
  if (weight >= SOME_FROM) return "some";
  return "little";
}

/** What one list pick writes: naming a single topic (`listedMembers === 1`) is a stronger signal
 *  than sweeping in a whole group, so it writes "lot"; any other count — including 0, a group
 *  with nothing listed, which writes no rows anyway — writes "some". */
export function pickWeight(listedMembers: number): number {
  return listedMembers === 1 ? WEIGHT.lot : WEIGHT.some;
}
