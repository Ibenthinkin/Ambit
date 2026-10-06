/**
 * The onboarding keyboard, as a pure function (DESIGN §5.1; behaviour from the
 * First Exhibition prototype's `onKey`). No React, no DOM: the shell (task 6.4)
 * decides *when* to call this (never while a text field has focus) and what
 * each action does; this decides what a key *means* on each kind of screen.
 *
 * Kinds are named after the layouts DESIGN §5.2 uses, not the bank's question
 * kinds: `rooms` and `read` are the four-card screens, `pairs` is a pair
 * question (hands, feeling), `keep` is keep-or-pass, `travel` and `avoid` are
 * the long chip/card lists. `text`, `bonus`, `intro` and `none` own no keys.
 */

export type KeyKind =
  | "rooms"
  | "read"
  | "pairs"
  | "keep"
  | "travel"
  | "avoid"
  | "bonus"
  | "text"
  | "intro"
  | "none";

export type KeyAction =
  | { type: "cursor"; index: number } // move the cursor here
  | { type: "pick"; index: number } // pick / toggle this card
  | { type: "none" } // N — skip the screen (the rooms', pairs' and reading screens' decline)
  | { type: "both" } // "Both, equally"
  | { type: "next" } // intro: begin
  | { type: "keep" }
  | { type: "pass" }
  | { type: "ignore" };

const IGNORE: KeyAction = { type: "ignore" };

/** Four-card screens: digits pick directly, N skips. */
const FOUR_CARD = new Set<KeyKind>(["rooms", "read"]);
/** Screens whose arrows walk a cursor and whose Enter picks under it. */
const CURSOR = new Set<KeyKind>(["rooms", "read", "travel", "avoid"]);

// The shell must preventDefault on any non-ignore action, and must skip keys held with
// Ctrl, Meta or Alt (otherwise Cmd+B fires `both`).
export function keyAction(
  kind: KeyKind,
  key: string,
  cursor: number | null,
  count: number,
): KeyAction {
  const k = key.toLowerCase();

  if (CURSOR.has(kind) && count > 0) {
    const back = k === "arrowleft" || k === "arrowup";
    if (back || k === "arrowright" || k === "arrowdown") {
      // From nowhere, forward lands on the first card and back on the last.
      if (cursor == null)
        return { type: "cursor", index: back ? count - 1 : 0 };
      return {
        type: "cursor",
        index: (cursor + (back ? -1 : 1) + count) % count,
      };
    }
    if (k === "enter")
      return cursor == null || cursor >= count
        ? IGNORE
        : { type: "pick", index: cursor };
  }

  if (FOUR_CARD.has(kind)) {
    if (/^[1-9]$/.test(k) && Number(k) <= Math.min(count, 4))
      return { type: "pick", index: Number(k) - 1 };
    if (k === "n") return { type: "none" };
  }

  if (kind === "intro" && (k === "enter" || /^[1-4]$/.test(k)))
    return { type: "next" };

  if (kind === "pairs") {
    if (k === "arrowleft") return { type: "pick", index: 0 };
    if (k === "arrowright") return { type: "pick", index: 1 };
    if (k === "b") return { type: "both" };
    if (k === "n") return { type: "none" };
  }

  if (kind === "keep") {
    if (k === "arrowleft") return { type: "pass" };
    if (k === "arrowright") return { type: "keep" };
  }

  return IGNORE;
}
