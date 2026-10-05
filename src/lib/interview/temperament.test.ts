import { describe, expect, it } from "vitest";

import { DIRECT_TEMPERAMENT_FACTOR } from "~/server/config/temperament";

import { temperamentFrom } from "./temperament";

const table = {
  astronomy: { cerebral: 1, thrilling: 0.5 },
  horror: { dark: 1 },
};

describe("temperamentFrom", () => {
  it("sums positive topic scores times the table's weights, then scales the largest to 1", () => {
    const t = temperamentFrom(
      new Map([
        ["astronomy", 2],
        ["horror", 1],
      ]),
      [],
      table,
    );
    // cerebral 2 · thrilling 1 · dark 1 → /2
    expect(t.cerebral).toBe(1);
    expect(t.thrilling).toBe(0.5);
    expect(t.dark).toBe(0.5);
    expect(t.communal).toBe(0);
    expect(t.aesthetic).toBe(0);
  });
  it("ignores negative scores and topics the table lacks", () => {
    const t = temperamentFrom(
      new Map([
        ["horror", -3],
        ["unknown", 5],
      ]),
      [],
      table,
    );
    expect(Object.values(t).every((v) => v === 0)).toBe(true);
  });
  it("adds direct weights at DIRECT_TEMPERAMENT_FACTOR", () => {
    const t = temperamentFrom(
      new Map([["astronomy", 1]]),
      [{ communal: 1 }],
      table,
    );
    // cerebral 1, thrilling 0.5, communal 1.5 → communal is the largest
    expect(t.communal).toBe(1);
    expect(t.cerebral).toBeCloseTo(1 / DIRECT_TEMPERAMENT_FACTOR);
  });
  it("is all zeros, not NaN, when nothing scored", () => {
    const t = temperamentFrom(new Map(), [], table);
    expect(Object.values(t)).toEqual([0, 0, 0, 0, 0]);
  });
});
