// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Item } from "~/server/db/items";
import { stubMatchMedia } from "~/test/match-media";
import { FeedGrid } from "./feed-grid";
import type { FeedTile } from "./masonry";

// FeedScreen's tests cover the grid as /feed uses it; these pin what only /explore asks of it —
// a message tile rendered through the screen's hook, and inert like a Because tile.
function image(id: string): FeedTile {
  const item = {
    id,
    source: "met",
    sourceId: id,
    type: "image",
    title: `Item ${id}`,
    summary: null,
    body: null,
    imageUrl: `https://example.test/${id}.jpg`,
    imageWidth: null,
    imageHeight: null,
    kind: null,
    readingMinutes: null,
    sourceUrl: "https://example.test/o",
    attribution: null,
    license: null,
    tags: [],
    topicId: "botany",
    curationScore: 8,
    aestheticTags: [],
    fetchedAt: new Date("2026-09-26T00:00:00Z"),
  } satisfies Item;
  return {
    kind: "image",
    card: { item, tier: "CORE", topicId: "botany" },
    aspectClass: "aspect-square",
    ratio: 1,
  };
}

const baseProps = {
  firstPageCount: 0,
  hasNextPage: false,
  isFetchingNextPage: false,
  isFetchNextPageError: false,
  fetchNextPage: () => Promise.resolve(),
  onOpen: vi.fn(),
};

describe("FeedGrid", () => {
  beforeEach(() => stubMatchMedia([]));
  afterEach(() => vi.unstubAllGlobals());

  it("renders a message tile through renderMessage, with no item id", () => {
    const { container } = render(
      <FeedGrid
        {...baseProps}
        tiles={[
          image("i1"),
          { kind: "message", key: "message-0", message: "about" },
        ]}
        renderMessage={(tile) => <p>message: {tile.message}</p>}
      />,
    );
    expect(screen.getByText("message: about")).toBeInTheDocument();
    expect(
      [...container.querySelectorAll("[data-feed-id]")].map((el) =>
        el.getAttribute("data-feed-id"),
      ),
    ).toEqual(["i1"]);
  });

  it("gives a message tile no hover extras", () => {
    const extras = vi.fn(() => <span>extra</span>);
    render(
      <FeedGrid
        {...baseProps}
        tiles={[{ kind: "message", key: "message-0", message: "about" }]}
        renderMessage={() => <p>m</p>}
        renderTileExtras={extras}
      />,
    );
    expect(extras).not.toHaveBeenCalled();
  });
});
