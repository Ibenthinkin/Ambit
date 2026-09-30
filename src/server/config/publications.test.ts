import { describe, expect, it } from "vitest";

import { isLinkCardSource, isPublicationSource } from "./publications";

describe("isLinkCardSource", () => {
  it("is true for a designated blog", () => {
    expect(isLinkCardSource("doorofperception")).toBe(true);
  });

  it("is false for open sources, PDR included (PDR is its own case)", () => {
    for (const source of ["wikipedia", "met", "pdr", "loupe", "poetrydb"]) {
      expect(isLinkCardSource(source)).toBe(false);
    }
  });

  it("knows no publication until Phase 5 registers one", () => {
    expect(isPublicationSource("aeon")).toBe(false);
  });
});
