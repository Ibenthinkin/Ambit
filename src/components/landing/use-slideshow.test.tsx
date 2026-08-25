// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSlideshow, type SlideshowOptions } from "./use-slideshow";

const SLIDE_MS = 600;
const END_MS = 260;

function setup(overrides: Partial<SlideshowOptions> = {}) {
  const onDone = vi.fn();
  const options: SlideshowOptions = {
    count: 3,
    slideMs: SLIDE_MS,
    enabled: true,
    endDelayMs: END_MS,
    onDone,
    ...overrides,
  };
  const view = renderHook((props: SlideshowOptions) => useSlideshow(props), {
    initialProps: options,
  });
  return { ...view, onDone, options };
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

describe("useSlideshow", () => {
  it("advances one slide per slideMs, then hands off after the end delay", () => {
    const { result, onDone } = setup({ count: 3 });

    expect(result.current.index).toBe(0);

    advance(SLIDE_MS);
    expect(result.current.index).toBe(1);

    advance(SLIDE_MS);
    expect(result.current.index).toBe(2);
    // On the last slide the run is not over yet — it holds for the handoff beat.
    expect(onDone).not.toHaveBeenCalled();
    expect(result.current.running).toBe(true);

    advance(END_MS);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(result.current.running).toBe(false);
    // The last slide stays on screen behind the sheet rather than resetting.
    expect(result.current.index).toBe(2);
  });

  it("waits for `enabled` — a slow first decode must not burn slide 0's time", () => {
    const { result, rerender, onDone, options } = setup({ enabled: false });

    advance(5_000);
    expect(result.current.index).toBe(0);
    expect(onDone).not.toHaveBeenCalled();

    rerender({ ...options, enabled: true });
    advance(SLIDE_MS);
    expect(result.current.index).toBe(1);
  });

  it("skip() ends the run immediately and stops the cycle dead", () => {
    const { result, onDone } = setup({ count: 8 });

    advance(SLIDE_MS);
    expect(result.current.index).toBe(1);

    act(() => result.current.skip());
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(result.current.running).toBe(false);

    // Nothing further happens — no stray timer advances the index behind the sheet.
    advance(5_000);
    expect(result.current.index).toBe(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("skip() is idempotent — a double tap raises the sheet once", () => {
    const { result, onDone } = setup();

    act(() => result.current.skip());
    act(() => result.current.skip());

    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("does not fire onDone twice when the run ends on its own and is then skipped", () => {
    const { result, onDone } = setup({ count: 2 });

    // Advanced in two steps, not one: `act` flushes state at the end of its block, so the effect
    // that schedules the handoff timer isn't registered until the slide's own advance has
    // returned. Real time doesn't have that seam — this is a fake-timer artifact, not behaviour.
    advance(SLIDE_MS);
    advance(END_MS);
    expect(onDone).toHaveBeenCalledTimes(1);

    act(() => result.current.skip());
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("restart() replays the run from slide 0 and can finish again", () => {
    const { result, onDone } = setup({ count: 2 });

    advance(SLIDE_MS);
    advance(END_MS);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(result.current.index).toBe(1);

    act(() => result.current.restart());
    expect(result.current.index).toBe(0);
    expect(result.current.running).toBe(true);

    advance(SLIDE_MS);
    advance(END_MS);
    expect(onDone).toHaveBeenCalledTimes(2);
  });

  it("does nothing at all with an empty run", () => {
    const { result, onDone } = setup({ count: 0 });

    advance(10_000);
    expect(result.current.index).toBe(0);
    expect(onDone).not.toHaveBeenCalled();
  });

  it("survives a changing onDone identity without restarting the cycle", () => {
    const first = vi.fn();
    const second = vi.fn();
    const base: SlideshowOptions = {
      count: 2,
      slideMs: SLIDE_MS,
      enabled: true,
      endDelayMs: END_MS,
      onDone: first,
    };
    const { rerender } = renderHook(
      (props: SlideshowOptions) => useSlideshow(props),
      { initialProps: base },
    );

    advance(SLIDE_MS);
    // A parent re-render with a fresh inline callback mid-run.
    rerender({ ...base, onDone: second });
    advance(END_MS);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
