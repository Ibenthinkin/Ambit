// Which column a questionnaire screen takes on a desktop (docs/PLAN_onboarding-critique.md Task
// 1.7). Pure, like the rest of lib/interview/, so the rule is tested without a browser.
//
// Ben's critique (10-05-26): in the 600 px onboarding column the picture cards came out 110–140
// px wide — thumbnails, for a step whose whole point is looking. So a step that shows pictures
// (or typeset cards) takes the 1120 px `wide` column, and a step of words — a text box, a row of
// chips — stays in the 600 px `narrow` one, where a line of type reads well.
// Below `md` (768 px) both are full width, so a phone sees no change at all.
import type { Question } from "./types";

/** The screen's phases (onboarding-screen.tsx). */
export type Phase = "intro" | "questions" | "interpreting" | "reveal";

/**
 * Does this question render as a grid of cards? A choice or multi whose every answer has a face
 * (the wings, the playoff, the keep grid, the reading cards), or any with a typeset card (the
 * destinations). Everything else is chips, a text box, or — for a pair — two cards side by side.
 */
export function rendersCards(q: Question): boolean {
  if (q.kind !== "choice" && q.kind !== "multi") return false;
  const allFaced = q.options.length > 0 && q.options.every((o) => o.face);
  return allFaced || q.options.some((o) => o.card);
}

/**
 * The column for what is on screen. The reveal stays narrow for now: it is one stacked column
 * until the reveal is laid out again in two (the plan's Cut 4), and widening it before then would
 * only stretch its rows.
 */
export function columnFor(
  q: Question | undefined,
  phase: Phase,
): "narrow" | "wide" {
  if (phase !== "questions" || !q) return "narrow";
  return q.kind === "pair" || rendersCards(q) ? "wide" : "narrow";
}
