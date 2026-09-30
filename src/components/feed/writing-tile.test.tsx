// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Item } from "~/server/db/items";
import type { FeedCard } from "~/server/services/feed";
import { WritingTile } from "./writing-tile";

// The same FeedCard shape image-tile.test.tsx builds, as a Wikipedia article with a lead picture.
const card = (overrides: Partial<Item> = {}): FeedCard => ({
  item: {
    id: "w1",
    source: "wikipedia",
    sourceId: "src-w1",
    type: "article",
    title: "The Voynich manuscript",
    summary: "An illustrated codex in an unknown script.",
    body: null,
    imageUrl: "https://upload.wikimedia.org/x/Voynich.jpg",
    imageWidth: 800,
    imageHeight: 1100,
    kind: "curiosity",
    readingMinutes: 12,
    sourceUrl: "https://en.wikipedia.org/?curid=1",
    attribution: null,
    license: null,
    tags: [],
    topicId: "books",
    curationScore: 8,
    aestheticTags: [],
    fetchedAt: new Date("2026-09-30T00:00:00Z"),
    ...overrides,
  } satisfies Item,
  tier: "CORE",
  topicId: "books",
});

describe("WritingTile", () => {
  it("leads with the picture, through Ambit's image proxy", () => {
    render(
      <WritingTile
        card={card()}
        aspectClass="aspect-[100/142]"
        onTap={vi.fn()}
      />,
    );
    const img = screen.getByRole("img");
    // `imageSrc` is a CSP rule: a raw upstream URL would be blocked outright.
    expect(img.getAttribute("src")).toMatch(/^\/api\/img\/w1/);
  });

  it("wears the badge and the title over the picture", () => {
    render(
      <WritingTile card={card()} aspectClass="aspect-square" onTap={vi.fn()} />,
    );
    expect(screen.getByText("CURIOSITY · 12 MIN")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "The Voynich manuscript" }),
    ).toBeInTheDocument();
  });

  it("reads plain READ before the curator has reached it", () => {
    render(
      <WritingTile
        card={card({ kind: null, readingMinutes: null })}
        aspectClass="aspect-square"
        onTap={vi.fn()}
      />,
    );
    expect(screen.getByText("READ")).toBeInTheDocument();
  });

  it("is one button that opens the piece", () => {
    const onTap = vi.fn();
    render(
      <WritingTile card={card()} aspectClass="aspect-square" onTap={onTap} />,
    );
    const button = screen.getByRole("button", {
      name: "The Voynich manuscript",
    });
    fireEvent.keyDown(button, { key: "Enter" });
    expect(onTap).toHaveBeenCalledOnce();
  });
});
