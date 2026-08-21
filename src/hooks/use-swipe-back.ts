"use client";

import * as React from "react";

// Horizontal swipe-back for the item page: drag right and the page follows your thumb, let go past
// the threshold and it leaves.
//
// **The follow is the whole point.** A gesture that does nothing until it fires reads as a
// keyboard shortcut you happen to perform with your hand; one that tracks the finger tells you it
// heard you, and tells you how far you have to go. 0.35× is a deliberate under-follow — enough
// motion to feel connected, little enough that a stray horizontal wobble during a scroll doesn't
// visibly shift the page.
//
// **Pointer events only.** The prototype registers touch *and* pointer handlers; on iOS Safari
// both fire, which double-counts every movement. Pointer events cover mouse, touch, and pencil on
// every browser this PWA targets.
//
// **Never `preventDefault` on move.** The window is the scroller (as on `/feed`), and cancelling a
// move that turns out to be vertical would kill the reader's scroll mid-flick. Instead the gesture
// hands itself to the scroller the moment the axis resolves vertical, and the wrapper carries
// `touch-action: pan-y` so the browser knows vertical panning always belongs to it.
//
// **The axis is decided once and held** (08-21-26 device pass). This used to re-test it on *every*
// move and abandon the gesture permanently the first time vertical travel won — so a swipe that
// started cleanly sideways and then arced down, which is what a thumb pivoting from its knuckle
// does, died halfway across and the page snapped back for no visible reason. Ben's report was that
// left-to-right was "too hard to do"; it wasn't the threshold, it was this. The one decision now
// happens at {@link SLOP_PX}, before either axis has had a chance to accumulate noise.

/** Travel in either axis that ends the undecided phase and locks the gesture to one of them. */
const SLOP_PX = 8;

/** Past this much horizontal travel, a slow drag commits. */
const COMMIT_PX = 56;

/**
 * The fast path: this much travel inside {@link FLICK_MS} commits regardless of distance. A swipe
 * is a flick, not a measured drag, and a distance-only threshold punishes the confident gesture
 * while rewarding the hesitant one. Same two-way test as `use-rail-gestures`.
 */
const FLICK_PX = 32;
const FLICK_MS = 300;
/** How much of the finger's travel the page actually moves. */
const FOLLOW = 0.35;
/** The settle back to rest, whether the gesture committed or was abandoned. */
const SETTLE = "transform .22s ease";

export interface UseSwipeBackOptions {
  /** Called once, on release, when the gesture passed the threshold. */
  onCommit: () => void;
}

/**
 * Returns a ref to attach to the element that should follow the finger — typically the page's
 * content wrapper. Listeners are native and attached to that node, so nothing re-renders while a
 * gesture is in flight.
 */
export function useSwipeBack({ onCommit }: UseSwipeBackOptions) {
  const ref = React.useRef<HTMLDivElement>(null);

  // The callback reaches the listeners through a ref so the effect below can attach exactly once
  // — an inline arrow in the deps would tear down and re-register on every parent render, which
  // is how a gesture starts dropping events (same lesson as `BottomSheet`'s `onCloseRef`).
  const commitRef = React.useRef(onCommit);
  React.useEffect(() => {
    commitRef.current = onCommit;
  });

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let startX: number | null = null;
    let startY = 0;
    let startedAt = 0;
    let dx = 0;
    /** Decided once, at the slop, and held for the rest of the gesture. See the header note. */
    let axis: "x" | "y" | null = null;

    const reset = () => {
      startX = null;
      dx = 0;
      axis = null;
    };

    const down = (e: PointerEvent) => {
      startX = e.clientX;
      startY = e.clientY;
      startedAt = e.timeStamp;
      dx = 0;
      axis = null;
      el.style.transition = "";
    };

    const move = (e: PointerEvent) => {
      if (startX === null) return;
      const nextDx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (axis === null) {
        if (Math.abs(nextDx) <= SLOP_PX && Math.abs(dy) <= SLOP_PX) return;
        axis = Math.abs(nextDx) >= Math.abs(dy) ? "x" : "y";
        if (axis === "y") {
          // The reader is scrolling, not swiping. Let go of the gesture entirely rather than
          // fighting for it — and put the page back where it was. This is the *only* place that
          // verdict is reached, and it is final: a scroll that drifts sideways at the end must not
          // suddenly become a back gesture.
          el.style.transform = "";
          reset();
          return;
        }
      }
      if (axis !== "x") return;

      dx = nextDx;
      el.style.transform = `translateX(${dx * FOLLOW}px)`;
    };

    const up = (e: PointerEvent) => {
      if (startX === null) return;
      const elapsed = e.timeStamp - startedAt;
      // Far enough OR fast enough. No vertical veto here any more — the axis lock already decided
      // this was a swipe, and re-litigating it at release is the bug that made arcing thumbs fail.
      const committed =
        axis === "x" &&
        (Math.abs(dx) > COMMIT_PX ||
          (Math.abs(dx) > FLICK_PX && elapsed < FLICK_MS));
      el.style.transition = SETTLE;
      el.style.transform = "";
      reset();
      if (committed) commitRef.current();
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }, []);

  return ref;
}
