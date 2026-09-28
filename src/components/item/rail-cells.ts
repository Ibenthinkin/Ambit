import type { RailItem } from "~/server/services/gallery-rail";

// The three cells of the item screen's hero track — before, under the reader, after — built from
// the rail and where the reader stands. Pure, so every edge case is a unit test rather than a
// click-through (docs/DESIGN_spread-mode.md D1, D5).
//
// A cell holds **pages**. In single mode every cell has one page, which is exactly the track the
// screen had before spreads. In spread mode (desktop only) each cell holds up to two consecutive
// pictures, like the two pages of an open magazine, and the track still slides one *cell* per
// turn — which is how a turn moves the rail by two.
//
// **Pairs are relative to the current index**, never a global odd/even rule. The picture the
// reader opened is always the left page of the first spread, and the screen prepending an odd
// batch of rail at the head (it fetches backwards as you page back) cannot re-pair everything.

/** One page of a cell: a picture, or `"end"` — `/explore`'s end card. */
export type HeroPage = RailItem | "end";

/** One or two pages, left to right. */
export type HeroCell = readonly HeroPage[];

/** Before, current, after. An absent neighbour is `undefined` and renders as an empty cell. */
export type HeroCells = readonly [
  HeroCell | undefined,
  HeroCell,
  HeroCell | undefined,
];

export interface BuildCellsArgs {
  /** The loaded rail. The caller guarantees `items[index]` exists. */
  items: readonly RailItem[];
  index: number;
  /** 1 for single, 2 for a spread. */
  pages: 1 | 2;
  /** `/explore`'s cap is reached: the end card is where the next cell would be. */
  capped: boolean;
  /** The reader is standing on the end card. */
  atEnd: boolean;
}

/** An empty slice is an absent cell, never a cell with no pages. */
const cellOf = (pages: readonly HeroPage[]): HeroCell | undefined =>
  pages.length > 0 ? pages : undefined;

export function buildCells({
  items,
  index,
  pages,
  capped,
  atEnd,
}: BuildCellsArgs): HeroCells {
  const current = items.slice(index, index + pages);

  // On the end card the three cells shift one along: what was current slides left, the card is
  // under the reader, and there is nothing beyond it.
  if (atEnd) return [current, ["end"], undefined];

  const before = items.slice(Math.max(0, index - pages), index);
  const after: readonly HeroPage[] = capped
    ? ["end"]
    : items.slice(index + pages, index + pages * 2);

  return [cellOf(before), current, cellOf(after)];
}
