import { describe, expect, it } from "vitest";

import { sourceLabel } from "~/lib/source-label";
import {
  isLinkCardSource,
  isPublicationSource,
  PUBLICATIONS,
} from "./publications";
import { isSuspendedSource } from "./suspended-sources";

describe("isLinkCardSource", () => {
  it("is true for a designated blog", () => {
    expect(isLinkCardSource("doorofperception")).toBe(true);
  });

  it("is false for open sources, PDR included (PDR is its own case)", () => {
    for (const source of ["wikipedia", "met", "pdr", "loupe", "poetrydb"]) {
      expect(isLinkCardSource(source)).toBe(false);
    }
  });

  it("is true for a registered publication", () => {
    expect(isPublicationSource("themarginalian")).toBe(true);
    expect(isLinkCardSource("themarginalian")).toBe(true);
  });

  it("knows only what is registered — a probed-and-passed candidate is not one", () => {
    expect(isPublicationSource("aeon")).toBe(false);
  });

  it("ships every publication suspended until Ben's verdict", () => {
    for (const p of PUBLICATIONS)
      expect(isSuspendedSource(p.id), p.id).toBe(true);
  });

  it("gives every publication its credit-line label", () => {
    for (const p of PUBLICATIONS) expect(sourceLabel(p.id), p.id).toBe(p.label);
  });

  it("names an origin with no path and no trailing slash", () => {
    for (const p of PUBLICATIONS)
      expect(new URL(p.baseUrl).origin, p.id).toBe(p.baseUrl);
  });
});
