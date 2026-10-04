"use client";

import * as React from "react";

// The picture rail's whole input surface, in one place: every way a finger can talk to the hero
// strip at the top of `/i/[itemId]` (the merged item screen since 09-10-26 — until then this drove
// the full-screen gallery at `/g/`).
//
// The strip has no chrome to speak of by default — no buttons, nothing to press. What it has
// instead is a small vocabulary of gestures, and this hook is the state machine that tells them
// apart from one another and from the accidents (a resting thumb, a scroll, an iOS system swipe).
// Seven outcomes since 10-04-26 (docs/DESIGN_hero-zoom.md D2), distinguished by how many
// fingers, which axis won, which way it went, how far, how fast, and whether the picture is
// already zoomed:
//
//   - **tap** — no travel at all. Toggles the chrome — or, on a desktop spread, focuses the page
//     that was clicked, which is why the tap reports where it landed
//     (docs/DESIGN_spread-mode.md D2).
//   - **double-tap** — a second tap within {@link DOUBLE_TAP_MS} and {@link DOUBLE_TAP_PX} of the
//     first, from a touch. Zooms in or out. The first tap is *not* delayed: it fires as a tap.
//   - **advance** — a horizontal drag past 15% of the screen, or a quick short flick. The rail
//     moves one cell. Only while not zoomed.
//   - **exit** — a quick **downward** flick that began with the page scrolled to the top. Only
//     while not zoomed. (Until 10-04-26 any two-finger movement exited too; that gesture is the
//     pinch now, and the exit is the flick, Escape, or the pill.)
//   - **pinch** — a second finger, when the screen says it may (`zoomable`). Reports the fingers'
//     distance ratio and midpoint on every move until one lifts. Never moves the rail.
//   - **pan** — one finger while the picture is zoomed (`zoomed`). Reports its travel from where it
//     went down; the rail does not move and nothing else fires.
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
// **Never `preventDefault` on a one-finger move** (same rule as `use-swipe-back`). The track
// carries `touch-action: pan-y` instead (`none` while zoomed — `HeroRail` flips it), which tells
// the browser up front that vertical panning is its own and horizontal is ours — declared rather
// than fought for. Under `pan-y` the browser may fire `pointercancel` once it commits to a
// scroll; a single-finger cancel is therefore discarded, exactly as an interruption is.
//
// **The one exception is two touches** (D2). iOS claims a two-finger gesture for the system — a
// page zoom or a scroll — the moment it decides it is one, and cancels our pointers; a pinch
// recognised here would be thrown away as it was recognised. So a `touchmove` with two or more
// touches is cancelled (a non-passive listener, the only one in the app), and so are Safari's
// proprietary `gesturestart`/`gesturechange`, which is what its own pinch handling listens to.
// One-touch moves are never cancelled. The device pass (docs/PLAN_hero-zoom.md Task 7) decides
// whether both listeners are needed on current iOS; drop whichever proves redundant, here and in
// the design.

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

/**
 * A double-tap: the second tap this soon after, and this close to, the first (D2). iOS's own
 * double-tap window is ~300ms; 30px is a thumb landing twice on the same spot. The first tap is
 * delivered at once — delaying it would make the chrome toggle feel late — so a double-tap is
 * "a tap, then a double-tap", never two taps.
 */
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_PX = 30;

export interface UseRailGesturesOptions {
  /**
   * A press that never moved. `clientX` is where it was released, so a screen showing two pages
   * side by side can tell which one was pressed.
   */
  onTap: (tap: { clientX: number }) => void;
  /** A committed horizontal drag. `1` moves the rail forward (finger travelled left). */
  onAdvance: (dir: 1 | -1) => void;
  /** A quick downward flick from the top of the page. */
  onExit: () => void;

  // ── zoom (docs/DESIGN_hero-zoom.md D2) ──────────────────────────────────────────────────────
  /** Whether a second finger may begin a pinch. False in a spread and over the end card. */
  zoomable?: boolean;
  /** Whether the picture is zoomed. One finger then pans it; advance and exit are suspended. */
  zoomed?: boolean;
  /** A second finger landed. The midpoint, in client px. */
  onPinchStart?: (p: { cx: number; cy: number }) => void;
  /** Two fingers moved. `ratio` is their distance over the distance at start; `cx`/`cy` the midpoint now. */
  onPinch?: (p: { ratio: number; cx: number; cy: number }) => void;
  /** One of the two fingers lifted (or the system cancelled them). */
  onPinchEnd?: () => void;
  /** A single finger began to pan the zoomed picture. */
  onPanStart?: () => void;
  /** …and moved: travel from where it went down, in client px. */
  onPan?: (p: { dx: number; dy: number }) => void;
  /** …and lifted or was cancelled. */
  onPanEnd?: () => void;
  /** A second tap inside the double-tap window. Where it landed, in client px. */
  onDoubleTap?: (tap: { clientX: number; clientY: number }) => void;
}

export interface RailGestures {
  /** Spread onto the track element — it must also carry `touch-action: pan-y` (`none` while zoomed). */
  ref: React.RefObject<HTMLDivElement | null>;
  /** Live horizontal travel, in px, while a single-finger horizontal drag is in flight; else 0. */
  dragPx: number;
  /** Whether a drag is currently in flight — the caller uses it to drop its transition. */
  dragging: boolean;
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(b.x - a.x, b.y - a.y);

export function useRailGestures(options: UseRailGesturesOptions): RailGestures {
  const ref = React.useRef<HTMLDivElement>(null);
  const [dragPx, setDragPx] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);

  // Every option reaches the listeners through one ref, so the effect below attaches exactly
  // once. Inline arrows in a dependency array would tear the listeners down and rebuild them on
  // every parent render — and this hook's parent re-renders on every cell change, which is how a
  // gesture starts dropping events mid-swipe. Same lesson as `BottomSheet`'s `onCloseRef` and
  // `useSwipeBack`'s `commitRef`. `zoomable`/`zoomed` ride along: a gesture reads the *current*
  // mode on every event, which is what lets a pinch end and the next finger-down be a pan.
  const handlers = React.useRef(options);
  React.useEffect(() => {
    handlers.current = options;
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
    /** Sticky for the whole gesture: a second finger at any point means this was never a one-finger gesture. */
    let multiTouch = false;
    /** The first finger is being followed for tap / drag / pan. */
    let tracking = false;
    /** Two fingers are down and the screen is being told about them. */
    let pinching = false;
    /** The fingers' distance when the pinch began — the ratio's denominator. */
    let pinchDist0 = 1;
    /** Whether `onPanStart` has been sent for the pan in flight. */
    let panning = false;
    /** Where and when the last tap landed, for the double-tap window. */
    let lastTap: { x: number; y: number; at: number } | null = null;
    /** Every live pointer's position, by id. The first two are the pinch's fingers. */
    const points = new Map<number, { x: number; y: number }>();

    const reset = () => {
      tracking = false;
      moved = false;
      axis = null;
      multiTouch = false;
      pinching = false;
      panning = false;
      points.clear();
      setDragPx(0);
      setDragging(false);
    };

    /** The pinch's two fingers: the first two pointers down, in landing order (a Map keeps it). */
    const pair = () => {
      const [a, b] = points.values();
      return a && b ? ([a, b] as const) : null;
    };

    const down = (e: PointerEvent) => {
      points.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const h = handlers.current;

      if (points.size === 2) {
        // A second finger. The gesture is a two-finger one from here on, whatever happens — a
        // one-finger drag in flight is over, the rail snaps back, and if the screen allows it the
        // two fingers are a pinch.
        multiTouch = true;
        tracking = false;
        if (panning) {
          panning = false;
          h.onPanEnd?.();
        }
        setDragPx(0);
        setDragging(false);
        if (!h.zoomable) return;
        const p = pair();
        if (!p) return;
        pinching = true;
        pinchDist0 = dist(p[0], p[1]) || 1;
        h.onPinchStart?.({
          cx: (p[0].x + p[1].x) / 2,
          cy: (p[0].y + p[1].y) / 2,
        });
        return;
      }
      if (points.size > 2) return; // A third finger is nobody's.

      startX = e.clientX;
      startY = e.clientY;
      startedAt = e.timeStamp;
      atTop = window.scrollY <= 0;
      moved = false;
      axis = null;
      multiTouch = false;
      panning = false;
      tracking = true;
      setDragging(true);
    };

    const move = (e: PointerEvent) => {
      const pt = points.get(e.pointerId);
      if (pt) {
        pt.x = e.clientX;
        pt.y = e.clientY;
      }
      const h = handlers.current;

      if (pinching) {
        const p = pair();
        if (!p) return;
        h.onPinch?.({
          ratio: dist(p[0], p[1]) / pinchDist0,
          cx: (p[0].x + p[1].x) / 2,
          cy: (p[0].y + p[1].y) / 2,
        });
        return;
      }

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

      // Zoomed: the finger drives the picture, not the rail. Both axes, no lock, no dragPx.
      if (h.zoomed) {
        if (!moved || multiTouch) return;
        if (!panning) {
          panning = true;
          h.onPanStart?.();
        }
        h.onPan?.({ dx, dy });
        return;
      }

      // Only a single-finger drag locked to the horizontal moves the rail. A vertical drag is either
      // the browser's scroll or an exit flick, and letting it leak into `dragPx` would slide the
      // picture sideways while the page moves under the reader's thumb.
      setDragPx(axis === "x" && !multiTouch ? dx : 0);
    };

    /**
     * The pinch is over because a finger lifted or the system took it. If one finger is still
     * down and the picture is zoomed, that finger pans from where it is now — `moved` is set so
     * its eventual lift is never mistaken for a tap.
     */
    const endPinch = () => {
      pinching = false;
      handlers.current.onPinchEnd?.();
      const [rest] = points.values();
      if (points.size === 1 && rest) {
        startX = rest.x;
        startY = rest.y;
        moved = true;
        axis = null;
        tracking = true;
        if (handlers.current.zoomed) {
          // A pan, from here. It is a one-finger gesture now, so the two-finger flag goes:
          // it is what would otherwise stop `move` from reporting the pan.
          multiTouch = false;
          panning = true;
          handlers.current.onPanStart?.();
        }
        // Not zoomed: the finger is followed so its lift is swallowed (neither a tap nor an
        // advance — `multiTouch` stays set for that), but it pans nothing.
      } else if (points.size === 0) {
        reset();
      }
    };

    const up = (e: PointerEvent) => {
      points.delete(e.pointerId);
      const h = handlers.current;

      if (pinching) {
        // A third finger lifting leaves the pinch intact (review focus 2).
        if (points.size >= 2) return;
        endPinch();
        return;
      }

      if (!tracking) {
        // A finger that was never followed (a third one, or the second of a non-zoomable pair).
        if (points.size === 0) reset();
        return;
      }

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const elapsed = e.timeStamp - startedAt;
      // Read the verdict flags *before* resetting — `reset()` clears them, and the whole
      // classification below depends on them.
      const wasMultiTouch = multiTouch;
      const hadMoved = moved;
      const lockedAxis = axis;
      const wasPanning = panning;

      reset();

      // The finger left after a pinch, or the first of a non-zoomable pair: nothing more to say.
      if (wasMultiTouch && !wasPanning) return;

      if (!hadMoved) {
        // A tap — or the second half of a double-tap, from a touch. The first tap was delivered
        // as a tap already; the second is only ever a double-tap. A mouse never double-taps:
        // the desktop's click-to-toggle is unchanged (review focus 5).
        const now = e.timeStamp;
        if (
          e.pointerType !== "mouse" &&
          lastTap &&
          now - lastTap.at < DOUBLE_TAP_MS &&
          Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) <
            DOUBLE_TAP_PX
        ) {
          lastTap = null;
          h.onDoubleTap?.({ clientX: e.clientX, clientY: e.clientY });
          return;
        }
        lastTap = { x: e.clientX, y: e.clientY, at: now };
        h.onTap({ clientX: e.clientX });
        return;
      }

      // A pan ends where the finger lifts; the screen settles it. Nothing else fires while zoomed.
      if (wasPanning) {
        h.onPanEnd?.();
        return;
      }
      if (h.zoomed) return;

      if (lockedAxis === "y") {
        // Only a downward flick, only from the top of the page, only fast. See EXIT_FAST_PX.
        const fast = dy > EXIT_FAST_PX && elapsed < EXIT_FAST_MS;
        if (dy > 0 && atTop && fast) h.onExit();
        return;
      }

      if (lockedAxis === "x") {
        // Far enough OR fast enough. The distance is measured against the track's own width rather
        // than assumed — it's full-bleed, so that's the only honest scale for "far".
        const far = Math.abs(dx) > el.offsetWidth * ADVANCE_FRACTION;
        const fast = Math.abs(dx) > FLICK_PX && elapsed < FLICK_MS;
        if (far || fast) h.onAdvance(dx < 0 ? 1 : -1);
      }
      // Everything else falls through to the snap-back the caller animates when `dragPx` returns
      // to 0 — which `reset()` above has already done.
    };

    /**
     * A cancel mid-pinch ends the pinch (the screen's settle makes any interruption safe); a
     * cancel mid-pan ends the pan the same way. A single-finger cancel otherwise is still a
     * discard: a genuine interruption (a call arriving, the app backgrounding) or, under `pan-y`,
     * the browser taking a scroll.
     */
    const cancel = (e: PointerEvent) => {
      points.delete(e.pointerId);
      if (pinching) {
        if (points.size >= 2) return; // a third finger's cancel is nobody's
        pinching = false;
        handlers.current.onPinchEnd?.();
      } else if (panning) {
        handlers.current.onPanEnd?.();
      }
      reset();
    };

    // The two-touch exception to "never preventDefault on move" — see the header.
    const touchMove = (e: TouchEvent) => {
      if (e.touches.length >= 2 && handlers.current.zoomable)
        e.preventDefault();
    };
    const gesture = (e: Event) => {
      if (handlers.current.zoomable) e.preventDefault();
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", cancel);
    el.addEventListener("touchmove", touchMove, { passive: false });
    el.addEventListener("gesturestart", gesture);
    el.addEventListener("gesturechange", gesture);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancel);
      el.removeEventListener("touchmove", touchMove);
      el.removeEventListener("gesturestart", gesture);
      el.removeEventListener("gesturechange", gesture);
    };
  }, []);

  return { ref, dragPx, dragging };
}
