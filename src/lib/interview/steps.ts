// The progress indicator counts STEPS, not questions (docs/DESIGN_first-exhibition.md §1): three
// wing screens and the playoff are one step ("Rooms"), three hands pairs another, and so on.
// Keyed by question id so the bank can be reordered without touching this file's meaning.
// bank.test.ts pins that every question has a step and the steps are 1…STEP_COUNT-1 contiguous
// (the last step, About you, is a screen of its own, not a bank question).
import type { Question } from "./types";

export const STEP_COUNT = 10;

/** The step names, for a label beside the count if wanted. Index 0 is step 1. */
export const STEP_LABELS: readonly string[] = [
  "Rooms",
  "Hands",
  "Feeling",
  "Keep",
  "Reading",
  "Travel",
  "Rather not",
  "How much",
  "Your words",
  "About you",
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
  amount: 8,
  "look-at": 9,
  "read-watch": 9,
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
