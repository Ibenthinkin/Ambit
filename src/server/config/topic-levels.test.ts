// The three reader-facing levels over the real weight (docs/DESIGN_onboarding-interview.md §2).
// These tests pin the bands' edges — 0.75 and 1.5 are deliberately half-open upward, so a
// hand-set 0.75 reads as "some" not "little" — and the round trip that makes `levelOf(weightOf(l))`
// safe to use as a snap.
import { describe, expect, it } from "vitest";

import {
  LEVELS,
  LEVEL_LABELS,
  levelOf,
  pickWeight,
  weightOf,
} from "./topic-levels";

describe("weightOf", () => {
  it("returns the three numbers", () => {
    expect(weightOf("little")).toBe(0.5);
    expect(weightOf("some")).toBe(1.0);
    expect(weightOf("lot")).toBe(2.0);
  });
});

describe("levelOf", () => {
  it("bands little below 0.75", () => {
    expect(levelOf(0.5)).toBe("little");
    expect(levelOf(0.74)).toBe("little");
  });

  it("bands 0.75 up to some — the edge belongs to the higher band", () => {
    expect(levelOf(0.75)).toBe("some");
    expect(levelOf(1.0)).toBe("some");
    expect(levelOf(1.49)).toBe("some");
  });

  it("bands 1.5 and up as a lot", () => {
    expect(levelOf(1.5)).toBe("lot");
    expect(levelOf(2.0)).toBe("lot");
    expect(levelOf(3.0)).toBe("lot");
    expect(levelOf(7)).toBe("lot"); // a fixture super-cap value (topics.ts's bumpTopicWeight note)
  });

  it("never throws on 0 (never written, but not fatal)", () => {
    expect(levelOf(0)).toBe("little");
  });
});

describe("round trip", () => {
  it("levelOf(weightOf(level)) === level for every level", () => {
    for (const level of LEVELS) {
      expect(levelOf(weightOf(level))).toBe(level);
    }
  });
});

describe("pickWeight", () => {
  it("names a singleton at lot — naming one thing is a stronger signal than a bundle", () => {
    expect(pickWeight(1)).toBe(weightOf("lot"));
  });

  it("writes some for a bundle of any other size, including zero", () => {
    expect(pickWeight(2)).toBe(weightOf("some"));
    expect(pickWeight(12)).toBe(weightOf("some"));
    expect(pickWeight(0)).toBe(weightOf("some"));
  });
});

describe("LEVEL_LABELS", () => {
  it("has exactly the four reader-facing words", () => {
    expect(LEVEL_LABELS).toEqual({
      little: "a little",
      some: "some",
      lot: "a lot",
      off: "off",
    });
  });
});
