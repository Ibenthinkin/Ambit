// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Item } from "~/server/db/items";
import type { FeedCard } from "~/server/services/feed";
import { stubMatchMedia } from "~/test/match-media";
import { ImageTile } from "./image-tile";

// A minimal FeedCard, the same shape masonry.test.ts's `card()` builds — copied rather than
// imported across test files, so neither file's fixtures constrain the other's.
const card = (id: string): FeedCard => ({
  item: {
    id,
    source: "met",
    sourceId: `src-${id}`,
    type: "image",
    title: "A title",
    summary: null,
    body: null,
    imageUrl: "https://example.test/i.jpg",
    sourceUrl: "https://example.test/o",
    attribution: null,
    license: null,
    tags: [],
    topicId: "botany",
    curationScore: 8,
    aestheticTags: [],
    fetchedAt: new Date("2026-08-17T00:00:00Z"),
  } satisfies Item,
  tier: "CORE",
  topicId: "botany",
});

const FINE = "(pointer: fine)";

afterEach(() => vi.unstubAllGlobals());

// The desktop pass (docs/DESIGN_desktop-polish.md §4): a mouse has no long-press, and a keyboard
// has no press at all.
describe("ImageTile — desktop input", () => {
  it("is a focusable button named after the item, and Enter/Space open it", () => {
    const onTap = vi.fn();
    render(
      <ImageTile card={card("a")} aspectClass="aspect-square" onTap={onTap} />,
    );
    const tile = screen.getByRole("button", { name: "A title" });
    expect(tile).toHaveAttribute("tabindex", "0");

    fireEvent.keyDown(tile, { key: "Enter" });
    fireEvent.keyDown(tile, { key: " " });
    expect(onTap).toHaveBeenCalledTimes(2);
  });

  it("right-click opens the item sheet on a fine pointer, and suppresses the native menu", () => {
    stubMatchMedia([FINE]);
    const onLongPress = vi.fn();
    render(
      <ImageTile
        card={card("a")}
        aspectClass="aspect-square"
        onTap={vi.fn()}
        onLongPress={onLongPress}
      />,
    );
    const tile = screen.getByRole("button", { name: "A title" });
    // `fireEvent` returns false when a handler called `preventDefault()`.
    const prevented = !fireEvent.contextMenu(tile);
    expect(onLongPress).toHaveBeenCalledOnce();
    expect(prevented).toBe(true);
  });

  it("ignores right-click on a coarse pointer (Android's synthesized contextmenu)", () => {
    stubMatchMedia([]);
    const onLongPress = vi.fn();
    render(
      <ImageTile
        card={card("a")}
        aspectClass="aspect-square"
        onTap={vi.fn()}
        onLongPress={onLongPress}
      />,
    );
    fireEvent.contextMenu(screen.getByRole("button", { name: "A title" }));
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("does nothing on right-click when there is no item sheet (Saved)", () => {
    stubMatchMedia([FINE]);
    render(
      <ImageTile
        card={card("a")}
        aspectClass="aspect-square"
        onTap={vi.fn()}
      />,
    );
    // Not prevented: the browser's own menu is the right answer here.
    expect(
      fireEvent.contextMenu(screen.getByRole("button", { name: "A title" })),
    ).toBe(true);
  });
});

// Decision 4 (docs/DESIGN_chrome-redesign.md §4): no hover zoom; a 3px off-white ring for keyboard
// focus (the 2px accent was invisible on a photograph — Ben's review).
it("has no hover zoom and an off-white focus ring", () => {
  render(
    <ImageTile card={card("a")} aspectClass="aspect-square" onTap={vi.fn()} />,
  );
  const tile = screen.getByRole("button", { name: "A title" });
  expect(tile.querySelector("img")?.className).not.toMatch(/scale/);
  expect(tile).toHaveClass(
    "focus-visible:outline-ink-hi",
    "focus-visible:outline-[3px]",
  );
});
