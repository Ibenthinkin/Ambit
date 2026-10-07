// Which layout a question takes (DESIGN_redesign §5.2). Pure, like the rest of lib/interview/,
// so the rule is tested without a browser.
//
// (Until the redesign this file also chose a column — 600 px for words, 1120 px for pictures,
// `columnFor`. The redesign has one container, max 1120 px, for every screen, so that went.)
import type { KeyKind } from "./keys";
import type { Question } from "./types";

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
 * The keyboard's name for the screen (keys.ts — the kinds are DESIGN §5.2's layout names, not
 * the bank's question kinds). The shell hands it to `keyAction` with the option count.
 *
 *   pairs   a pair                                 ← → pick a side, B both
 *   read    a choice of article cards              1–4, N, arrows + Enter
 *   rooms   any other choice of pictures           1–4, N, arrows + Enter
 *   keep    a picture multi with no cap            ← pass, → keep
 *   travel  a multi of typeset cards               arrows + Enter
 *   avoid   any other multi — a list of chips      arrows + Enter
 *   text    a text box                             nothing (the box owns the keys)
 *   none    a choice of words                      nothing
 */
export function keyKindOf(q: Question): KeyKind {
  const allFaced = q.options.length > 0 && q.options.every((o) => o.face);
  switch (q.kind) {
    case "pair":
      return "pairs";
    case "text":
      return "text";
    case "choice":
      if (!allFaced) return "none";
      return q.options.some((o) => o.face?.writing) ? "read" : "rooms";
    case "multi":
      if (q.options.some((o) => o.card)) return "travel";
      return allFaced && !q.max ? "keep" : "avoid";
  }
}
