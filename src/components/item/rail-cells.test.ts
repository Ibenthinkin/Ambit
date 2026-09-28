import { describe, expect, it } from "vitest";

import type { RailItem } from "~/server/services/gallery-rail";
import { buildCells } from "./rail-cells";

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

const RAIL = ["a", "b", "c", "d", "e", "f", "g"].map(item);
const ids = (cells: ReturnType<typeof buildCells>) =>
  cells.map((c) =>
    c === undefined ? null : c.map((p) => (p === "end" ? "end" : p.id)),
  );

const base = { items: RAIL, capped: false, atEnd: false } as const;

// Single mode must be exactly the three cells `item-screen.tsx` built before spreads existed,
// each wrapped in a one-page array.
describe("buildCells, single", () => {
  it("at the start of the rail, the cell before is empty", () => {
    expect(ids(buildCells({ ...base, index: 0, pages: 1 }))).toEqual([
      null,
      ["a"],
      ["b"],
    ]);
  });

  it("in the middle, one picture either side", () => {
    expect(ids(buildCells({ ...base, index: 3, pages: 1 }))).toEqual([
      ["c"],
      ["d"],
      ["e"],
    ]);
  });

  it("at the end of the loaded rail, the cell after is empty", () => {
    expect(ids(buildCells({ ...base, index: 6, pages: 1 }))).toEqual([
      ["f"],
      ["g"],
      null,
    ]);
  });

  it("capped: the end card is the cell after", () => {
    expect(
      ids(buildCells({ ...base, index: 3, pages: 1, capped: true })),
    ).toEqual([["c"], ["d"], ["end"]]);
  });

  it("standing on the end card: the picture before it, the card, nothing", () => {
    expect(
      ids(
        buildCells({ ...base, index: 3, pages: 1, capped: true, atEnd: true }),
      ),
    ).toEqual([["d"], ["end"], null]);
  });
});

// D1: pairs are relative to the current index, never a global odd/even rule.
describe("buildCells, spread", () => {
  it("at index 0: the entry item is the left page of the first spread", () => {
    expect(ids(buildCells({ ...base, index: 0, pages: 2 }))).toEqual([
      null,
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("in the middle: the pair before, the pair, the pair after", () => {
    expect(ids(buildCells({ ...base, index: 2, pages: 2 }))).toEqual([
      ["a", "b"],
      ["c", "d"],
      ["e", "f"],
    ]);
  });

  // An odd head extension (or turning spread on mid-rail) leaves one picture before.
  it("at index 1: the cell before holds the one picture there is", () => {
    expect(ids(buildCells({ ...base, index: 1, pages: 2 }))).toEqual([
      ["a"],
      ["b", "c"],
      ["d", "e"],
    ]);
  });

  it("an odd tail: the last spread has one page, and nothing after", () => {
    expect(ids(buildCells({ ...base, index: 6, pages: 2 }))).toEqual([
      ["e", "f"],
      ["g"],
      null,
    ]);
  });

  it("a one-page cell after, when one picture is left beyond the pair", () => {
    expect(ids(buildCells({ ...base, index: 4, pages: 2 }))).toEqual([
      ["c", "d"],
      ["e", "f"],
      ["g"],
    ]);
  });

  it("capped: the end card takes the cell after the pair", () => {
    expect(
      ids(buildCells({ ...base, index: 2, pages: 2, capped: true })),
    ).toEqual([["a", "b"], ["c", "d"], ["end"]]);
  });

  it("standing on the end card: the pair before it, the card, nothing", () => {
    expect(
      ids(
        buildCells({ ...base, index: 2, pages: 2, capped: true, atEnd: true }),
      ),
    ).toEqual([["c", "d"], ["end"], null]);
  });
});
