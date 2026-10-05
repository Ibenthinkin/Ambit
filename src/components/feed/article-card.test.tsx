// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Item } from "~/server/db/items";
import type { FeedCard } from "~/server/services/feed";
import { stubMatchMedia } from "~/test/match-media";
import { ArticleCard } from "./article-card";

// A minimal FeedCard, the same shape masonry.test.ts's `card()` builds — copied rather than
// imported across test files, so neither file's fixtures constrain the other's.
const card = (id: string): FeedCard => ({
  item: {
    id,
    source: "met",
    sourceId: `src-${id}`,
    type: "article",
    title: "A title",
    summary: "A lede.",
    body: null,
    imageUrl: "https://example.test/i.jpg",
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
    fetchedAt: new Date("2026-08-17T00:00:00Z"),
  } satisfies Item,
  tier: "CORE",
  topicId: "botany",
});

const FINE = "(pointer: fine)";

afterEach(() => vi.unstubAllGlobals());

// The desktop pass (docs/DESIGN_desktop-polish.md §4): a mouse has no long-press, and a keyboard
// has no press at all.
describe("ArticleCard — desktop input", () => {
  it("is a focusable button named after the item, and Enter/Space open it", () => {
    const onTap = vi.fn();
    render(<ArticleCard card={card("a")} onTap={onTap} />);
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
      <ArticleCard
        card={card("a")}

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
      <ArticleCard
        card={card("a")}

        onTap={vi.fn()}
        onLongPress={onLongPress}
      />,
    );
    fireEvent.contextMenu(screen.getByRole("button", { name: "A title" }));
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("does nothing on right-click when there is no item sheet (Saved)", () => {
    stubMatchMedia([FINE]);
    render(<ArticleCard card={card("a")} onTap={vi.fn()} />);
    // Not prevented: the browser's own menu is the right answer here.
    expect(
      fireEvent.contextMenu(screen.getByRole("button", { name: "A title" })),
    ).toBe(true);
  });

  // The same ring as the picture tile (docs/PLAN_tile-hover.md Decision 3).
  it("wears the 2px inset focus ring", () => {
    render(<ArticleCard card={card("a")} onTap={vi.fn()} />);
    const tile = screen.getByRole("button", { name: "A title" });
    expect(tile).toHaveClass(
      "focus-visible:outline-focus-ring",
      "focus-visible:outline-2",
      "focus-visible:-outline-offset-2",
    );
  });
});

// Writing Phase 4 (docs/DESIGN_writing.md D5): the text card's eyebrow is the writing label, the
// same words a picture-led writing tile wears as its badge.
describe("ArticleCard — eyebrow", () => {
  it("names the kind and the reading time", () => {
    const c = card("a");
    c.item.kind = "essay";
    c.item.readingMinutes = 9;
    render(<ArticleCard card={c} onTap={vi.fn()} />);
    expect(screen.getByText("ESSAY · 9 MIN")).toBeInTheDocument();
  });

  it("reads plain READ before the curator has reached it", () => {
    render(<ArticleCard card={card("a")} onTap={vi.fn()} />);
    expect(screen.getByText("READ")).toBeInTheDocument();
  });
});
