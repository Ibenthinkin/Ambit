// Questions grouped into STEPS (docs/DESIGN_first-exhibition.md §1): three wing screens and the
// playoff are one step ("Rooms"), three hands pairs another, and so on. The redesign drops the
// printed progress line (docs/DESIGN_redesign.md §5.1), but the grouping stays — the playoff and
// the tests read it. Bank v3 has eight: "How much" went to the reveal.
// Keyed by question id so the bank can be reordered without touching this file's meaning.
// bank.test.ts pins that every question has a step and the steps are 1…STEP_COUNT contiguous.
// The last step, "Your words", is a bank question like the others — About you, a screen of its
// own that followed it, was removed 10-05-26 (docs/PLAN_onboarding-critique.md Cut 1).
import type { Question } from "./types";

export const STEP_COUNT = 8;

/** The step names, for a label beside the count if wanted. Index 0 is step 1. */
export const STEP_LABELS: readonly string[] = [
  "Rooms",
  "Hands",
  "Feeling",
  "Keep",
  "Reading",
  "Travel",
  "Rather not",
  "Your words",
];

export const STEP_OF: Readonly<Record<string, number>> = {
  "wings-1": 1,
  "wings-2": 1,
  "wings-3": 1,
  playoff: 1,
  "hands-mushrooms": 2,
  "hands-owls": 2,
  "hands-fish": 2,
  "feel-circles": 3,
  "feel-roads": 3,
  "feel-rooms": 3,
  keep: 4,
  "read-1": 5,
  "read-2": 5,
  destinations: 6,
  "rather-not": 7,
  "look-at": 8,
};

/** The distinct steps the asked questions fall into, in order — a narrow database skips some. */
export function stepsAsked(asked: readonly Question[]): number[] {
  return [
    ...new Set(
      asked
        .map((q) => STEP_OF[q.id])
        .filter((s): s is number => s !== undefined),
    ),
  ];
}
