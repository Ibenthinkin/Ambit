import { describe, expect, it } from "vitest";

import type { FeedTile } from "~/components/feed/masonry";
import { capTiles } from "./explore-tiles";

// The taste's cap, as a pure function over the tile list: trim at the Nth image, close on the end
// card. ExploreScreen stops fetching when `capped` says so.
const img = (id: string): FeedTile =>
  ({
    kind: "image",
    card: { item: { id } },
    aspectClass: "aspect-square",
    ratio: 1,
  }) as unknown as FeedTile;
const art = (id: string): FeedTile =>
  ({ kind: "article", card: { item: { id } } }) as unknown as FeedTile;
const msg: FeedTile = { kind: "message", key: "message-0", message: "about" };

const kinds = (tiles: FeedTile[]) =>
  tiles.map((t) => (t.kind === "message" ? `msg:${t.message}` : t.kind));

describe("capTiles", () => {
  it("passes an uncapped, unfinished list through untouched", () => {
    const tiles = [img("a"), msg, art("b")];
    expect(capTiles(tiles, { imageCap: 5, ended: false })).toEqual({
      tiles,
      capped: false,
    });
  });

  it("trims right after the capth image and closes on the end card", () => {
    const tiles = [img("a"), art("b"), img("c"), msg, img("d"), img("e")];
    const out = capTiles(tiles, { imageCap: 2, ended: false });
    expect(out.capped).toBe(true);
    expect(kinds(out.tiles)).toEqual(["image", "article", "image", "msg:end"]);
  });

  it("caps exactly at the cap, not one past it", () => {
    const out = capTiles([img("a"), img("b")], { imageCap: 2, ended: false });
    expect(out.capped).toBe(true);
    expect(kinds(out.tiles)).toEqual(["image", "image", "msg:end"]);
  });

  it("closes a feed that ran out before the cap on the end card too", () => {
    const out = capTiles([img("a"), art("b")], { imageCap: 5, ended: true });
    expect(out.capped).toBe(false);
    expect(kinds(out.tiles)).toEqual(["image", "article", "msg:end"]);
  });

  it("adds no end card to an empty feed", () => {
    expect(capTiles([], { imageCap: 5, ended: true }).tiles).toEqual([]);
  });

  it("never leaves a rotating message dangling right before the end card", () => {
    const out = capTiles([img("a"), msg, img("b")], {
      imageCap: 1,
      ended: false,
    });
    expect(kinds(out.tiles)).toEqual(["image", "msg:end"]);
  });
});
