// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { FeedCard } from "~/server/services/feed";
import { DebugBadge } from "./debug-badge";

// Dev-only by construction: `card.debug` exists only when the server composed with FEED_DEBUG.
function card(debug: boolean): FeedCard {
  return {
    item: {
      id: "a",
      source: "met",
      sourceId: "a",
      type: "image",
      title: "A title",
      summary: null,
      body: null,
      imageUrl: "https://example.test/a.jpg",
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
      fetchedAt: new Date("2026-10-04T00:00:00Z"),
    },
    tier: "DRIFT",
    topicId: "botany",
    ...(debug ? { debug: { why: "drift from botany", curationScore: 8 } } : {}),
  };
}

describe("DebugBadge", () => {
  it("renders nothing without card.debug — production never shows a tier", () => {
    const { container } = render(<DebugBadge card={card(false)} />);
    expect(container).toBeEmptyDOMElement();
  });

  // DESIGN §6.1: mono 9.5 px on rgba(14,14,14,.78), and it hides while the tile is lifted
  // (hover, keyboard focus, open picker) rather than filling with accent.
  it("wears the design's tag look and hides while the tile is lifted", () => {
    render(<DebugBadge card={card(true)} />);
    const tag = screen.getByText("DRIFT");
    expect(tag).toHaveAttribute("title", "drift from botany");
    expect(tag).toHaveClass(
      "bg-[rgba(14,14,14,0.78)]",
      "text-ink",
      "text-[9.5px]",
      "font-mono",
      "tracking-[0.4px]",
      "transition-opacity",
      "group-hover/tile:opacity-0",
      "group-has-[:focus-visible]/tile:opacity-0",
      "group-has-[[data-picker-open]]/tile:opacity-0",
    );
    expect(tag.className).not.toContain("bg-accent");
  });
});
