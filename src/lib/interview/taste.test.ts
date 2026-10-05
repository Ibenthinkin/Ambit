import { describe, expect, it } from "vitest";

import { buildTaste, chosenDestinations, tasteSchema } from "./taste";

const listed = new Set(["astronomy", "moon", "botany", "eerie", "photography"]);

describe("buildTaste", () => {
  it("assembles the stored shape from the scores, destinations and opened cards", () => {
    const taste = buildTaste({
      scores: new Map([
        ["astronomy", 2],
        ["eerie", 1],
        ["photography", 0.5],
      ]),
      listed,
      destinations: chosenDestinations([
        { questionId: "destinations", keys: ["kyoto", "iceland"] },
      ]),
      opened: [
        { itemId: "i1", title: "On rain", kind: "essay", minutes: 14 },
        { itemId: "i2", title: "A tide table", kind: "archive", minutes: 4 },
      ],
    });
    expect(taste.v).toBe(1);
    expect(taste.title).toEqual({ adjective: "Nocturnal", noun: "Orbits" });
    expect(taste.wings[0]).toBe("space");
    expect(taste.mediums).toEqual(["photography"]);
    expect(taste.compass).not.toBeNull();
    expect(taste.compass!.old).toBeCloseTo((0.8 + 0.1) / 2);
    // Kyoto's and Iceland's direct aesthetic weights (×1.5) outweigh astronomy's topic weights:
    // aesthetic 0.25 + 1.5 × (1 + 0.6) = 2.65 against thrilling 1.6 and dark 1.45.
    expect(taste.temperament.aesthetic).toBe(1);
    expect(taste.temperament.thrilling).toBeCloseTo(1.6 / 2.65);
    expect(taste.opened).toHaveLength(2);
    expect(taste.readingMinutes).toBe(9);
    expect(tasteSchema.safeParse(taste).success).toBe(true);
  });
  it("has a null compass and null reading minutes when nothing was chosen or opened", () => {
    const taste = buildTaste({
      scores: new Map(),
      listed,
      destinations: [],
      opened: [],
    });
    expect(taste.compass).toBeNull();
    expect(taste.readingMinutes).toBeNull();
    expect(taste.opened).toEqual([]);
    expect(tasteSchema.safeParse(taste).success).toBe(true);
  });
});

describe("chosenDestinations", () => {
  it("reads the destinations answer's keys, ignoring unknown keys and a skip", () => {
    expect(
      chosenDestinations([
        { questionId: "destinations", keys: ["kyoto", "nowhere"] },
      ]).map((d) => d.id),
    ).toEqual(["kyoto"]);
    expect(
      chosenDestinations([{ questionId: "destinations", keys: ["skip"] }]),
    ).toEqual([]);
    expect(chosenDestinations([])).toEqual([]);
  });
});

describe("tasteSchema", () => {
  it("rejects an unknown wing, a temperament value over 1 and more than two opened cards", () => {
    const ok = buildTaste({
      scores: new Map(),
      listed,
      destinations: [],
      opened: [],
    });
    expect(
      tasteSchema.safeParse({ ...ok, wings: ["not-a-wing"] }).success,
    ).toBe(false);
    expect(
      tasteSchema.safeParse({
        ...ok,
        temperament: { ...ok.temperament, dark: 1.5 },
      }).success,
    ).toBe(false);
    const card = { itemId: "x", title: "t", kind: "essay", minutes: 3 };
    expect(
      tasteSchema.safeParse({ ...ok, opened: [card, card, card] }).success,
    ).toBe(false);
  });
});
