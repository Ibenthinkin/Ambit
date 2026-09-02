import type { FeedCard, FeedPage } from "~/server/services/feed";

// The feed's layout brain, deliberately extracted from the components that render it: this file
// is DB-free, React-free and DOM-free, which makes the two decisions that actually shape the
// screen — where the serendipity tiles go, and which column each tile lands in — unit-testable
// without mounting anything. Same seam philosophy as `server/services/feed.ts`, where everything
// below `composePage` is pure so the interesting half can be tested with fixtures.

export type FeedTile =
  | { kind: "image"; card: FeedCard; aspectClass: string; ratio: number }
  | { kind: "article"; card: FeedCard }
  | { kind: "because"; key: string; from: string; to: string };

/**
 * The eight tile heights, as literal Tailwind aspect-ratio classes.
 *
 * The DB stores no image dimensions (SPEC §5.1 has no width/height columns and the adapters don't
 * fetch them), so tile height can't come from the image — the prototype's own POOL is likewise a
 * fixed set of ratios, cycled. What's ported here is that cycle.
 *
 * **Why aspect classes rather than the prototype's computed `colW * ratio` pixel heights:** a
 * fixed px height is only correct at the prototype's 402px frame. On a wider phone the column
 * grows but a px height doesn't, so every image would letterbox or crop progressively harder the
 * larger the screen. An aspect ratio is the same visual rhythm at any width.
 *
 * **Why literal class strings and not `` `aspect-[100/${n}]` ``:** Tailwind's scanner reads source
 * text, not runtime values — a computed class name never gets a rule generated for it and the tile
 * silently collapses to zero height. `ratio` is carried alongside purely for `packColumns`'
 * arithmetic; nothing renders it.
 */
export const IMAGE_ASPECTS = [
  { className: "aspect-[100/68]", ratio: 0.68 },
  { className: "aspect-[100/78]", ratio: 0.78 },
  { className: "aspect-[100/124]", ratio: 1.24 },
  { className: "aspect-[100/130]", ratio: 1.3 },
  { className: "aspect-[100/62]", ratio: 0.62 },
  { className: "aspect-[100/142]", ratio: 1.42 },
  { className: "aspect-[100/118]", ratio: 1.18 },
  { className: "aspect-square", ratio: 1.0 },
] as const;

/**
 * A JUMP whose walk actually has a from→to pair to name. See `buildTiles`. Written as a type
 * predicate so the caller gets `driftPath` and `topicId` narrowed for free — a JUMP always has
 * both, and saying so in the type is what lets the Because branch below read them without `!`.
 */
function qualifiesForBecause(
  card: FeedCard,
): card is FeedCard & { topicId: string; driftPath: [string, ...string[]] } {
  return (
    card.tier === "JUMP" &&
    card.topicId !== null &&
    (card.driftPath?.length ?? 0) >= 2
  );
}

/**
 * Flattens the infinite query's pages into the tile list the columns are packed from, inserting
 * the occasional "Because" serendipity tile.
 *
 * **Cadence: the first qualifying JUMP per fetched page, at most one.** The feed's tier mix is
 * CORE 40 / DRIFT 35 / JUMP 25, so a 12-card page carries roughly three JUMPs and seven
 * JUMP-or-DRIFT cards; rendering a tile for each would turn an occasional moment of "oh, that's
 * why" into a running commentary. The prototype's cadence is about one per screen, and one per
 * page reproduces it. DRIFT cards deliberately get nothing — drift is meant to be felt, not
 * announced (PHASE5_PLAN_5.6.md Decision 1).
 *
 * `driftPath` is `[start, ...hops]` and `card.topicId` is where it ended up, so from→to is
 * `driftPath[0] → card.topicId` — a two-hop path collapses to that same single pair rather than
 * rendering a chain (Decision 2).
 *
 * The image aspect rotation is keyed to the **global** image ordinal across every page, never
 * reset per page. Resetting it would align the height rhythm to the 12-card fetch boundary, which
 * is exactly the seam infinite scroll is trying to hide.
 */
export function buildTiles(
  pages: FeedPage[],
  topicLabels: Record<string, string>,
): FeedTile[] {
  const tiles: FeedTile[] = [];
  let imageOrdinal = 0;

  for (const page of pages) {
    const becauseCard = page.cards.find(qualifiesForBecause);

    for (const card of page.cards) {
      if (becauseCard && card === becauseCard) {
        const from = becauseCard.driftPath[0];
        tiles.push({
          kind: "because",
          key: `because-${becauseCard.item.id}`,
          // Fall back to the raw topic id rather than dropping the tile: an id that isn't in
          // TOPICS means config and corpus have drifted apart, and showing "ancient-history" is
          // both readable and a visible signal that something needs fixing.
          from: topicLabels[from] ?? from,
          to: topicLabels[becauseCard.topicId] ?? becauseCard.topicId,
        });
      }

      if (card.item.type === "image") {
        const aspect = IMAGE_ASPECTS[imageOrdinal % IMAGE_ASPECTS.length]!;
        imageOrdinal += 1;
        tiles.push({
          kind: "image",
          card,
          aspectClass: aspect.className,
          ratio: aspect.ratio,
        });
      } else {
        tiles.push({ kind: "article", card });
      }
    }
  }

  return tiles;
}

/** The prototype's column width at its 402px frame. Only ever used as a scale factor below. */
const COL_W = 196;
/** The `gap-1` between stacked tiles, in the same arbitrary units as the estimates. */
const GAP = 4;
/** Kept in lockstep with `ArticleCard`'s `line-clamp-5`. See `estHeight`. */
const ARTICLE_LEDE_MAX_LINES = 5;

/**
 * How tall a tile will *probably* be. Only the relative ordering matters — these feed a greedy
 * "put it in the shorter column" decision, so being uniformly 15% off changes nothing, while
 * getting an article wrong relative to an image would visibly lopside the feed.
 *
 * The article numbers are the prototype's: a fixed 74px of chrome (eyebrow + margins + padding),
 * plus a line of title per ~18 characters at 24px each, plus a line of lede per ~30 characters at
 * 21px each.
 */
function estHeight(tile: FeedTile): number {
  switch (tile.kind) {
    case "image":
      return COL_W * tile.ratio;
    case "because":
      return 118;
    case "article": {
      const { title, summary } = tile.card.item;
      const ledeLines = Math.min(
        Math.ceil((summary ?? "").length / 30),
        // Matches `ArticleCard`'s `line-clamp-5`. The prototype has no cap because its fixture
        // ledes are all a sentence long; real `summary` values are source synopses and can run
        // several hundred characters, which would otherwise have this estimate reserving a whole
        // screen of column for a tile that renders five lines.
        ARTICLE_LEDE_MAX_LINES,
      );
      return 74 + Math.ceil(title.length / 18) * 24 + ledeLines * 21;
    }
  }
}

/**
 * Greedy shortest-column packing — the prototype's own algorithm, and the reason this is a
 * two-column `grid` of two `flex` stacks rather than CSS `columns`. Native CSS multi-column
 * balances by *reflowing*, which means appending a page can move a tile the user is currently
 * looking at into the other column. This can't: a tile's placement depends only on the tiles
 * before it, so growing the list is always append-only per column.
 *
 * Ties go to the left column, which keeps the output deterministic (and therefore assertable) for
 * a given input.
 */
export function packColumns(tiles: FeedTile[]): [FeedTile[], FeedTile[]] {
  const columns: [FeedTile[], FeedTile[]] = [[], []];
  const heights: [number, number] = [0, 0];

  for (const tile of tiles) {
    const target = heights[0] <= heights[1] ? 0 : 1;
    columns[target].push(tile);
    heights[target] += estHeight(tile) + GAP;
  }

  return columns;
}
