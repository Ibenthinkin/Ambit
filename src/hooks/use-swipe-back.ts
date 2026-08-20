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
// abandons itself the moment vertical travel wins, and the wrapper carries `touch-action: pan-y`
// so the browser knows vertical panning always belongs to it.

/** Past this much horizontal travel (and under this much vertical), the gesture commits. */
const COMMIT_PX = 70;
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
    let dx = 0;

    const reset = () => {
      startX = null;
      dx = 0;
    };

    const down = (e: PointerEvent) => {
      startX = e.clientX;
      startY = e.clientY;
      dx = 0;
      el.style.transition = "";
    };

    const move = (e: PointerEvent) => {
      if (startX === null) return;
      const nextDx = e.clientX - startX;
      const dy = e.clientY - startY;
      // The reader is scrolling, not swiping. Let go of the gesture entirely rather than fighting
      // for it — and put the page back where it was.
      if (Math.abs(dy) > Math.abs(nextDx)) {
        el.style.transform = "";
        reset();
        return;
      }
      dx = nextDx;
      el.style.transform = `translateX(${dx * FOLLOW}px)`;
    };

    const up = (e: PointerEvent) => {
      if (startX === null) return;
      const dy = e.clientY - startY;
      const committed = Math.abs(dx) > COMMIT_PX && Math.abs(dy) < COMMIT_PX;
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
