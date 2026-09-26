import type { FeedTile } from "~/components/feed/masonry";

// `/explore`'s cap (09-26-26, docs/PLAN_explore-route.md), as a pure function over the tile list
// `buildTiles` made — DOM-free and React-free, like masonry.ts, so the one rule that shapes where
// the taste ends is testable without mounting anything.

/** The end card's tile. One per feed, so a fixed key. */
const END: FeedTile = { kind: "message", key: "message-end", message: "end" };

/**
 * Trim the list right after its `imageCap`th image and close it on the end card (`capped: true`
 * tells the screen to stop fetching). A feed that `ended` before the cap — the server's page
 * backstop, or a corpus with nothing left to offer — closes on the end card too: either way the
 * taste is over, and the card's three actions are the way on.
 *
 * A rotating message left as the last tile before the end card is dropped: it would be the same
 * ask twice in a row.
 */
export function capTiles(
  tiles: FeedTile[],
  opts: { imageCap: number; ended: boolean },
): { tiles: FeedTile[]; capped: boolean } {
  let images = 0;
  let cut = -1;
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i]!.kind === "image" && ++images === opts.imageCap) {
      cut = i + 1;
      break;
    }
  }
  const capped = cut !== -1;
  if (!capped && !opts.ended) return { tiles, capped: false };
  if (tiles.length === 0) return { tiles, capped };

  const kept = capped ? tiles.slice(0, cut) : [...tiles];
  if (kept.at(-1)?.kind === "message") kept.pop();
  return { tiles: [...kept, END], capped };
}
