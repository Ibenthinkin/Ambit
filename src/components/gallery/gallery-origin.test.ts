// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { cameFromApp, markGalleryOrigin } from "./gallery-origin";

describe("gallery origin marker", () => {
  beforeEach(() => sessionStorage.clear());

  it("round-trips the entry item id", () => {
    markGalleryOrigin("item-1");
    expect(cameFromApp("item-1")).toBe(true);
  });

  it("is specific to one item — a different gallery is a different arrival", () => {
    markGalleryOrigin("item-1");
    expect(cameFromApp("item-2")).toBe(false);
  });

  it("reads false when nothing was ever written", () => {
    expect(cameFromApp("item-1")).toBe(false);
  });

  it("marks the newest departure, not every one", () => {
    markGalleryOrigin("item-1");
    markGalleryOrigin("item-2");

    expect(cameFromApp("item-1")).toBe(false);
    expect(cameFromApp("item-2")).toBe(true);
  });

  // Safari in Lockdown/private mode throws on *any* storage access. Losing the marker costs one
  // pushed navigation instead of a pop; an exit gesture that throws costs the reader the screen.
  it("survives a storage layer that throws on both halves", () => {
    const boom = () => {
      throw new Error("SecurityError");
    };
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(boom);
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(boom);

    expect(() => markGalleryOrigin("item-1")).not.toThrow();
    expect(cameFromApp("item-1")).toBe(false);

    setItem.mockRestore();
    getItem.mockRestore();
  });
});
