// Pure checks on the write-side constants in topics.ts — no database needed. These numbers are
// the arithmetic the "More of this / Less of this" pair leans on (docs/DESIGN_more-or-less.md D1),
// so the relationships between them are pinned here rather than trusted to a comment.
import { describe, expect, it } from "vitest";

import {
  COOL_FLOOR,
  COOL_STEP,
  LESS_STEP,
  MORE_STEP,
  WEIGHT_CAP,
  WEIGHT_FLOOR,
} from "./topics";

describe("more/less constants", () => {
  it("keeps a pick a pick: 0 < WEIGHT_FLOOR < 1 < WEIGHT_CAP", () => {
    expect(WEIGHT_FLOOR).toBeGreaterThan(0);
    expect(WEIGHT_FLOOR).toBeLessThan(1);
    expect(WEIGHT_CAP).toBeGreaterThan(1);
  });

  it("keeps a cool a damping factor: 0 < COOL_FLOOR < COOL_STEP < 1", () => {
    expect(COOL_FLOOR).toBeGreaterThan(0);
    expect(COOL_FLOOR).toBeLessThan(COOL_STEP);
    expect(COOL_STEP).toBeLessThan(1);
  });

  it("has the design's values", () => {
    expect([MORE_STEP, LESS_STEP, WEIGHT_FLOOR, COOL_STEP, COOL_FLOOR]).toEqual(
      [0.25, 0.25, 0.25, 0.6, 0.15],
    );
  });
});
