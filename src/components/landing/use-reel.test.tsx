// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TEMPOS } from "./tempos";
import { GATE_DEADLINE_MS, useReel, type ReelOptions } from "./use-reel";

function setup(overrides: Partial<ReelOptions> = {}) {
  const onFirstPass = vi.fn();
  const readySet = new Set<number>(Array.from({ length: 12 }, (_, i) => i));
  const options: ReelOptions = {
    count: 12,
    tempo: TEMPOS.cut,
    enabled: true,
    isReady: (i) => readySet.has(i),
    readyVersion: 0,
    onFirstPass,
    ...overrides,
  };
  const view = renderHook((p: ReelOptions) => useReel(p), {
    initialProps: options,
  });
  return { ...view, onFirstPass, options, readySet };
}

/** One `act` per step: each automatic step's timer is armed by an effect that runs only after
 *  the previous step has flushed. */
const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });
const steps = (n: number, ms: number) => {
  for (let i = 0; i < n; i++) advance(ms);
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useReel — cut", () => {
  it("starts when enabled and gated, steps every frameMs, fires onFirstPass after 12 frames and wraps", () => {
    const { result, onFirstPass } = setup();
    expect(result.current.started).toBe(true);
    expect(result.current.index).toBe(0);
    for (let i = 1; i < 12; i++) {
      advance(350);
      expect(result.current.index).toBe(i);
    }
    expect(onFirstPass).not.toHaveBeenCalled();
    advance(350); // the 12th frame has held → the first pass is done, and the reel wraps
    expect(onFirstPass).toHaveBeenCalledTimes(1);
    expect(result.current.index).toBe(0);
    steps(12, 350);
    expect(onFirstPass).toHaveBeenCalledTimes(1);
  });

  it("does nothing while disabled (the overture is playing)", () => {
    const { result, rerender, options } = setup({ enabled: false });
    expect(result.current.started).toBe(false);
    steps(5, 350);
    expect(result.current.index).toBe(0);
    rerender({ ...options, enabled: true });
    expect(result.current.started).toBe(true);
    advance(350);
    expect(result.current.index).toBe(1);
  });

  it("does not start until gateFrames pictures are ready", () => {
    const readySet = new Set<number>([0, 1, 2]);
    const { result, rerender, options } = setup({
      isReady: (i) => readySet.has(i),
    });
    expect(result.current.started).toBe(false);
    advance(2000);
    expect(result.current.index).toBe(0);
    readySet.add(3);
    rerender({ ...options, isReady: (i) => readySet.has(i), readyVersion: 1 });
    expect(result.current.started).toBe(true);
    advance(350);
    expect(result.current.index).toBe(1);
  });

  it("skips a frame that is not ready and keeps time (Review Focus 1)", () => {
    const { result, readySet } = setup();
    readySet.delete(1);
    advance(350);
    expect(result.current.index).toBe(2);
  });

  it("prev is the frame just left, for the leaving layer", () => {
    const { result } = setup();
    expect(result.current.prev).toBeNull();
    advance(350);
    expect(result.current.prev).toBe(0);
    advance(350);
    expect(result.current.prev).toBe(1);
  });

  it("skip() fires onFirstPass once, now, and the pictures keep moving", () => {
    const { result, onFirstPass } = setup();
    act(() => result.current.skip());
    act(() => result.current.skip());
    expect(onFirstPass).toHaveBeenCalledTimes(1);
    advance(350);
    expect(result.current.index).toBe(1);
  });

  it("restart() returns to 0 and re-arms the first pass", () => {
    const { result, onFirstPass } = setup();
    act(() => result.current.skip());
    steps(3, 350);
    act(() => result.current.restart());
    expect(result.current.index).toBe(0);
    expect(result.current.prev).toBeNull();
    steps(12, 350);
    expect(onFirstPass).toHaveBeenCalledTimes(2);
  });

  it("advance(±1) steps, wraps, and re-arms the timer from now", () => {
    const { result } = setup();
    advance(300);
    act(() => result.current.advance(1));
    expect(result.current.index).toBe(1);
    advance(100); // the step that was 50 ms away must not fire
    expect(result.current.index).toBe(1);
    advance(250);
    expect(result.current.index).toBe(2);
    act(() => result.current.advance(-1));
    act(() => result.current.advance(-1));
    expect(result.current.index).toBe(0);
    act(() => result.current.advance(-1));
    expect(result.current.index).toBe(11);
  });

  it("changing tempo re-arms at the new cadence (the gear change behind the sheet)", () => {
    const { result, rerender, options } = setup();
    advance(350);
    rerender({ ...options, tempo: TEMPOS.dissolve });
    advance(350);
    expect(result.current.index).toBe(1);
    advance(6000);
    expect(result.current.index).toBe(2);
  });

  it("decodes arriving mid-frame do not push the next step back", () => {
    const { result, rerender, options } = setup();
    advance(200);
    rerender({ ...options, readyVersion: 5 });
    advance(150);
    expect(result.current.index).toBe(1);
  });
});

// Review finding 1 (09-25-26): a picture that fails (a 502 from a cold museum fill, a row retired
// between pick and paint) must never leave a first-time visitor on the wordmark.
describe("useReel — failed pictures", () => {
  it("a failed picture in the gate: starts on the first ready one once the gate's pictures have all settled", () => {
    const failed = new Set<number>([0]);
    const readySet = new Set<number>([1, 2, 3]);
    const { result } = setup({
      isReady: (i) => readySet.has(i),
      isFailed: (i) => failed.has(i),
    });
    expect(result.current.started).toBe(true);
    expect(result.current.index).toBe(1);
    expect(result.current.prev).toBeNull();
  });

  it("waits while a gate picture is still in flight (neither ready nor failed)", () => {
    const readySet = new Set<number>([1, 2]);
    const { result } = setup({
      isReady: (i) => readySet.has(i),
      isFailed: (i) => i === 0,
    });
    expect(result.current.started).toBe(false);
  });

  it("the deadline: if nothing is ever ready, the sheet rises anyway", () => {
    const { result, onFirstPass } = setup({ isReady: () => false });
    expect(result.current.started).toBe(false);
    advance(GATE_DEADLINE_MS - 1);
    expect(onFirstPass).not.toHaveBeenCalled();
    advance(1);
    expect(onFirstPass).toHaveBeenCalledTimes(1);
  });

  it("the deadline clock only runs once the reel is enabled (not during the overture)", () => {
    const { onFirstPass, rerender, options } = setup({
      isReady: () => false,
      enabled: false,
    });
    advance(GATE_DEADLINE_MS * 2);
    expect(onFirstPass).not.toHaveBeenCalled();
    rerender({ ...options, enabled: true });
    advance(GATE_DEADLINE_MS);
    expect(onFirstPass).toHaveBeenCalledTimes(1);
  });
});

describe("useReel — dissolve", () => {
  it("two frames then the sheet: onFirstPass after the second picture has held", () => {
    const { result, onFirstPass } = setup({ tempo: TEMPOS.dissolve });
    advance(6000);
    expect(result.current.index).toBe(1);
    expect(onFirstPass).not.toHaveBeenCalled();
    advance(6000);
    expect(onFirstPass).toHaveBeenCalledTimes(1);
    expect(result.current.index).toBe(2);
  });

  it("holds when no other picture is ready, then moves as soon as one decodes", () => {
    const readySet = new Set<number>([0]);
    const { result, rerender, options } = setup({
      tempo: TEMPOS.dissolve,
      isReady: (i) => readySet.has(i),
    });
    expect(result.current.started).toBe(true);
    advance(6000);
    expect(result.current.index).toBe(0);
    readySet.add(1);
    rerender({ ...options, isReady: (i) => readySet.has(i), readyVersion: 1 });
    advance(0); // the wake is deferred one tick; no second frameMs wait
    expect(result.current.index).toBe(1);
  });

  it("with one picture (the fallback) the reel never steps but the first pass still fires", () => {
    const { result, onFirstPass } = setup({
      count: 1,
      tempo: TEMPOS.dissolve,
      isReady: () => true,
    });
    steps(2, 6000);
    expect(result.current.index).toBe(0);
    expect(onFirstPass).toHaveBeenCalledTimes(1);
  });
});
