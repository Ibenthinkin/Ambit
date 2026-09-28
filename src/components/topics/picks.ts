// The pure pick logic behind the topic pickers — no React, no server import, testable without
// jsdom. docs/DESIGN_onboarding-interview.md §2 "What a list pick writes":
//
//   Taking a whole group writes each member at "some"; taking a single member writes it at "lot"
//   (naming one thing is a stronger signal than taking a bundle). A group taken whole and then
//   trimmed keeps "some" on the survivors.
//
// This is the *one* place that rule lives. `GroupPicker` — hosted by onboarding's Pick phase and
// by `/profile/topics` — calls `toggleGroup` / `toggleTopic` / `groupState` and never decides a
// weight itself; `topic-levels.ts`'s
// `weightOf`/`pickWeight` are the only source of the actual numbers, imported and never
// re-literalled here either.
//
// Every function returns a **new** `Map` and never mutates the `Picks` it was handed, so callers
// (a `useState`, a query cache) can rely on reference equality to know something changed.
import { pickWeight, weightOf } from "~/server/config/topic-levels";

/** A reader's current picks: topic id → weight. `ReadonlyMap` because every mutator here returns
 *  a fresh `Map` rather than editing this one in place — see the header. */
export type Picks = ReadonlyMap<string, number>;

/**
 * Toggles a whole umbrella group.
 *
 * - **Full** (every listed member already present): removes every member. Nothing else in
 *   `picks` is touched — a singleton group whose one member is present is just this case with
 *   `members.length === 1`.
 * - **Empty or mixed** (some or none present): adds every *absent* member at
 *   `pickWeight(members.length)` — the weight for "taking this whole group" — and leaves any
 *   already-present member's weight exactly as it was. A mixed group therefore "completes" on a
 *   tap rather than clearing — the reader who has half a group most likely wants the rest.
 */
export function toggleGroup(
  picks: Picks,
  members: readonly string[],
): Map<string, number> {
  const next = new Map(picks);
  const full = members.length > 0 && members.every((m) => next.has(m));
  const weight = pickWeight(members.length);
  for (const member of members) {
    if (full) {
      next.delete(member);
    } else if (!next.has(member)) {
      next.set(member, weight);
    }
  }
  return next;
}

/**
 * Toggles a single topic: removes it if present, otherwise adds it at `weightOf("lot")` — naming
 * one topic by itself, whether it's a singleton group or one member picked out of a bigger one,
 * is the strongest signal a list pick can send (§2).
 */
export function toggleTopic(
  picks: Picks,
  topicId: string,
): Map<string, number> {
  const next = new Map(picks);
  if (next.has(topicId)) {
    next.delete(topicId);
  } else {
    next.set(topicId, weightOf("lot"));
  }
  return next;
}

/**
 * A group chip's tri-state, derived fresh from `picks` on every render (never stored, so it
 * cannot drift from the member list it summarises): `false` when none of `members` are present (including an empty member list — there is
 * nothing to be "on"), `true` when every one is, `"mixed"` otherwise.
 */
export function groupState(
  picks: Picks,
  members: readonly string[],
): boolean | "mixed" {
  if (members.length === 0) return false;
  const presentCount = members.filter((m) => picks.has(m)).length;
  if (presentCount === 0) return false;
  if (presentCount === members.length) return true;
  return "mixed";
}
