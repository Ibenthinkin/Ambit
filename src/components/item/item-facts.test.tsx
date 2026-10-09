// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { sourceLabel } from "~/lib/source-label";
import type { RailItem } from "~/server/services/gallery-rail";
import { ItemFacts, ItemFactsSpread } from "./item-facts";

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
    expect(screen.queryByText("By")).toBeNull();
    // Every remaining mention is a credit link (the line under the title, the From row) — none of
    // them is the plain maker paragraph.
    for (const el of screen.getAllByText(label)) expect(el.tagName).toBe("A");
  });

  it("lists the facts the corpus actually knows", () => {
    render(<ItemFacts item={cell()} />);
    const dl = screen.getByRole("list", { name: "About this work" });
    expect(dl).toHaveTextContent("By");
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

  it("lists the rows in the design's order: From, By, License, Topic", () => {
    render(<ItemFacts item={cell()} />);
    const labels = screen.getAllByRole("term").map((el) => el.textContent);
    expect(labels).toEqual(["From", "By", "License", "Topic"]);
  });

  it("renders the link-out button on every item with a source URL — a post for a blog, the source otherwise", () => {
    const { rerender } = render(
      <ItemFacts item={cell({ source: "doorofperception" })} />,
    );
    expect(
      screen.getByRole("link", { name: "Original post" }),
    ).toBeInTheDocument();
    rerender(<ItemFacts item={cell()} />);
    expect(
      screen.getByRole("link", { name: "Original source" }),
    ).toHaveAttribute("href", "https://example.test/o/1");
  });
});

describe("ItemFacts layout=wide (desktop Information)", () => {
  it("is a focusable named section with exactly one h1, the italic title", () => {
    render(<ItemFacts item={cell()} layout="wide" />);
    const region = screen.getByRole("region", { name: "Information" });
    expect(region).toHaveAttribute("id", "information");
    expect(region).toHaveAttribute("tabindex", "-1");
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent("A plate");
    expect(h1s[0]).toHaveClass("italic");
  });

  it("reads the same rows as the column layout: maker, source, licence, topic, summary", () => {
    render(<ItemFacts item={cell()} layout="wide" />);
    expect(screen.getByText("An engraver")).toBeInTheDocument();
    expect(screen.getByText("CC0")).toBeInTheDocument();
    expect(screen.getAllByText("Botany").length).toBeGreaterThan(0);
    expect(screen.getByText("A caption.")).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: /Read the original on/,
      }),
    ).toHaveAttribute("href", "https://example.test/o/1");
  });
});

describe("ItemFacts layout=wide link-out verbs", () => {
  it("uses the blog verb for a designated blog", () => {
    render(
      <ItemFacts item={cell({ source: "doorofperception" })} layout="wide" />,
    );
    expect(
      screen.getByRole("link", { name: /Read the post on/ }),
    ).toBeInTheDocument();
  });

  it("uses PDR's own verb", () => {
    render(<ItemFacts item={cell({ source: "pdr" })} layout="wide" />);
    expect(
      screen.getByRole("link", { name: /See it on The Public Domain Review/ }),
    ).toBeInTheDocument();
  });
});

describe("ItemFactsSpread (magazine view's Information)", () => {
  const pages = [
    cell({ id: "a", title: "Left work" }),
    cell({ id: "b", title: "Right work" }),
  ];

  it("shows both pages as Fig. 01 / Fig. 02 with the focused title as the one h1", () => {
    render(<ItemFactsSpread pages={pages} focusSide={1} />);
    expect(screen.getByText("Fig. 01")).toBeInTheDocument();
    expect(screen.getByText("Fig. 02")).toBeInTheDocument();
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent("Right work");
    expect(
      screen.getByRole("heading", { level: 2, name: "Left work" }),
    ).toBeInTheDocument();
  });

  it("keeps a PDR page's reuse notice and body in the spread", () => {
    render(
      <ItemFactsSpread
        pages={[
          cell({
            id: "p",
            source: "pdr",
            sourceUrl: "https://publicdomainreview.org/collection/x",
            body: "A paragraph of essay.",
          }),
          cell({ id: "b", title: "Right work" }),
        ]}
        focusSide={0}
      />,
    );
    expect(screen.getByText(/CC BY-SA 4.0/)).toBeInTheDocument();
    expect(screen.getByText("A paragraph of essay.")).toBeInTheDocument();
  });

  it("still has exactly one h1 when the right slot is the end card", () => {
    render(<ItemFactsSpread pages={[cell({ title: "Only" })]} focusSide={1} />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});

// The More-or-less pair is a render slot (docs/DESIGN_more-or-less.md D6): the layouts decide
// *where* it goes, the screen decides *what* it is. A stand-in proves the placement.
describe("the feedback slot", () => {
  const slot = (item: RailItem) => (
    <div data-testid="pair" data-item={item.id} />
  );
  // `compareDocumentPosition`'s FOLLOWING bit: `b` comes after `a` in document order.
  const after = (a: Node, b: Node) =>
    Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  it("wide: under the summary, above the bracket link-out, in the third column", () => {
    render(<ItemFacts item={cell()} layout="wide" feedback={slot} />);
    const pair = screen.getByTestId("pair");
    expect(pair).toHaveAttribute("data-item", "item-1");
    expect(after(screen.getByText("A caption."), pair)).toBe(true);
    const linkOut = screen.getByRole("link", { name: /Read the original on/ });
    expect(after(pair, linkOut)).toBe(true);
    // Same column as the summary, in a wrapper 22 px under it — the frame's D2B.
    const wrapper = pair.parentElement!;
    expect(wrapper.parentElement).toBe(
      screen.getByText("A caption.").parentElement,
    );
    expect(wrapper).toHaveClass("mt-[22px]");
    // And the link-out 22 px under the pair (D2B), where without a pair it keeps 20.
    expect(linkOut.closest("p")).toHaveClass("mt-[22px]");
  });

  it("wide with no summary: the pair leads the column", () => {
    render(
      <ItemFacts
        item={cell({ summary: null })}
        layout="wide"
        feedback={slot}
      />,
    );
    const wrapper = screen.getByTestId("pair").parentElement!;
    expect(wrapper.parentElement?.firstElementChild).toBe(wrapper);
    expect(wrapper).not.toHaveClass("mt-[22px]");
  });

  it("spread: one per figure, keyed on that figure's item, under its title", () => {
    render(
      <ItemFactsSpread
        pages={[cell(), cell({ id: "item-2", title: "Another plate" })]}
        focusSide={0}
        feedback={slot}
      />,
    );
    const pairs = screen.getAllByTestId("pair");
    expect(pairs.map((p) => p.getAttribute("data-item"))).toEqual([
      "item-1",
      "item-2",
    ]);
    const figs = screen.getAllByTestId("spread-fig");
    figs.forEach((fig, i) => {
      const title = fig.querySelector("h1, h2")!;
      expect(fig.contains(pairs[i]!)).toBe(true);
      expect(after(title, pairs[i]!)).toBe(true);
      // The frame's D3B: 24 px under the 40 px title.
      expect(pairs[i]!.parentElement).toHaveClass("mt-6");
      // Above the maker block.
      expect(after(pairs[i]!, fig.querySelector("[data-maker]")!)).toBe(true);
    });
  });

  it("wide without a slot: the link-out keeps its 20 px", () => {
    render(<ItemFacts item={cell()} layout="wide" />);
    expect(
      screen.getByRole("link", { name: /Read the original on/ }).closest("p"),
    ).toHaveClass("mt-5");
  });

  it("column: the layout places no pair — the phone screen puts it above the facts", () => {
    render(<ItemFacts item={cell()} feedback={slot} />);
    expect(screen.queryByTestId("pair")).toBeNull();
  });
});
