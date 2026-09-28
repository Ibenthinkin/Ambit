// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  HERO_LAYOUT_KEY,
  readHeroLayout,
  useHeroLayout,
  writeHeroLayout,
} from "./hero-layout";

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("hero layout store (docs/DESIGN_spread-mode.md D4)", () => {
  it("reads single when nothing is stored", () => {
    expect(readHeroLayout()).toBe("single");
  });

  it("round-trips spread through localStorage under the documented key", () => {
    writeHeroLayout("spread");
    expect(localStorage.getItem(HERO_LAYOUT_KEY)).toBe("spread");
    expect(readHeroLayout()).toBe("spread");
    writeHeroLayout("single");
    expect(readHeroLayout()).toBe("single");
  });

  it("reads anything it doesn't recognise as single", () => {
    localStorage.setItem(HERO_LAYOUT_KEY, "magazine");
    expect(readHeroLayout()).toBe("single");
  });

  // Safari's Lockdown mode throws on every storage access — degraded, never broken.
  it("reads single, and writes without throwing, when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(readHeroLayout()).toBe("single");
    expect(() => writeHeroLayout("spread")).not.toThrow();
  });

  it("a write re-renders a subscribed hook", () => {
    const { result } = renderHook(() => useHeroLayout());
    expect(result.current).toBe("single");
    act(() => writeHeroLayout("spread"));
    expect(result.current).toBe("spread");
  });

  it("another tab's write reaches this one through the storage event", () => {
    const { result } = renderHook(() => useHeroLayout());
    act(() => {
      localStorage.setItem(HERO_LAYOUT_KEY, "spread");
      window.dispatchEvent(
        new StorageEvent("storage", { key: HERO_LAYOUT_KEY }),
      );
    });
    expect(result.current).toBe("spread");
  });
});
