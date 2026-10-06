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

  // The design's tag (docs/tile-hover/ README "Behaviour" row "Tag"): it fills on the wrapper's
  // hover or keyboard focus, over 200 ms (docs/PLAN_tile-hover.md Decision 1). Since the 1b sweep
  // (Task 2.9) the fill is ink with dark text, in mono — never green (DESIGN §3.2).
  it("wears the design's tag look and fills with ink on the wrapper's hover/focus", () => {
    render(<DebugBadge card={card(true)} />);
    const tag = screen.getByText("DRIFT");
    expect(tag).toHaveAttribute("title", "drift from botany");
    expect(tag).toHaveClass(
      "bg-bg/72",
      "text-ink",
      "text-[10px]",
      "font-mono",
      "tracking-[0.4px]",
      "transition-colors",
      "duration-200",
      "group-hover/tile:bg-ink",
      "group-hover/tile:text-on-accent",
      "group-has-[:focus-visible]/tile:bg-ink",
      "group-has-[:focus-visible]/tile:text-on-accent",
    );
    expect(tag.className).not.toContain("bg-accent");
  });
});
