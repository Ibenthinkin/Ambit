// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSwipeBack } from "./use-swipe-back";

// jsdom has no `PointerEvent` constructor, and the hook only ever reads `clientX`/`clientY` — a
// MouseEvent carrying the right type name is indistinguishable from the listener's point of view.
const pointer = (type: string, x: number, y: number) =>
  new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });

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

  it("abandons the gesture the moment vertical travel wins", () => {
    el.dispatchEvent(pointer("pointerdown", 0, 0));
    el.dispatchEvent(pointer("pointermove", 20, 60));

    expect(el.style.transform).toBe("");

    // And having abandoned, it stays abandoned for the rest of this press — a scroll that drifts
    // sideways at the end must not suddenly become a back gesture.
    el.dispatchEvent(pointer("pointerup", 200, 60));
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("commits past the threshold, and settles the page back", () => {
    el.dispatchEvent(pointer("pointerdown", 0, 0));
    el.dispatchEvent(pointer("pointermove", 120, 10));
    el.dispatchEvent(pointer("pointerup", 120, 10));

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(el.style.transform).toBe("");
    expect(el.style.transition).toContain("transform");
  });

  it("snaps back without committing on a short swipe", () => {
    el.dispatchEvent(pointer("pointerdown", 0, 0));
    el.dispatchEvent(pointer("pointermove", 40, 0));
    el.dispatchEvent(pointer("pointerup", 40, 0));

    expect(onCommit).not.toHaveBeenCalled();
    expect(el.style.transform).toBe("");
  });

  it("ignores a release that never began on the element", () => {
    el.dispatchEvent(pointer("pointerup", 300, 0));

    expect(onCommit).not.toHaveBeenCalled();
  });
});
