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
    expect(isPublicationSource("atlasobscura")).toBe(false);
  });

  // Kept, but held until the Claude judge exists (Ben, 10-01-26) — flip this when they leave.
  it("holds every publication suspended until the Claude judge exists", () => {
    for (const p of PUBLICATIONS)
      expect(isSuspendedSource(p.id), p.id).toBe(true);
  });

  // A walk with a quota is never `complete`, so `--prune` never acts on it. For a feed that
  // shows only its newest page (The Paris Review) that is the difference between keeping the
  // archive it has accumulated and deleting everything that scrolled out of the window.
  it("bounds every nightly walk, so no publication run can ever prune", () => {
    for (const p of PUBLICATIONS) expect(p.walkQuota, p.id).toBeGreaterThan(0);
  });

  it("backfills at least what a scheduled run walks, about a quarter of the archives in all", () => {
    for (const p of PUBLICATIONS)
      expect(p.backfillQuota, p.id).toBeGreaterThanOrEqual(p.walkQuota ?? 0);
    // Ben's cut, 10-01-26: ~45,000 pieces in the seven archives, a quarter of that kept.
    const total = PUBLICATIONS.reduce((n, p) => n + p.backfillQuota, 0);
    expect(total).toBeLessThanOrEqual(12_000);
  });

  it("gives every publication its credit-line label", () => {
    for (const p of PUBLICATIONS) expect(sourceLabel(p.id), p.id).toBe(p.label);
  });

  it("names an origin with no path and no trailing slash", () => {
    for (const p of PUBLICATIONS)
      expect(new URL(p.baseUrl).origin, p.id).toBe(p.baseUrl);
  });
});
