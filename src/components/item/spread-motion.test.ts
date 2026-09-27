import { describe, expect, it } from "vitest";

import type { RailItem } from "~/server/services/gallery-rail";
import {
  bookLayers,
  folioNumber,
  lightAt,
  motionMs,
  MIN_TURN_MS,
  swingFrames,
  TURN_MS,
  turnLayers,
  type LeafLayers,
} from "./spread-motion";

const item = (id: string): RailItem => ({
  id,
  title: `Plate ${id}`,
  attribution: null,
  imageUrl: null,
  summary: null,
  body: null,
  source: "met",
  sourceUrl: `https://example.test/o/${id}`,
  license: null,
  topicId: null,
  topicLabel: null,
});
const [A, B, C, D] = ["a", "b", "c", "d"].map(item) as [
  RailItem,
  RailItem,
  RailItem,
  RailItem,
];

/** The layers as ids, `null` for a blank page. */
const ids = (l: LeafLayers | null) =>
  l && {
    half: l.half,
    front: l.front?.id ?? null,
    back: l.back?.id ?? null,
    under: l.under.map((p) => p?.id ?? null),
  };

describe("turnLayers", () => {
  it("forward: the right page swings left, B on its front and C on its back, over A, revealing D", () => {
    expect(ids(turnLayers(1, [A, B], [C, D]))).toEqual({
      half: "right",
      front: "b",
      back: "c",
      under: ["a", "d"],
    });
  });

  it("backward: the left page swings right, C on its front and B on its back, over D, revealing A", () => {
    expect(ids(turnLayers(-1, [C, D], [A, B]))).toEqual({
      half: "left",
      front: "c",
      back: "b",
      under: ["a", "d"],
    });
  });

  it("forward onto a lone last page reveals a blank right half", () => {
    expect(ids(turnLayers(1, [A, B], [C]))).toEqual({
      half: "right",
      front: "b",
      back: "c",
      under: ["a", null],
    });
  });

  it("backward from a lone last page has a blank page underneath on the right", () => {
    expect(ids(turnLayers(-1, [C], [A, B]))).toEqual({
      half: "left",
      front: "c",
      back: "b",
      under: ["a", null],
    });
  });

  it("does not turn when there is nothing to turn to, or onto the end card", () => {
    expect(turnLayers(1, [A, B], undefined)).toBeNull();
    expect(turnLayers(1, [A, B], ["end"])).toBeNull();
    expect(turnLayers(-1, ["end"], [A, B])).toBeNull();
  });

  it("does not turn when the two spreads share a picture (back from index 1)", () => {
    expect(turnLayers(-1, [B, C], [A, B])).toBeNull();
  });
});

describe("bookLayers", () => {
  it("opening swings the right page out from over the left, onto a blank right half", () => {
    expect(ids(bookLayers("open", [A, B], 0))).toEqual({
      half: "right",
      front: "b",
      back: "a",
      under: ["a", null],
    });
  });

  it("closing folds towards the focused page, so single view lands on it", () => {
    expect(ids(bookLayers("close", [A, B], 0))).toEqual({
      half: "right",
      front: "b",
      back: "a",
      under: ["a", null],
    });
    expect(ids(bookLayers("close", [A, B], 1))).toEqual({
      half: "left",
      front: "a",
      back: "b",
      under: [null, "b"],
    });
  });

  it("a lone page has nothing to fold", () => {
    expect(bookLayers("open", [A], 0)).toBeNull();
    expect(bookLayers("close", undefined, 0)).toBeNull();
  });
});

describe("motion timing and light", () => {
  it("a full swing takes the tokens' 800ms, a partial one pro rata, never under the floor", () => {
    expect(motionMs(0, 1)).toBe(TURN_MS);
    expect(motionMs(0.5, 1)).toBe(TURN_MS / 2);
    expect(motionMs(0.95, 1)).toBe(MIN_TURN_MS);
  });

  it("the light is nothing flat and darkest upright", () => {
    expect(lightAt(0)).toEqual({ leaf: 0, cast: 0 });
    expect(lightAt(1).leaf).toBeCloseTo(0, 3);
    expect(lightAt(0.5).leaf).toBeGreaterThan(lightAt(0.25).leaf);
  });

  it("samples a swing into keyframes that rotate the right way", () => {
    const right = swingFrames("right", 0, 1);
    expect(right.leaf[0]).toEqual({ transform: "rotateY(0deg)" });
    expect(right.leaf.at(-1)).toEqual({ transform: "rotateY(-180deg)" });
    expect(swingFrames("left", 0, 1).leaf.at(-1)).toEqual({
      transform: "rotateY(180deg)",
    });
    expect(right.shade).toHaveLength(right.leaf.length);
    expect(right.cast).toHaveLength(right.leaf.length);
  });
});

describe("folioNumber", () => {
  it("counts from 01 at the entry picture, down through 00 into negatives", () => {
    expect(folioNumber(1)).toBe("01");
    expect(folioNumber(12)).toBe("12");
    expect(folioNumber(0)).toBe("00");
    expect(folioNumber(-3)).toBe("−03");
  });
});
