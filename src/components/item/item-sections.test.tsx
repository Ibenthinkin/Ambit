// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Item } from "~/server/db/items";
import { JoinCta } from "./join-cta";
import { ReaderItemBody } from "./reader-item-body";
import { SharedByRow, sharedByName } from "./shared-by-row";
import { WanderNext } from "./wander-next";

// `next/link` renders a plain anchor — the assertions here are about hrefs and copy, not about
// Link's own behaviour (same shortcut as back-to-feed.test.tsx).
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: React.ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

const makeItem = (over: Partial<Item> = {}): Item =>
  ({
    id: "item-1",
    source: "wikipedia",
    type: "article",
    title: "Neptune",
    summary: "The eighth planet.",
    body: null,
    sourceUrl: "https://en.wikipedia.org/?curid=19003265",
    ...over,
  }) as Item;

describe("ReaderItemBody", () => {
  // Thin over reader-blocks.test.ts on purpose: that file proves the parser, this one proves the
  // parser is actually wired to the page.
  it("typesets stored section markers and drops the apparatus", () => {
    render(
      <ReaderItemBody
        item={makeItem({
          body: [
            "== Discovery ==",
            "Found in 1846.",
            "== References ==",
            "Galle, J. (1846). A letter.",
          ].join("\n"),
        })}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Discovery", level: 2 }),
    ).toBeInTheDocument();
    expect(screen.getByText("Found in 1846.")).toBeInTheDocument();
    expect(screen.queryByText(/Galle, J\./)).toBeNull();
    expect(screen.queryByText("References")).toBeNull();
  });

  it("titles the page and links out to the source", () => {
    render(<ReaderItemBody item={makeItem()} />);

    expect(
      screen.getByRole("heading", { name: "Neptune", level: 1 }),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Read on Wikipedia/ });
    expect(link).toHaveAttribute(
      "href",
      "https://en.wikipedia.org/?curid=19003265",
    );
  });

  it("still reads as an article when there's no stored body at all", () => {
    render(<ReaderItemBody item={makeItem({ body: null })} />);

    expect(screen.getByText("The eighth planet.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  });
});

describe("WanderNext", () => {
  const rows = [
    {
      id: "a",
      title: "A sundial",
      reason: "a drift from Botany into Machines",
    },
    {
      id: "b",
      title: "A comet",
      reason: "a longer leap, from Botany to Astronomy",
    },
  ];

  it("links each row at the item it names", () => {
    render(<WanderNext rows={rows} />);

    expect(screen.getByRole("link", { name: /A sundial/ })).toHaveAttribute(
      "href",
      "/i/a",
    );
    expect(
      screen.getByText("a longer leap, from Botany to Astronomy"),
    ).toBeInTheDocument();
  });

  // An empty section with a heading reads as a broken feature.
  it("renders nothing at all when there's nowhere to wander", () => {
    const { container } = render(<WanderNext rows={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("JoinCta", () => {
  it("makes the full pitch under an image", () => {
    render(<JoinCta variant="image" />);

    expect(
      screen.getByText("Curiosity, without the doomscroll."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Get your invite" }),
    ).toHaveAttribute("href", "/");
  });

  it("is quieter under a long read", () => {
    render(<JoinCta variant="article" />);

    expect(
      screen.getByText("Ambit is a quieter way to read."),
    ).toBeInTheDocument();
  });

  // `/feed` is auth-gated, so this link would bounce a stranger straight back to the landing page.
  it("never offers a browse-without-an-account dead end", () => {
    render(<JoinCta variant="image" />);
    expect(screen.queryByText(/Keep browsing/i)).toBeNull();
  });
});

describe("SharedByRow", () => {
  it("names the sharer and derives their initial", () => {
    render(<SharedByRow name="mara" />);

    expect(screen.getByText("mara shared this with you")).toBeInTheDocument();
    expect(screen.getByText("M")).toBeInTheDocument();
  });
});

describe("sharedByName", () => {
  it("accepts an ordinary name", () => {
    expect(sharedByName("Mara")).toBe("Mara");
    expect(sharedByName("  Mara  ")).toBe("Mara");
  });

  it("rejects absence, emptiness, a repeated param, and anything oversized", () => {
    expect(sharedByName(undefined)).toBeNull();
    expect(sharedByName("")).toBeNull();
    expect(sharedByName("   ")).toBeNull();
    expect(sharedByName(["a", "b"])).toBeNull();
    expect(sharedByName("x".repeat(41))).toBeNull();
  });
});

describe("ReaderItemBody for a Public Domain Review essay", () => {
  it("introduces the essay with the CC BY-SA notice", () => {
    render(
      <ReaderItemBody
        item={makeItem({
          source: "pdr",
          type: "article",
          title: "Stories of a Hollow Earth",
          summary: "In 1741 Ludvig Holberg published a satirical novel.",
          body: "In 1818 John Cleves Symmes issued his circular.",
          sourceUrl:
            "https://publicdomainreview.org/essay/stories-of-a-hollow-earth/",
        })}
      />,
    );
    expect(
      screen.getByText(/Text originally published on/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("In 1818 John Cleves Symmes issued his circular."),
    ).toBeInTheDocument();
  });

  it("shows no notice on a Wikipedia article", () => {
    render(<ReaderItemBody item={makeItem({ body: "Found in 1846." })} />);
    expect(
      screen.queryByText(/Text originally published on/),
    ).not.toBeInTheDocument();
  });
});
