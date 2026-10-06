import { describe, expect, it } from "vitest";

import { DEFAULT_KNOBS } from "~/server/services/feed-knobs";

import { exploreOneIn, exploreShare } from "./explore-share";

const tiers = (core: number, drift: number, jump: number, wild: number) => ({
  tierCore: core,
  tierDrift: drift,
  tierJump: jump,
  tierWild: wild,
});

describe("exploreShare", () => {
  it("is JUMP plus WILD over every tier's weight", () => {
    expect(exploreShare(tiers(40, 35, 25, 10))).toBeCloseTo(35 / 110);
    expect(exploreShare(tiers(50, 30, 20, 0))).toBeCloseTo(0.2);
  });

  it("reads the feed's own defaults, so retuning the tiers moves the sentence", () => {
    const { tierCore, tierDrift, tierJump, tierWild } = DEFAULT_KNOBS;
    expect(exploreShare(DEFAULT_KNOBS)).toBeCloseTo(
      (tierJump + tierWild) / (tierCore + tierDrift + tierJump + tierWild),
    );
  });

  it("is 0 when every weight is 0", () => {
    expect(exploreShare(tiers(0, 0, 0, 0))).toBe(0);
  });
});

describe("exploreOneIn", () => {
  it("rounds the share to 'one in n'", () => {
    expect(exploreOneIn(tiers(40, 35, 25, 10))).toBe(3);
    expect(exploreOneIn(tiers(70, 20, 10, 0))).toBe(10);
    expect(exploreOneIn(tiers(50, 30, 20, 0))).toBe(5);
  });

  it("says nothing when nothing — or everything — comes from outside", () => {
    expect(exploreOneIn(tiers(40, 35, 0, 0))).toBeNull();
    expect(exploreOneIn(tiers(0, 0, 25, 10))).toBeNull();
    expect(exploreOneIn(tiers(0, 0, 0, 0))).toBeNull();
  });

  it("never prints 'one in one'", () => {
    expect(exploreOneIn(tiers(10, 10, 60, 20))).toBe(2);
  });
});
