// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSlideshow, type SlideshowOptions } from "./use-slideshow";

const SLIDE_MS = 600;
const END_MS = 260;

function setup(overrides: Partial<SlideshowOptions> = {}) {
  const onFirstPass = vi.fn();
  const options: SlideshowOptions = {
    count: 3,
    slideMs: SLIDE_MS,
    enabled: true,
    endDelayMs: END_MS,
    onFirstPass,
    ...overrides,
  };
  const view = renderHook((props: SlideshowOptions) => useSlideshow(props), {
    initialProps: options,
  });
  return { ...view, onFirstPass, options };
}

/** Advances fake timers inside `act` so React flushes the state updates they cause. */
function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// Each automatic step's timer is scheduled by an effect that runs only after the previous step has
// been flushed, so runs are stepped with one `advance` per slide rather than one long jump — `act`
// flushes state at the end of its block, a fake-timer seam real time doesn't have.
describe("useSlideshow", () => {
  it("advances one slide per slideMs, fires onFirstPass after the last one has held, and keeps going", () => {
    const { result, onFirstPass } = setup({ count: 3 });
    expect(result.current.index).toBe(0);
    advance(SLIDE_MS);
    expect(result.current.index).toBe(1);
    advance(SLIDE_MS);
    expect(result.current.index).toBe(2);
    // On the last slide of the first pass it holds for the handoff beat before anything happens.
    expect(onFirstPass).not.toHaveBeenCalled();

    // Then the sheet rises AND the cycle wraps to slide 0 in the same tick, and the pictures carry
    // on at the ordinary cadence behind it (09-10-26 — the show used to stop dead here).
    advance(END_MS);
    expect(onFirstPass).toHaveBeenCalledTimes(1);
    expect(result.current.index).toBe(0);
    advance(SLIDE_MS);
    expect(result.current.index).toBe(1);
    advance(SLIDE_MS);
    advance(SLIDE_MS); // 2 → wraps to 0 with no hold: the second pass is silent
    expect(result.current.index).toBe(0);
    expect(onFirstPass).toHaveBeenCalledTimes(1);
  });

  it("waits for `enabled` — a slow first decode must not burn slide 0's time", () => {
    const { result, rerender, onFirstPass, options } = setup({
      enabled: false,
    });
    advance(5_000);
    expect(result.current.index).toBe(0);
    expect(onFirstPass).not.toHaveBeenCalled();
    rerender({ ...options, enabled: true });
    advance(SLIDE_MS);
    expect(result.current.index).toBe(1);
  });

  it("skip() fires onFirstPass now, once, and does not stop the pictures", () => {
    const { result, onFirstPass } = setup({ count: 8 });
    advance(SLIDE_MS);
    act(() => result.current.skip());
    act(() => result.current.skip()); // a double tap raises the sheet once
    expect(onFirstPass).toHaveBeenCalledTimes(1);
    advance(SLIDE_MS);
    expect(result.current.index).toBe(2); // still moving behind the sheet
  });

  it("does not fire onFirstPass again when the pass ends after a skip", () => {
    const { result, onFirstPass } = setup({ count: 2 });
    act(() => result.current.skip());
    // After a skip the last slide has no hold — the pass has already been spent — so it wraps
    // after a plain slideMs; END_MS here is simply extra time.
    advance(SLIDE_MS);
    advance(END_MS);
    advance(SLIDE_MS);
    expect(onFirstPass).toHaveBeenCalledTimes(1);
  });

  it("does not fire onFirstPass twice when the pass ends on its own and is then skipped", () => {
    const { result, onFirstPass } = setup({ count: 2 });
    advance(SLIDE_MS);
    advance(END_MS);
    expect(onFirstPass).toHaveBeenCalledTimes(1);
    act(() => result.current.skip());
    expect(onFirstPass).toHaveBeenCalledTimes(1);
  });

  it("advance() steps either way, wraps at both ends, and restarts the slide timer", () => {
    const { result } = setup({ count: 3 });
    act(() => result.current.advance(-1));
    expect(result.current.index).toBe(2);
    act(() => result.current.advance(1));
    expect(result.current.index).toBe(0);

    // A step resets the clock: 500ms in, a click, and the next automatic advance is a full
    // slideMs away, not 100ms.
    advance(500);
    act(() => result.current.advance(1));
    expect(result.current.index).toBe(1);
    advance(SLIDE_MS - 100);
    expect(result.current.index).toBe(1);
    advance(100);
    expect(result.current.index).toBe(2);
  });

  it("restart() replays from slide 0 and fires onFirstPass again at the end of that pass", () => {
    const { result, onFirstPass } = setup({ count: 2 });
    advance(SLIDE_MS);
    advance(END_MS);
    expect(onFirstPass).toHaveBeenCalledTimes(1);
    act(() => result.current.restart());
    expect(result.current.index).toBe(0);
    advance(SLIDE_MS);
    advance(END_MS);
    expect(onFirstPass).toHaveBeenCalledTimes(2);
  });

  it("does nothing with an empty run", () => {
    const { result, onFirstPass } = setup({ count: 0 });
    act(() => result.current.advance(1));
    advance(5_000);
    expect(result.current.index).toBe(0);
    expect(onFirstPass).not.toHaveBeenCalled();
  });

  it("survives a changing onFirstPass identity without restarting the cycle", () => {
    const first = vi.fn();
    const second = vi.fn();
    const base: SlideshowOptions = {
      count: 2,
      slideMs: SLIDE_MS,
      enabled: true,
      endDelayMs: END_MS,
      onFirstPass: first,
    };
    const { rerender } = renderHook(
      (props: SlideshowOptions) => useSlideshow(props),
      { initialProps: base },
    );

    advance(SLIDE_MS);
    // A parent re-render with a fresh inline callback mid-run.
    rerender({ ...base, onFirstPass: second });
    advance(END_MS);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
