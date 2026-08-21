"use client";

import * as React from "react";

// The immersive gallery's whole input surface, in one place: every way a finger can talk to
// `/g/[itemId]`.
//
// The gallery has no chrome to speak of by default — no buttons, no scrollbar, nothing to press.
// What it has instead is a small vocabulary of gestures, and this hook is the state machine that
// tells them apart from one another and from the accidents (a resting thumb, a scroll that never
// was, an iOS system swipe). Five outcomes, distinguished by *where* the press started, which axis
// won, how far it went, and how fast:
//
//   - **tap** — no travel at all. Shows the chrome, or opens details if the chrome is already up.
//   - **advance** — a horizontal drag past a fifth of the screen. The rail moves one cell.
//   - **open details** — a slow upward drag from the **bottom third**, where a title and a hint sit
//     saying that's what's down there.
//   - **exit** — a *hard* upward flick from the **top two-thirds**, or any two-finger movement.
//   - **nothing** — everything else, which snaps back.
//
// **Why "hard" is measured two ways.** `|dy| > 150` catches a long deliberate shove; `|dy| > 80`
// within 320ms catches a quick flick that never travelled far. Distance alone would make a flick
// impossible and a slow drag inevitable, which is precisely backwards: a fast short movement is the
// more confident of the two.
//
// **Why the start position matters at all.** Up-to-exit and up-to-details are the same axis in the
// same direction, so something has to separate them. The screen does: the bottom third is where the
// details live (the title block is drawn there), and everything above it is the picture, which is
// the thing you're leaving. A reader never has to know the rule — they reach for what they can see.
//
// Sibling to `use-swipe-back.ts` and built the same way: native listeners on a ref'd node, so a
// gesture in flight never re-renders the screen it's driving. This one is the bigger of the two,
// and it should read like the same author wrote it.
//
// **Never `preventDefault` on move** (same rule as `use-swipe-back`). The track carries
// `touch-action: none` instead, which tells the browser up front that this element owns its
// gestures — declared rather than fought for.

/** Past this much travel in either axis, a press stops being a tap. The app-wide slop is 12px; the gallery's own prototype uses 8, and the tighter value wins on a screen with no other targets. */
const SLOP_PX = 8;

/** A horizontal drag commits at this fraction of the track's width. */
const ADVANCE_FRACTION = 0.2;

/** Where "the bottom third" starts, as a fraction of the track's height. */
const DETAILS_ZONE = 2 / 3;

/** Upward travel from the bottom third that opens the details sheet. */
const DETAILS_PX = 60;

/** A long, deliberate upward shove — exits regardless of speed. */
const EXIT_FAR_PX = 150;

/** A quick upward flick: this much travel inside {@link EXIT_FAST_MS} also exits. */
const EXIT_FAST_PX = 80;
const EXIT_FAST_MS = 320;

export interface UseRailGesturesOptions {
  /** A press that never moved. */
  onTap: () => void;
  /** A committed horizontal drag. `1` moves the rail forward (finger travelled left). */
  onAdvance: (dir: 1 | -1) => void;
  /** A slow upward drag from the bottom third. */
  onOpenDetails: () => void;
  /** A hard upward flick from the top two-thirds, or any two-finger movement. */
  onExit: () => void;
}

export interface RailGestures {
  /** Spread onto the track element — it must also carry `touch-action: none`. */
  ref: React.RefObject<HTMLDivElement | null>;
  /** Live horizontal travel, in px, while a single-finger horizontal drag is in flight; else 0. */
  dragPx: number;
  /** Whether a drag is currently in flight — the caller uses it to drop its transition. */
  dragging: boolean;
}

export function useRailGestures({
  onTap,
  onAdvance,
  onOpenDetails,
  onExit,
}: UseRailGesturesOptions): RailGestures {
  const ref = React.useRef<HTMLDivElement>(null);
  const [dragPx, setDragPx] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);

  // Every callback reaches the listeners through one ref, so the effect below attaches exactly
  // once. Inline arrows in a dependency array would tear the listeners down and rebuild them on
  // every parent render — and this hook's parent re-renders on every cell change, which is how a
  // gesture starts dropping events mid-swipe. Same lesson as `BottomSheet`'s `onCloseRef` and
  // `useSwipeBack`'s `commitRef`.
  const handlers = React.useRef({ onTap, onAdvance, onOpenDetails, onExit });
  React.useEffect(() => {
    handlers.current = { onTap, onAdvance, onOpenDetails, onExit };
  });

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let startX = 0;
    let startY = 0;
    let startedAt = 0;
    /** Fraction down the track where the press began — decides exit vs details. */
    let startFraction = 0;
    let moved = false;
    /** Sticky for the whole gesture: a second finger at any point makes this a two-finger swipe. */
    let multiTouch = false;
    let tracking = false;
    /** Live ids, so a second finger is detected on its own `pointerdown` rather than inferred. */
    const active = new Set<number>();

    const reset = () => {
      tracking = false;
      moved = false;
      multiTouch = false;
      active.clear();
      setDragPx(0);
      setDragging(false);
    };

    const down = (e: PointerEvent) => {
      active.add(e.pointerId);
      if (active.size > 1) {
        // The gesture is now a two-finger one and stays that way, even if a finger lifts. Nothing
        // else is recomputed — the first finger's origin remains the gesture's origin.
        multiTouch = true;
        return;
      }
      const rect = el.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startedAt = e.timeStamp;
      startFraction =
        rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0;
      moved = false;
      multiTouch = false;
      tracking = true;
      setDragging(true);
    };

    const move = (e: PointerEvent) => {
      if (!tracking) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > SLOP_PX || Math.abs(dy) > SLOP_PX) moved = true;

      // Only a single-finger, horizontally-dominant drag moves the rail. A vertical drag is on its
      // way to being an exit or a details-open, and letting it leak into `dragPx` would slide the
      // picture sideways while the reader is pulling it upward.
      const horizontal = Math.abs(dx) >= Math.abs(dy);
      setDragPx(horizontal && !multiTouch ? dx : 0);
    };

    const up = (e: PointerEvent) => {
      active.delete(e.pointerId);
      if (!tracking) {
        // A second finger lifting first: the gesture is still in flight on the other one.
        if (active.size === 0) reset();
        return;
      }

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const elapsed = e.timeStamp - startedAt;
      const cb = handlers.current;
      // Read the verdict flags *before* resetting — `reset()` clears them, and the whole
      // classification below depends on them.
      const wasMultiTouch = multiTouch;
      const hadMoved = moved;

      reset();

      // Two fingers that went anywhere at all: the design's "pinch out of the picture" exit. Judged
      // before anything else, because a two-finger movement's dx/dy are a fiction — they describe
      // one finger of a gesture that was never about one finger.
      if (wasMultiTouch) {
        if (hadMoved) cb.onExit();
        return;
      }

      if (!hadMoved) {
        cb.onTap();
        return;
      }

      const vertical = Math.abs(dy) > Math.abs(dx);
      if (vertical && dy < 0) {
        const travel = Math.abs(dy);
        const hard =
          travel > EXIT_FAR_PX ||
          (travel > EXIT_FAST_PX && elapsed < EXIT_FAST_MS);

        if (startFraction < DETAILS_ZONE) {
          // Started on the picture. Only a hard flick leaves; a gentle upward drift here is a
          // reader who changed their mind, and it should cost them nothing.
          if (hard) cb.onExit();
          return;
        }
        // Started on the title block at the foot of the screen, where the hint says details live.
        if (travel > DETAILS_PX) cb.onOpenDetails();
        return;
      }

      if (!vertical) {
        // A fifth of the screen, measured rather than assumed: the track is full-bleed, so its own
        // width is the only honest scale for "far enough".
        const threshold = el.offsetWidth * ADVANCE_FRACTION;
        if (Math.abs(dx) > threshold) cb.onAdvance(dx < 0 ? 1 : -1);
      }
      // Everything else falls through to the snap-back the caller animates when `dragPx` returns
      // to 0 — which `reset()` above has already done.
    };

    const cancel = (e: PointerEvent) => {
      active.delete(e.pointerId);
      reset();
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", cancel);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancel);
    };
  }, []);

  return { ref, dragPx, dragging };
}
