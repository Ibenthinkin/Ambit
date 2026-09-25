import { describe, expect, it } from "vitest";

import {
  isLandingLicense,
  LANDING_LICENSE_PREFIXES,
  LANDING_LICENSES,
  LANDING_SCORE_FLOOR,
} from "./landing-pool";

// D1: the rule is a list of exact strings plus PDR's prefix — never a regex over "public domain".
describe("isLandingLicense", () => {
  it("accepts each exact string the design names", () => {
    for (const s of [
      "CC0 1.0 (public domain)",
      "CC0",
      "Public Domain Mark",
      "Public domain (NASA)",
      "No known restrictions on publication",
    ]) {
      expect(isLandingLicense(s), s).toBe(true);
    }
  });

  it("accepts PDR's per-collection variants by prefix", () => {
    expect(
      isLandingLicense(
        "Public domain — PD Worldwide · text CC BY-SA 4.0 (The Public Domain Review)",
      ),
    ).toBe(true);
    expect(
      isLandingLicense(
        "Public domain — Effectively PD · text CC BY-SA 4.0 (The Public Domain Review)",
      ),
    ).toBe(true);
  });

  it("refuses everything the design excludes", () => {
    for (const s of [
      null,
      "",
      "CC BY 4.0",
      "unknown",
      "Rights retained by the author — displayed with credit and link",
      "Rights retained by original authors — displayed with credit and link",
      "No open license — rights retained by original authors; personal use only.",
      "public domain", // case matters: the rule is exact, not a heuristic
      "Public domain", // PDR's prefix includes the dash
    ]) {
      expect(isLandingLicense(s), String(s)).toBe(false);
    }
  });

  it("pins the data the rule is made of", () => {
    expect(LANDING_SCORE_FLOOR).toBe(9);
    expect(LANDING_LICENSES).toHaveLength(5);
    expect(LANDING_LICENSE_PREFIXES).toEqual(["Public domain —"]);
  });
});
