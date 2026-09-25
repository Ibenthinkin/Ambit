// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OVERTURE, OVERTURE_MS, useOverture } from "./use-overture";

const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useOverture", () => {
  it("runs in → collapse at holdMs → done at holdMs + collapseMs (3.6 s)", () => {
    const { result } = renderHook(() => useOverture(true));
    expect(result.current.phase).toBe("in");
    advance(OVERTURE.holdMs - 1);
    expect(result.current.phase).toBe("in");
    advance(1);
    expect(result.current.phase).toBe("collapse");
    advance(OVERTURE.collapseMs - 1);
    expect(result.current.phase).toBe("collapse");
    advance(1);
    expect(result.current.phase).toBe("done");
    expect(OVERTURE_MS).toBe(3600);
  });

  it("is done on the first render when disabled — no flash, not a fast-forward (Review Focus 3)", () => {
    const { result } = renderHook(() => useOverture(false));
    expect(result.current.phase).toBe("done");
  });

  it("starts from `in` when it becomes enabled after the first render (hydration)", () => {
    const { result, rerender } = renderHook(({ on }) => useOverture(on), {
      initialProps: { on: false },
    });
    rerender({ on: true });
    expect(result.current.phase).toBe("in");
    advance(OVERTURE_MS);
    expect(result.current.phase).toBe("done");
  });

  it("pins the reference's numbers", () => {
    expect(OVERTURE).toEqual({
      fadeInMs: 500,
      holdMs: 1400,
      collapseMs: 2200,
      tailFadeMs: 1600,
    });
  });
});
