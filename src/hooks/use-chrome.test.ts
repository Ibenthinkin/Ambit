// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stubMatchMedia } from "~/test/match-media";
import {
  CHROME_IDLE_MS,
  SCROLL_SHOW_PX,
  chromeReducer,
  useChrome,
} from "./use-chrome";
import { DESKTOP_QUERY } from "./use-media-query";

// The item screen's chrome rules (docs/DESIGN_redesign.md decision 7) — two rule sets, one per
// side of `md`. The reducer is pinned on its own, then the hook: the hook adds only the idle
// timer and the choice of rule set, which is what the fake-timer tests below are for.

const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe("chromeReducer", () => {
  const hidden = { visible: false, wakes: 0 };

  it("on a phone a tap flips, both ways", () => {
    const shown = chromeReducer(hidden, { type: "toggle", desktop: false });
    expect(shown.visible).toBe(true);
    expect(
      chromeReducer(shown, { type: "toggle", desktop: false }).visible,
    ).toBe(false);
  });

  it("on a phone a wake is nothing — a tap's compatibility mousemove must not undo a hide", () => {
    expect(chromeReducer(hidden, { type: "wake", desktop: false })).toBe(
      hidden,
    );
  });

  it("on a computer a tap is a wake, never a hide", () => {
    const shown = chromeReducer(hidden, { type: "toggle", desktop: true });
    expect(shown.visible).toBe(true);
    const again = chromeReducer(shown, { type: "toggle", desktop: true });
    expect(again.visible).toBe(true);
    // …and restarts the idle timer.
    expect(again.wakes).toBeGreaterThan(shown.wakes);
  });

  it("on a computer only idleness hides — a new picture is input, not a reason to hide", () => {
    const shown = { visible: true, wakes: 3 };
    expect(chromeReducer(shown, { type: "hide", desktop: true })).toBe(shown);
    expect(chromeReducer(shown, { type: "idle", desktop: true }).visible).toBe(
      false,
    );
  });
});

describe("useChrome on a phone", () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("starts hidden — the picture is the screen", () => {
    const { result } = renderHook(() => useChrome());
    expect(result.current.visible).toBe(false);
  });

  it("toggle() flips it, and nothing hides it on a clock", () => {
    const { result } = renderHook(() => useChrome());
    act(() => result.current.toggle());
    expect(result.current.visible).toBe(true);
    tick(60_000);
    expect(result.current.visible).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.visible).toBe(false);
  });

  it(`a scroll past ${SCROLL_SHOW_PX} px shows it; a tap still hides it; scrolling back up does not`, () => {
    const { result } = renderHook(() => useChrome());
    act(() => result.current.onScroll(SCROLL_SHOW_PX));
    expect(result.current.visible).toBe(false); // *past* 24, not at it
    act(() => result.current.onScroll(25));
    expect(result.current.visible).toBe(true);
    act(() => result.current.onScroll(0));
    expect(result.current.visible).toBe(true); // it stays
    act(() => result.current.toggle());
    expect(result.current.visible).toBe(false); // a tap always toggles
    act(() => result.current.onScroll(10));
    expect(result.current.visible).toBe(false); // above 24: no show, and no hide either
  });

  it("wake() does nothing — no mouse rule below md", () => {
    const { result } = renderHook(() => useChrome());
    act(() => result.current.wake());
    expect(result.current.visible).toBe(false);
  });

  it("hide() puts it away — a new picture, a zoom", () => {
    const { result } = renderHook(() => useChrome());
    act(() => result.current.toggle());
    act(() => result.current.hide());
    expect(result.current.visible).toBe(false);
  });
});

describe("useChrome on a computer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stubMatchMedia([DESKTOP_QUERY]);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("starts hidden; wake() shows it; 2600 ms of nothing hides it", () => {
    expect(CHROME_IDLE_MS).toBe(2600);
    const { result } = renderHook(() => useChrome());
    expect(result.current.visible).toBe(false);
    act(() => result.current.wake());
    expect(result.current.visible).toBe(true);
    tick(2599);
    expect(result.current.visible).toBe(true);
    tick(1);
    expect(result.current.visible).toBe(false);
  });

  it("leaves no timer behind when it unmounts mid-countdown", () => {
    const { result, unmount } = renderHook(() => useChrome());
    act(() => result.current.wake());
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a wake at 2000 ms restarts the timer", () => {
    const { result } = renderHook(() => useChrome());
    act(() => result.current.wake());
    tick(2000);
    act(() => result.current.wake());
    tick(2000); // 4000 since the first wake, 2000 since the second
    expect(result.current.visible).toBe(true);
    tick(600);
    expect(result.current.visible).toBe(false);
  });

  it("a scroll at any depth is a wake, and the clock still runs", () => {
    const { result } = renderHook(() => useChrome());
    act(() => result.current.onScroll(3));
    expect(result.current.visible).toBe(true);
    tick(CHROME_IDLE_MS);
    expect(result.current.visible).toBe(false);
  });

  it("hide() is ignored — only idleness hides on a computer", () => {
    const { result } = renderHook(() => useChrome());
    act(() => result.current.wake());
    act(() => result.current.hide());
    expect(result.current.visible).toBe(true);
  });
});
