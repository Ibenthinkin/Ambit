// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSwipeBack } from "./use-swipe-back";

// jsdom has no `PointerEvent` constructor, and the hook only reads `clientX`/`clientY`/`timeStamp`
// — a MouseEvent carrying the right type name is indistinguishable from the listener's point of
// view. `timeStamp` is read-only on a constructed event and always 0 in jsdom, which would make
// every gesture look instantaneous (i.e. always a flick); overriding it is the only way to test the
// slow/fast distinction at all.
const pointer = (type: string, x: number, y: number, at = 0) => {
  const e = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
  Object.defineProperty(e, "timeStamp", { value: at });
  return e;
};

/** Comfortably outside the 300ms flick window, so only the distance threshold can commit. */
const SLOW = 800;

const onCommit = vi.fn();

// Rendered rather than `renderHook`ed: the hook's whole behaviour lives in an effect that attaches
// native listeners to the ref'd node, so the ref has to be attached by React, before that effect
// runs — which is exactly what a real consumer does and what `renderHook` can't reproduce.
function Swipeable() {
  const ref = useSwipeBack({ onCommit });
  return <div ref={ref} data-testid="wrapper" />;
}

describe("useSwipeBack", () => {
  let el: HTMLElement;

  beforeEach(() => {
    onCommit.mockClear();
    el = render(<Swipeable />).getByTestId("wrapper");
  });

  it("follows the finger at a fraction of its travel", () => {
    el.dispatchEvent(pointer("pointerdown", 0, 0));
    el.dispatchEvent(pointer("pointermove", 100, 0));

    // 0.35× under-follow: enough to feel connected, little enough that a wobble doesn't shift the
    // page visibly.
    expect(el.style.transform).toBe("translateX(35px)");
  });

  it("abandons the gesture when the axis resolves vertical", () => {
    el.dispatchEvent(pointer("pointerdown", 0, 0));
    el.dispatchEvent(pointer("pointermove", 20, 60));

    expect(el.style.transform).toBe("");

    // And having abandoned, it stays abandoned for the rest of this press — a scroll that drifts
    // sideways at the end must not suddenly become a back gesture.
    el.dispatchEvent(pointer("pointerup", 200, 60));
    expect(onCommit).not.toHaveBeenCalled();
  });

  // The axis is decided once, at the slop, and held. This used to be re-tested on every move and
  // abandoned permanently the first time vertical won — so a swipe that started sideways and then
  // arced down (what a thumb pivoting from its knuckle does) died halfway across, and the page
  // snapped back for no visible reason. That was the 08-21-26 "left to right is too hard" report.
  it("keeps following a swipe that starts sideways and then arcs downward", () => {
    el.dispatchEvent(pointer("pointerdown", 0, 0));
    el.dispatchEvent(pointer("pointermove", 30, 6, 60)); // horizontal wins → locked to x
    expect(el.style.transform).toBe("translateX(10.5px)");

    // Now well below the horizontal. The old code abandoned here.
    el.dispatchEvent(pointer("pointermove", 100, 140, 200));
    expect(el.style.transform).toBe("translateX(35px)");

    el.dispatchEvent(pointer("pointerup", 100, 140, 200));
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("commits a short, fast flick that never travelled far", () => {
    el.dispatchEvent(pointer("pointerdown", 0, 0));
    el.dispatchEvent(pointer("pointermove", 40, 0, 120)); // under COMMIT_PX, inside the window
    el.dispatchEvent(pointer("pointerup", 40, 0, 120));

    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("commits past the distance threshold even when slow, and settles the page back", () => {
    el.dispatchEvent(pointer("pointerdown", 0, 0));
    el.dispatchEvent(pointer("pointermove", 120, 10, SLOW));
    el.dispatchEvent(pointer("pointerup", 120, 10, SLOW));

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(el.style.transform).toBe("");
    expect(el.style.transition).toContain("transform");
  });

  it("snaps back on a swipe that was neither far enough nor fast enough", () => {
    el.dispatchEvent(pointer("pointerdown", 0, 0));
    el.dispatchEvent(pointer("pointermove", 40, 0, SLOW));
    el.dispatchEvent(pointer("pointerup", 40, 0, SLOW));

    expect(onCommit).not.toHaveBeenCalled();
    expect(el.style.transform).toBe("");
  });

  it("ignores a release that never began on the element", () => {
    el.dispatchEvent(pointer("pointerup", 300, 0));

    expect(onCommit).not.toHaveBeenCalled();
  });
});
