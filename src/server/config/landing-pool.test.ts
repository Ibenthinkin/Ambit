import { describe, expect, it } from "vitest";

import {
  isLandingLicense,
  LANDING_MIN_LONG_EDGE,
  landingShape,
  guessShape,
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

// 09-25-26 amendment: a phone gets tall pictures, a computer wide ones, each big enough to fill it.
describe("landingShape", () => {
  it("tall at w/h ≤ 0.8, wide at w/h ≥ 1.25, and nothing in between", () => {
    expect(landingShape(800, 1000)).toBe("portrait");
    expect(landingShape(1250, 1000)).toBe("landscape");
    expect(landingShape(1000, 1000)).toBeNull();
    expect(landingShape(1200, 1000)).toBeNull();
  });

  it("refuses extremes that cover a screen only by being blown up — a panorama, a needle", () => {
    expect(landingShape(1263, 205)).toBeNull(); // 6.2 : 1
    expect(landingShape(2000, 1000)).toBe("landscape"); // 2 : 1, the widest kept
    expect(landingShape(2100, 1000)).toBeNull();
    expect(landingShape(259, 900)).toBeNull(); // 0.29 : 1
    expect(landingShape(400, 1000)).toBe("portrait"); // 0.4 : 1, the tallest kept
    expect(landingShape(390, 1000)).toBeNull();
  });

  it("refuses a picture whose long edge is under the floor", () => {
    expect(LANDING_MIN_LONG_EDGE).toBe(800);
    expect(landingShape(500, 799)).toBeNull();
    expect(landingShape(500, 800)).toBe("portrait");
    expect(landingShape(799, 400)).toBeNull();
  });

  it("refuses unknown dimensions", () => {
    expect(landingShape(null, 900)).toBeNull();
    expect(landingShape(900, null)).toBeNull();
    expect(landingShape(0, 900)).toBeNull();
  });
});

describe("guessShape", () => {
  it("a phone is upright; everything else, including an iPad (which says Macintosh), is wide", () => {
    expect(
      guessShape(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("portrait");
    expect(
      guessShape(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36",
      ),
    ).toBe("portrait");
    expect(
      guessShape(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15",
      ),
    ).toBe("landscape");
    expect(guessShape(null)).toBe("landscape");
  });
});
