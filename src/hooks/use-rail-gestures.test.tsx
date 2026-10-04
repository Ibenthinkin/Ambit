// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useRailGestures } from "./use-rail-gestures";

// jsdom has no `PointerEvent` constructor, and the hook only reads `clientX`/`clientY`/`pointerId`/
// `timeStamp` — a MouseEvent carrying the right type name is indistinguishable from a listener's
// point of view. Same trick, same reason, as `use-swipe-back.test.tsx`.
function pointer(
  type: string,
  opts: { x: number; y: number; id?: number; at?: number },
) {
  const e = new MouseEvent(type, {
    clientX: opts.x,
    clientY: opts.y,
    bubbles: true,
  });
  Object.defineProperty(e, "pointerId", { value: opts.id ?? 1 });
  // `timeStamp` is read-only on a constructed event and always 0 in jsdom, which would make every
  // gesture look instantaneous — i.e. always a fast flick. Overriding it is the only way to test
  // the slow/fast distinction at all.
  Object.defineProperty(e, "timeStamp", { value: opts.at ?? 0 });
  return e;
}

const onTap = vi.fn();
const onAdvance = vi.fn();
const onExit = vi.fn();
const onPinchStart = vi.fn();
const onPinch = vi.fn();
const onPinchEnd = vi.fn();
const onPanStart = vi.fn();
const onPan = vi.fn();
const onPanEnd = vi.fn();
const onDoubleTap = vi.fn();
const ALL = [
  onTap,
  onAdvance,
  onExit,
  onPinchStart,
  onPinch,
  onPinchEnd,
  onPanStart,
  onPan,
  onPanEnd,
  onDoubleTap,
];

// Rendered rather than `renderHook`ed: the behaviour lives in an effect that attaches native
// listeners to a ref'd node, so React has to attach the ref first — which is what a real consumer
// does and what `renderHook` can't reproduce.
function Track({
  zoomable = true,
  zoomed = false,
}: {
  zoomable?: boolean;
  zoomed?: boolean;
}) {
  const { ref, dragPx, dragging } = useRailGestures({
    onTap,
    onAdvance,
    onExit,
    zoomable,
    zoomed,
    onPinchStart,
    onPinch,
    onPinchEnd,
    onPanStart,
    onPan,
    onPanEnd,
    onDoubleTap,
  });
  return (
    <div
      ref={ref}
      data-testid="track"
      data-drag={dragPx}
      data-dragging={dragging}
    />
  );
}

/** jsdom reports every box as 0×0, so the track's width has to be stated for the hook to measure. */
const TRACK_W = 400;

describe("useRailGestures", () => {
  let el: HTMLElement;

  /** Re-mount with options. The listeners read them through a ref, so the same node is fine. */
  const mount = (props: React.ComponentProps<typeof Track>) => {
    cleanup();
    el = render(<Track {...props} />).getByTestId("track");
    Object.defineProperty(el, "offsetWidth", {
      value: TRACK_W,
      configurable: true,
    });
  };

  beforeEach(() => {
    for (const f of ALL) f.mockClear();

    el = render(<Track />).getByTestId("track");
    Object.defineProperty(el, "offsetWidth", {
      value: TRACK_W,
      configurable: true,
    });
  });

  const fire = (
    type: string,
    opts: { x: number; y: number; id?: number; at?: number },
  ) => act(() => void el.dispatchEvent(pointer(type, opts)));

  const dragPx = () => Number(el.dataset.drag);

  describe("tap", () => {
    it("fires only when the press never moved", () => {
      fire("pointerdown", { x: 100, y: 100 });
      fire("pointerup", { x: 100, y: 100 });

      expect(onTap).toHaveBeenCalledTimes(1);
      expect(onAdvance).not.toHaveBeenCalled();
    });

    // Spread mode (docs/DESIGN_spread-mode.md D2): a tap on the unfocused page focuses it, so the
    // screen needs to know which half of the viewport the tap landed on.
    it("reports where the press was released", () => {
      fire("pointerdown", { x: 310, y: 100 });
      fire("pointerup", { x: 311, y: 101 });

      expect(onTap).toHaveBeenCalledWith({ clientX: 311 });
    });

    it("survives travel inside the slop, and dies just outside it", () => {
      fire("pointerdown", { x: 100, y: 100 });
      fire("pointermove", { x: 106, y: 104 }); // 6px, 4px — still a tap
      fire("pointerup", { x: 106, y: 104 });
      expect(onTap).toHaveBeenCalledTimes(1);

      fire("pointerdown", { x: 100, y: 100 });
      fire("pointermove", { x: 112, y: 100 }); // 12px — past the 8px slop
      fire("pointerup", { x: 112, y: 100 });
      expect(onTap).toHaveBeenCalledTimes(1); // unchanged
    });
  });

  describe("advance", () => {
    // Two ways to commit, and both matter: the device pass found a distance-only threshold made
    // ordinary swiping "quite hard", because the gesture people actually perform is a quick flick
    // that never travels far.
    it("commits on distance alone when the drag was slow, in both directions", () => {
      // 400px track → 60px distance threshold. 800ms is far outside the flick window.
      fire("pointerdown", { x: 300, y: 400, at: 0 });
      fire("pointermove", { x: 200, y: 400, at: 800 });
      fire("pointerup", { x: 200, y: 400, at: 800 });
      expect(onAdvance).toHaveBeenCalledWith(1); // finger left → rail forward

      fire("pointerdown", { x: 100, y: 400, at: 0 });
      fire("pointermove", { x: 200, y: 400, at: 800 });
      fire("pointerup", { x: 200, y: 400, at: 800 });
      expect(onAdvance).toHaveBeenCalledWith(-1);
      expect(onAdvance).toHaveBeenCalledTimes(2);
    });

    it("commits on speed alone when the flick was short", () => {
      // 45px — well under the 60px distance threshold — but inside the flick window.
      fire("pointerdown", { x: 300, y: 400, at: 0 });
      fire("pointermove", { x: 255, y: 400, at: 120 });
      fire("pointerup", { x: 255, y: 400, at: 120 });

      expect(onAdvance).toHaveBeenCalledWith(1);
    });

    it("snaps back when the drag was neither far enough nor fast enough", () => {
      fire("pointerdown", { x: 300, y: 400, at: 0 });
      fire("pointermove", { x: 250, y: 400, at: 800 }); // 50px, under 60, and slow
      expect(dragPx()).toBe(-50);

      fire("pointerup", { x: 250, y: 400, at: 800 });
      expect(onAdvance).not.toHaveBeenCalled();
      expect(dragPx()).toBe(0); // back to rest; the caller animates the return
    });

    // The axis is decided once, when the gesture clears the slop, and held. Re-deciding it at
    // release is what made an arcing thumb swipe fail — a sideways flick that drifted downward
    // finished as "vertical" and did nothing.
    it("locks to horizontal on the first real movement and stays there", () => {
      fire("pointerdown", { x: 200, y: 400, at: 0 });
      fire("pointermove", { x: 240, y: 405, at: 60 }); // horizontal wins → locked to x
      expect(dragPx()).toBe(40);

      // The thumb arcs well below the horizontal from here. The rail keeps following it.
      fire("pointermove", { x: 300, y: 560, at: 200 });
      expect(dragPx()).toBe(100);

      fire("pointerup", { x: 300, y: 560, at: 200 });
      expect(onAdvance).toHaveBeenCalledWith(-1);
      expect(onExit).not.toHaveBeenCalled();
    });

    it("locks to vertical just as firmly — a later sideways drift never reaches dragPx", () => {
      fire("pointerdown", { x: 200, y: 400 });
      fire("pointermove", { x: 220, y: 300 }); // mostly vertical → locked to y
      expect(dragPx()).toBe(0);

      fire("pointermove", { x: 320, y: 380 });
      expect(dragPx()).toBe(0);
    });
  });

  describe("exit", () => {
    // The screen scrolls now (the details live under the picture), so the exit had to move off
    // the up-flick — a fast upward move is also how you start scrolling, and Chrome hands the
    // touch to native scrolling mid-gesture. Down, at the top of the page, is unambiguous: the
    // browser has nowhere to scroll, and it is iOS Photos' own dismiss.
    beforeEach(() => {
      Object.defineProperty(window, "scrollY", {
        value: 0,
        configurable: true,
      });
    });

    it("takes a quick downward flick when the page is at the top", () => {
      fire("pointerdown", { x: 200, y: 200, at: 0 });
      fire("pointermove", { x: 200, y: 300, at: 150 });
      fire("pointerup", { x: 200, y: 300, at: 150 }); // 100px in 150ms

      expect(onExit).toHaveBeenCalledTimes(1);
    });

    it("ignores the same flick when the page is scrolled — that is a scroll back up", () => {
      Object.defineProperty(window, "scrollY", {
        value: 40,
        configurable: true,
      });
      fire("pointerdown", { x: 200, y: 200, at: 0 });
      fire("pointermove", { x: 200, y: 300, at: 150 });
      fire("pointerup", { x: 200, y: 300, at: 150 });

      expect(onExit).not.toHaveBeenCalled();
    });

    it("ignores a slow downward drag at the top — that is overscroll, or a reader thinking", () => {
      fire("pointerdown", { x: 200, y: 200, at: 0 });
      fire("pointermove", { x: 200, y: 400, at: 900 });
      fire("pointerup", { x: 200, y: 400, at: 900 }); // 200px in 900ms: far, but slow

      expect(onExit).not.toHaveBeenCalled();
    });

    it("never exits on an upward move of any speed — up is the browser's scroll", () => {
      fire("pointerdown", { x: 200, y: 300, at: 0 });
      fire("pointermove", { x: 200, y: 200, at: 150 });
      fire("pointerup", { x: 200, y: 200, at: 150 });

      expect(onExit).not.toHaveBeenCalled();
      expect(onTap).not.toHaveBeenCalled();
    });

    it("still discards a cancelled single-finger gesture — under pan-y that is the browser taking a scroll", () => {
      fire("pointerdown", { x: 200, y: 400 });
      fire("pointermove", { x: 200, y: 200 });
      fire("pointercancel", { x: 200, y: 200 });

      expect(onExit).not.toHaveBeenCalled();
      expect(onTap).not.toHaveBeenCalled();
    });
  });

  // docs/DESIGN_hero-zoom.md D2: two fingers are a pinch now, and the two-finger exit is gone.
  describe("pinch", () => {
    it("starts on the second finger with the midpoint, reports ratio + midpoint on moves, ends on a lift", () => {
      fire("pointerdown", { x: 100, y: 400, id: 1 });
      fire("pointerdown", { x: 300, y: 400, id: 2 });
      expect(onPinchStart).toHaveBeenCalledWith({ cx: 200, cy: 400 });

      // Fingers 200 apart → 400 apart, midpoint drifts right by 50.
      fire("pointermove", { x: 50, y: 400, id: 1 });
      fire("pointermove", { x: 450, y: 400, id: 2 });
      expect(onPinch).toHaveBeenLastCalledWith({ ratio: 2, cx: 250, cy: 400 });

      fire("pointerup", { x: 450, y: 400, id: 2 });
      expect(onPinchEnd).toHaveBeenCalledTimes(1);
      // The second finger's lift is not a tap, and nothing left.
      expect(onTap).not.toHaveBeenCalled();
      expect(onExit).not.toHaveBeenCalled();
      expect(onAdvance).not.toHaveBeenCalled();
    });

    it("never moves the rail: dragPx stays 0 under two fingers", () => {
      fire("pointerdown", { x: 100, y: 400, id: 1 });
      fire("pointermove", { x: 60, y: 400, id: 1 }); // a one-finger drag has begun…
      expect(dragPx()).toBe(-40);
      fire("pointerdown", { x: 300, y: 400, id: 2 }); // …until the second finger lands
      expect(dragPx()).toBe(0);
      fire("pointermove", { x: 0, y: 400, id: 1 });
      expect(dragPx()).toBe(0);
    });

    it("does nothing at all when not zoomable (a spread): no pinch, no exit, no tap", () => {
      mount({ zoomable: false });
      fire("pointerdown", { x: 200, y: 400, id: 1 });
      fire("pointerdown", { x: 240, y: 400, id: 2 });
      fire("pointermove", { x: 200, y: 300, id: 1 });
      fire("pointerup", { x: 200, y: 300, id: 1 });
      fire("pointerup", { x: 240, y: 400, id: 2 });
      for (const f of ALL) expect(f).not.toHaveBeenCalled();
    });

    it("ignores a third finger (review focus 2)", () => {
      fire("pointerdown", { x: 100, y: 400, id: 1 });
      fire("pointerdown", { x: 300, y: 400, id: 2 });
      fire("pointerdown", { x: 200, y: 600, id: 3 });
      expect(onPinchStart).toHaveBeenCalledTimes(1);
      fire("pointermove", { x: 50, y: 400, id: 1 });
      // Still the first two fingers' geometry: 250 apart over 200.
      expect(onPinch).toHaveBeenLastCalledWith({
        ratio: 1.25,
        cx: 175,
        cy: 400,
      });
      fire("pointerup", { x: 200, y: 600, id: 3 });
      expect(onPinchEnd).not.toHaveBeenCalled();
    });

    it("treats a cancel mid-pinch as the end of the pinch, not a discard", () => {
      fire("pointerdown", { x: 100, y: 400, id: 1 });
      fire("pointerdown", { x: 300, y: 400, id: 2 });
      fire("pointermove", { x: 50, y: 400, id: 1 });
      fire("pointercancel", { x: 50, y: 400, id: 1 });
      expect(onPinchEnd).toHaveBeenCalledTimes(1);
      expect(onExit).not.toHaveBeenCalled();
    });

    it("cancels the browser's own handling of a two-touch move, and never a one-touch one", () => {
      const two = new Event("touchmove", { cancelable: true });
      Object.defineProperty(two, "touches", { value: [{}, {}] });
      act(() => void el.dispatchEvent(two));
      expect(two.defaultPrevented).toBe(true);

      const one = new Event("touchmove", { cancelable: true });
      Object.defineProperty(one, "touches", { value: [{}] });
      act(() => void el.dispatchEvent(one));
      expect(one.defaultPrevented).toBe(false);
    });
  });

  it("abandons everything on pointercancel", () => {
    fire("pointerdown", { x: 300, y: 400 });
    fire("pointermove", { x: 100, y: 400 });
    fire("pointercancel", { x: 100, y: 400 });

    expect(dragPx()).toBe(0);
    expect(onAdvance).not.toHaveBeenCalled();
    expect(onTap).not.toHaveBeenCalled();
  });
});
