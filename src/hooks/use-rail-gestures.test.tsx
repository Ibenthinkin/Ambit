// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
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
const onOpenDetails = vi.fn();
const onExit = vi.fn();

// Rendered rather than `renderHook`ed: the behaviour lives in an effect that attaches native
// listeners to a ref'd node, so React has to attach the ref first — which is what a real consumer
// does and what `renderHook` can't reproduce.
function Track() {
  const { ref, dragPx, dragging } = useRailGestures({
    onTap,
    onAdvance,
    onOpenDetails,
    onExit,
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

/** jsdom reports every box as 0×0, so the track's size has to be stated for the hook to measure. */
const TRACK_W = 400;
const TRACK_H = 800;

describe("useRailGestures", () => {
  let el: HTMLElement;

  beforeEach(() => {
    onTap.mockClear();
    onAdvance.mockClear();
    onOpenDetails.mockClear();
    onExit.mockClear();

    el = render(<Track />).getByTestId("track");
    Object.defineProperty(el, "offsetWidth", {
      value: TRACK_W,
      configurable: true,
    });
    el.getBoundingClientRect = () =>
      ({ top: 0, left: 0, width: TRACK_W, height: TRACK_H }) as DOMRect;
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
      expect(onOpenDetails).not.toHaveBeenCalled();
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
    it("takes a long upward shove from the picture, whatever its speed", () => {
      fire("pointerdown", { x: 200, y: 300, at: 0 });
      fire("pointermove", { x: 200, y: 120, at: 900 });
      fire("pointerup", { x: 200, y: 120, at: 900 }); // 180px in 900ms: far, slow

      expect(onExit).toHaveBeenCalledTimes(1);
    });

    it("takes a quick flick that never travelled far", () => {
      fire("pointerdown", { x: 200, y: 300, at: 0 });
      fire("pointermove", { x: 200, y: 200, at: 150 });
      fire("pointerup", { x: 200, y: 200, at: 150 }); // 100px in 150ms

      expect(onExit).toHaveBeenCalledTimes(1);
    });

    it("ignores a slow, short upward drift — a reader who changed their mind", () => {
      fire("pointerdown", { x: 200, y: 300, at: 0 });
      fire("pointermove", { x: 200, y: 200, at: 900 });
      fire("pointerup", { x: 200, y: 200, at: 900 }); // 100px in 900ms: neither far nor fast

      expect(onExit).not.toHaveBeenCalled();
      expect(onOpenDetails).not.toHaveBeenCalled();
    });

    // iOS Safari fires `pointercancel` the moment it claims a multi-touch gesture for the system,
    // even under `touch-action: none`. Discarding the gesture there threw the two-finger exit away
    // at exactly the moment it was recognised — which is why it "barely fires" on device.
    it("survives Safari cancelling the gesture out from under it", () => {
      fire("pointerdown", { x: 200, y: 400, id: 1 });
      fire("pointerdown", { x: 240, y: 400, id: 2 });
      fire("pointermove", { x: 200, y: 300, id: 1 });
      fire("pointercancel", { x: 200, y: 300, id: 1 });

      expect(onExit).toHaveBeenCalledTimes(1);
    });

    it("still discards a cancelled single-finger gesture — that's an interruption, not a swipe", () => {
      fire("pointerdown", { x: 200, y: 400 });
      fire("pointermove", { x: 200, y: 200 });
      fire("pointercancel", { x: 200, y: 200 });

      expect(onExit).not.toHaveBeenCalled();
    });

    it("takes any two-finger movement, and ignores a two-finger rest", () => {
      fire("pointerdown", { x: 200, y: 400, id: 1 });
      fire("pointerdown", { x: 240, y: 400, id: 2 });
      fire("pointermove", { x: 200, y: 300, id: 1 });
      fire("pointerup", { x: 200, y: 300, id: 1 });
      expect(onExit).toHaveBeenCalledTimes(1);

      // Two fingers that never moved are two fingers resting on a picture, not a gesture.
      fire("pointerdown", { x: 200, y: 400, id: 1 });
      fire("pointerdown", { x: 240, y: 400, id: 2 });
      fire("pointerup", { x: 200, y: 400, id: 1 });
      expect(onExit).toHaveBeenCalledTimes(1);
      expect(onTap).not.toHaveBeenCalled(); // and emphatically not a tap
    });
  });

  describe("details", () => {
    it("opens on a slow upward drag from the bottom third", () => {
      // Bottom third of an 800px track starts at 533px.
      fire("pointerdown", { x: 200, y: 700, at: 0 });
      fire("pointermove", { x: 200, y: 620, at: 800 });
      fire("pointerup", { x: 200, y: 620, at: 800 });

      expect(onOpenDetails).toHaveBeenCalledTimes(1);
      expect(onExit).not.toHaveBeenCalled();
    });

    it("does not open from the picture above it, however far the drag went", () => {
      fire("pointerdown", { x: 200, y: 300, at: 0 });
      fire("pointermove", { x: 200, y: 220, at: 800 });
      fire("pointerup", { x: 200, y: 220, at: 800 });

      expect(onOpenDetails).not.toHaveBeenCalled();
    });

    it("ignores travel under the threshold", () => {
      fire("pointerdown", { x: 200, y: 700, at: 0 });
      fire("pointermove", { x: 200, y: 660, at: 800 }); // 40px, under 60
      fire("pointerup", { x: 200, y: 660, at: 800 });

      expect(onOpenDetails).not.toHaveBeenCalled();
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
