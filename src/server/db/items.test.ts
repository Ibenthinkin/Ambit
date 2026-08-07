// Pure-function tests for the feed's item-pick weighting (SPEC §9.2). drawWeight has no I/O, so
// it's covered here on literals; drawFromTopic itself (the DB-backed weighted draw) is covered
// separately in items.integration.test.ts, which needs a real Postgres connection.
import { describe, expect, it } from "vitest";

import { drawWeight } from "./items";

describe("drawWeight", () => {
  it("computes (score - floor + 1)^power with no tag boost", () => {
    // 8 - 4 + 1 = 5; 5^1.5 ≈ 11.180
    expect(drawWeight(8, 4, 1.5, 0, 0.5)).toBeCloseTo(11.18, 2);
  });

  it("multiplies by (1 + boostPerTag * sharedTags) when aesthetic tags overlap", () => {
    const noBoost = drawWeight(8, 4, 1.5, 0, 0.5);
    const twoShared = drawWeight(8, 4, 1.5, 2, 0.5);
    // 2 shared tags at boost 0.5 → factor (1 + 0.5*2) = 2
    expect(twoShared).toBeCloseTo(noBoost * 2, 5);
  });

  it("gives an item exactly at the score floor weight 1 (before any tag boost)", () => {
    // score - floor + 1 = 1; 1^power = 1 for any power
    expect(drawWeight(4, 4, 1.5, 0, 0.5)).toBe(1);
    expect(drawWeight(4, 4, 3, 0, 0.5)).toBe(1);
  });

  it("power 0 with no shared tags collapses every score to weight 1 — pure random draw", () => {
    expect(drawWeight(2, 1, 0, 0, 0.5)).toBe(1);
    expect(drawWeight(6, 1, 0, 0, 0.5)).toBe(1);
    expect(drawWeight(10, 1, 0, 0, 0.5)).toBe(1);
  });
});
