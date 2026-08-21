// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useChromeCycle } from "./use-chrome-cycle";

// Rendered rather than `renderHook`ed, for consistency with the other hook tests in this directory
// — and because what the caller actually consumes is a rendered value plus two callbacks. The two
// callbacks are reached through real buttons rather than a captured reference, which is both what a
// consumer does and what keeps the component free of writes to module scope.
function Chrome() {
  const { visible, toggle, reset } = useChromeCycle();
  return (
    <>
      <span data-testid="state">{visible ? "shown" : "hidden"}</span>
      <button data-testid="toggle" onClick={toggle} />
      <button data-testid="reset" onClick={reset} />
    </>
  );
}

const state = () => screen.getAllByTestId("state")[0]!.textContent;
const press = (which: "toggle" | "reset") =>
  fireEvent.click(screen.getAllByTestId(which)[0]!);
const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe("useChromeCycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    render(<Chrome />);
  });
  afterEach(() => vi.useRealTimers());

  it("starts hidden — the picture is the screen", () => {
    expect(state()).toBe("hidden");
  });

  it("cycles on its own at ten-second boundaries, both ways", () => {
    tick(9_999);
    expect(state()).toBe("hidden");

    tick(1);
    expect(state()).toBe("shown");

    // A cycle, not a timeout: it goes back down again on its own too.
    tick(10_000);
    expect(state()).toBe("hidden");

    tick(10_000);
    expect(state()).toBe("shown");
  });

  it("toggle flips immediately and restarts the phase from there", () => {
    tick(8_000);
    press("toggle");
    expect(state()).toBe("shown");

    // The old phase had 2s left on it; a full fresh 10s is what should be running instead.
    tick(2_000);
    expect(state()).toBe("shown");

    tick(8_000);
    expect(state()).toBe("hidden");
  });

  it("reset hides immediately and restarts, even from already-hidden", () => {
    press("toggle");
    expect(state()).toBe("shown");

    press("reset");
    expect(state()).toBe("hidden");

    // The interesting case: resetting hidden chrome changes no visible state, but must still
    // restart the timer — otherwise a run of swipes would let a stale phase surface the chrome
    // moments after a picture the reader has already moved on from.
    tick(9_000);
    press("reset");
    tick(9_000);
    expect(state()).toBe("hidden");

    tick(1_000);
    expect(state()).toBe("shown");
  });

  it("clears its timer on unmount", () => {
    // A second instance alongside the one `beforeEach` mounted, so the count can be watched
    // dropping by exactly one. An uncleared timer here fires into an unmounted component — the
    // gallery unmounts this on every exit, so a leak would be one per visit.
    const { unmount } = render(<Chrome />);
    const before = vi.getTimerCount();

    unmount();

    expect(vi.getTimerCount()).toBe(before - 1);
  });
});
