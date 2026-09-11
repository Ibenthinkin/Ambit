"use client";

import * as React from "react";

// The picture rail's whole input surface, in one place: every way a finger can talk to the hero
// strip at the top of `/i/[itemId]` (the merged item screen since 09-10-26 — until then this drove
// the full-screen gallery at `/g/`).
//
// The strip has no chrome to speak of by default — no buttons, nothing to press. What it has
// instead is a small vocabulary of gestures, and this hook is the state machine that tells them
// apart from one another and from the accidents (a resting thumb, a scroll, an iOS system swipe).
// Four outcomes, distinguished by which axis won, which way it went, how far, and how fast:
//
//   - **tap** — no travel at all. Toggles the chrome.
//   - **advance** — a horizontal drag past 15% of the screen, or a quick short flick. The rail
//     moves one cell.
//   - **exit** — a quick **downward** flick that began with the page scrolled to the top, or any
//     two-finger movement.
//   - **nothing** — everything else, which snaps back. That includes every upward movement: up is
//     the browser's, because the item's details are on the page below the picture.
//
// **Two things learned on the 08-21-26 device pass, both of which shape the code below.**
//
//   1. **Every commit needs a velocity path.** Distance-only thresholds punish the confident flick
//      and reward the hesitant drag, which is backwards. Each threshold here is now "far enough OR
//      fast enough".
//   2. **The axis has to be locked, not re-decided at release.** A thumb swipe arcs. Judging
//      horizontal-vs-vertical from the *final* delta means a perfectly good sideways swipe that
//      drifted down finishes as "vertical" and does nothing. The axis is now decided once, the
//      moment the gesture clears the slop, and held for the rest of it.
//
// **Why the exit is speed-only.** Until the screen merge it had a slow far-drag path too (a
// 150px shove at any speed). A slow downward drag at the top of a scrolling page is iOS overscroll,
// though, and the two would fight — so only a flick leaves. See {@link EXIT_FAST_PX}.
//
// Sibling to `use-swipe-back.ts` and built the same way: native listeners on a ref'd node, so a
// gesture in flight never re-renders the screen it's driving. This one is the bigger of the two,
// and it should read like the same author wrote it.
//
// **Never `preventDefault` on move** (same rule as `use-swipe-back`). The track carries
// `touch-action: pan-y` instead, which tells the browser up front that vertical panning is its own
// and horizontal is ours — declared rather than fought for. Under `pan-y` the browser may fire
// `pointercancel` once it commits to a scroll; a single-finger cancel is therefore discarded,
// exactly as an interruption is.

/** Past this much travel in either axis, a press stops being a tap. The app-wide slop is 12px; the gallery's own prototype uses 8, and the tighter value wins on a screen with no other targets. */
const SLOP_PX = 8;

/**
 * A horizontal drag commits at this fraction of the track's width — the slow, deliberate path.
 *
 * Was 0.2 through the 08-21-26 device pass, where a 20%-of-screen minimum with no velocity path at
 * all made ordinary swiping "quite hard" (Ben's words). 0.15 plus {@link FLICK_PX} is the fix: a
 * careful drag still has to travel, a confident flick doesn't.
 */
const ADVANCE_FRACTION = 0.15;

/**
 * The fast path, and the one a real thumb actually uses: this much travel inside {@link FLICK_MS}
 * commits regardless of how far across the screen it got.
 *
 * A swipe is not a measured drag. Distance-only thresholds punish exactly the gesture people
 * perform most confidently — the quick flick that covers 50px in 150ms and lets go — and reward the
 * hesitant one. Every horizontal commit in this hook offers both. (The exit is the exception, and
 * speed-only on purpose — see {@link EXIT_FAST_PX}.)
 */
const FLICK_PX = 40;
const FLICK_MS = 300;

/**
 * The exit: a quick **downward** flick, this much travel inside {@link EXIT_FAST_MS}, that began
 * with the page scrolled to the top.
 *
 * Down, not up, since the screen merge (09-10-26, docs/DESIGN_screen-structure.md decision 4).
 * The picture now sits on top of a page you scroll — the details are under it — so an upward
 * move is the browser's, and the track says so with `touch-action: pan-y`. A downward move at
 * scroll position 0 is the one vertical gesture the browser has no use for, which is exactly why
 * iOS Photos uses it to dismiss. There is deliberately no slow far-drag path any more: a slow
 * downward drag at the top is overscroll, and the two would fight.
 */
const EXIT_FAST_PX = 80;
const EXIT_FAST_MS = 320;

export interface UseRailGesturesOptions {
  /** A press that never moved. */
  onTap: () => void;
  /** A committed horizontal drag. `1` moves the rail forward (finger travelled left). */
  onAdvance: (dir: 1 | -1) => void;
  /** A quick downward flick from the top of the page, or any two-finger movement. */
  onExit: () => void;
}

export interface RailGestures {
  /** Spread onto the track element — it must also carry `touch-action: pan-y`. */
  ref: React.RefObject<HTMLDivElement | null>;
  /** Live horizontal travel, in px, while a single-finger horizontal drag is in flight; else 0. */
  dragPx: number;
  /** Whether a drag is currently in flight — the caller uses it to drop its transition. */
  dragging: boolean;
}

export function useRailGestures({
  onTap,
  onAdvance,
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
  const handlers = React.useRef({ onTap, onAdvance, onExit });
  React.useEffect(() => {
    handlers.current = { onTap, onAdvance, onExit };
  });

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let startX = 0;
    let startY = 0;
    let startedAt = 0;
    /** Whether the page was scrolled to the top when the press began — the exit's precondition. */
    let atTop = false;
    let moved = false;
    /**
     * Decided once, the moment the gesture clears the slop, and held. Re-deciding at release is what
     * made an arcing thumb swipe fail — see the header note.
     */
    let axis: "x" | "y" | null = null;
    /** Sticky for the whole gesture: a second finger at any point makes this a two-finger swipe. */
    let multiTouch = false;
    let tracking = false;
    /** Live ids, so a second finger is detected on its own `pointerdown` rather than inferred. */
    const active = new Set<number>();

    const reset = () => {
      tracking = false;
      moved = false;
      axis = null;
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
      startX = e.clientX;
      startY = e.clientY;
      startedAt = e.timeStamp;
      atTop = window.scrollY <= 0;
      moved = false;
      axis = null;
      multiTouch = false;
      tracking = true;
      setDragging(true);
    };

    const move = (e: PointerEvent) => {
      if (!tracking) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (!moved && (Math.abs(dx) > SLOP_PX || Math.abs(dy) > SLOP_PX)) {
        moved = true;
        // The one and only axis decision. Ties go to horizontal: the rail is the gesture this
        // screen is mostly for, and a dead-diagonal swipe is far more often someone flicking
        // sideways with a lazy wrist than someone aiming straight up.
        axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
      }

      // Only a single-finger drag locked to the horizontal moves the rail. A vertical drag is either
      // the browser's scroll or an exit flick, and letting it leak into `dragPx` would slide the
      // picture sideways while the page moves under the reader's thumb.
      setDragPx(axis === "x" && !multiTouch ? dx : 0);
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
      const lockedAxis = axis;

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

      if (lockedAxis === "y") {
        // Only a downward flick, only from the top of the page, only fast. See EXIT_FAST_PX.
        const fast = dy > EXIT_FAST_PX && elapsed < EXIT_FAST_MS;
        if (dy > 0 && atTop && fast) cb.onExit();
        return;
      }

      if (lockedAxis === "x") {
        // Far enough OR fast enough. The distance is measured against the track's own width rather
        // than assumed — it's full-bleed, so that's the only honest scale for "far".
        const far = Math.abs(dx) > el.offsetWidth * ADVANCE_FRACTION;
        const fast = Math.abs(dx) > FLICK_PX && elapsed < FLICK_MS;
        if (far || fast) cb.onAdvance(dx < 0 ? 1 : -1);
      }
      // Everything else falls through to the snap-back the caller animates when `dragPx` returns
      // to 0 — which `reset()` above has already done.
    };

    /**
     * **A cancelled two-finger gesture still counts as an exit.**
     *
     * iOS Safari fires `pointercancel` the moment it decides a multi-touch gesture belongs to the
     * system rather than to the page — and it does that for two-finger swipes whatever the
     * `touch-action`. Discarding the gesture there meant the two-finger exit was thrown away at
     * precisely the moment it was recognised, which is why it "barely fires" (device pass,
     * 08-21-26). Single-finger cancels are still discarded: those are genuine interruptions (a
     * call arriving, the app backgrounding) or, under `pan-y`, the browser taking a scroll.
     */
    const cancel = (e: PointerEvent) => {
      active.delete(e.pointerId);
      const rescued = multiTouch && moved;
      const cb = handlers.current;
      reset();
      if (rescued) cb.onExit();
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
