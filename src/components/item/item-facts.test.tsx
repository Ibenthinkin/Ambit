// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { sourceLabel } from "~/lib/source-label";
import type { RailItem } from "~/server/services/gallery-rail";
import { ItemFacts } from "./item-facts";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: React.ComponentProps<"a">) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// The text half of what was `ImageItemBody`, plus the gallery details sheet's facts table, in one
// block that renders for whichever rail cell is current. Pure: no queries, no router.
const cell = (over: Partial<RailItem> = {}): RailItem => ({
  id: "item-1",
  title: "A plate",
  attribution: "An engraver",
  imageUrl: "https://example.test/plate.jpg",
  summary: "A caption.",
  body: null,
  source: "met",
  sourceUrl: "https://example.test/o/1",
  license: "CC0",
  topicId: "botany",
  topicLabel: "Botany",
  ...over,
});

describe("ItemFacts", () => {
  it("titles the block, names the maker, credits the source, and prints the summary", () => {
    render(<ItemFacts item={cell()} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "A plate",
    );
    expect(screen.getAllByText("An engraver").length).toBeGreaterThan(0);
    expect(screen.getByText("A caption.")).toBeInTheDocument();
    // `from: The Met` under the title, and the From row in the table — both link to the original.
    const links = screen.getAllByRole("link", { name: "The Met" });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "https://example.test/o/1");
    }
  });

  it("drops the maker when attribution merely repeats the source label", () => {
    // A blog's attribution IS the blog (Phase 6.3); saying it as a maker too reads as a bug.
    const label = sourceLabel("doorofperception");
    render(
      <ItemFacts
        item={cell({ source: "doorofperception", attribution: label })}
      />,
    );
    expect(screen.queryByText("Maker")).toBeNull();
    // Every remaining mention is a credit link (the line under the title, the From row) — none of
    // them is the plain maker paragraph.
    for (const el of screen.getAllByText(label)) expect(el.tagName).toBe("A");
  });

  it("lists the facts the corpus actually knows", () => {
    render(<ItemFacts item={cell()} />);
    const dl = screen.getByRole("list", { name: "About this work" });
    expect(dl).toHaveTextContent("Maker");
    expect(dl).toHaveTextContent("License");
    expect(dl).toHaveTextContent("CC0");
    expect(dl).toHaveTextContent("Topic");
    expect(dl).toHaveTextContent("Botany");
  });

  it("omits the Topic row for an un-homed picture (Cut 1) and the License row when there is none", () => {
    render(
      <ItemFacts
        item={cell({ topicId: null, topicLabel: null, license: null })}
      />,
    );
    const dl = screen.getByRole("list", { name: "About this work" });
    expect(dl).not.toHaveTextContent("Topic");
    expect(dl).not.toHaveTextContent("License");
    // "From" is unconditional: every item has a source.
    expect(dl).toHaveTextContent("From");
  });

  it("falls back to the bare id when a homed topic's label did not resolve", () => {
    render(<ItemFacts item={cell({ topicLabel: null })} />);
    expect(
      screen.getByRole("list", { name: "About this work" }),
    ).toHaveTextContent("botany");
  });

  it("shows the debug row only when the server sent one", () => {
    const { rerender } = render(<ItemFacts item={cell()} />);
    expect(screen.queryByText("Debug")).toBeNull();
    rerender(
      <ItemFacts item={cell({ debug: { via: "drift", topic: "flowers" } })} />,
    );
    expect(screen.getByText(/drift · flowers/)).toBeInTheDocument();
  });

  it("typesets a stored PDR body under the summary and introduces it with the CC BY-SA notice", () => {
    render(
      <ItemFacts
        item={cell({
          source: "pdr",
          sourceUrl: "https://publicdomainreview.org/collection/x",
          body: "## A heading\n\nA paragraph of essay.",
        })}
      />,
    );
    expect(screen.getByText(/CC BY-SA 4.0/)).toBeInTheDocument();
    expect(screen.getByText("A paragraph of essay.")).toBeInTheDocument();
  });

  it("renders the link-out row for a blog and none for a museum", () => {
    const linkOut = /Read the post on|See it on/;
    const { rerender } = render(
      <ItemFacts item={cell({ source: "doorofperception" })} />,
    );
    expect(screen.getByRole("link", { name: linkOut })).toBeInTheDocument();
    rerender(<ItemFacts item={cell()} />);
    expect(screen.queryByRole("link", { name: linkOut })).toBeNull();
  });
});
