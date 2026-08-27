// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Item } from "~/server/db/items";
import { ImageItemBody } from "./image-item-body";
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

describe("ImageItemBody's hero", () => {
  const image = () =>
    makeItem({
      type: "image",
      title: "A plate",
      imageUrl: "https://example.test/plate.jpg",
      attribution: "An engraver",
    });

  it("opens the gallery on a tap, marking the origin on the way", () => {
    sessionStorage.clear();
    pushMock.mockClear();
    render(<ImageItemBody item={image()} />);

    const img = screen.getByAltText("A plate");
    fireEvent.pointerDown(img, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(img, { clientX: 10, clientY: 10 });

    expect(pushMock).toHaveBeenCalledWith("/g/item-1");
    // The marker is what makes the gallery's close gesture a *pop* back to this page rather than a
    // push. See `components/gallery/gallery-origin.ts`.
    expect(sessionStorage.getItem("ambit.galleryOrigin.v1")).toBe("item-1");
  });

  it("does not fire on a press that travelled — a scroll is not a tap", () => {
    pushMock.mockClear();
    render(<ImageItemBody item={image()} />);

    const img = screen.getByAltText("A plate");
    fireEvent.pointerDown(img, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(img, { clientX: 10, clientY: 90 });
    fireEvent.pointerUp(img, { clientX: 10, clientY: 90 });

    expect(pushMock).not.toHaveBeenCalled();
  });

  // The phase's single most likely regression, pinned: an anchor changes iOS's long-press callout
  // on the image it wraps, and the callout is what offers the native "Add to Photos" (verified on
  // device 08-20-26). `-webkit-touch-callout: none` — which the *feed tiles* need — would kill it
  // outright. Neither may appear here. See `image-item-body.tsx`'s header for the full account.
  it("wraps the picture in no anchor and suppresses no callout", () => {
    const { container } = render(<ImageItemBody item={image()} />);

    const img = screen.getByAltText("A plate");
    expect(img.closest("a")).toBeNull();
    expect(container.innerHTML).not.toContain("webkit-touch-callout");
  });
});

describe("ImageItemBody — blog items and the maker line", () => {
  it("shows the link-out row and no reader body for a blog item", () => {
    render(
      <ImageItemBody
        item={makeItem({
          type: "image",
          source: "doorofperception",
          title: "The Geologic Atlas of the Moon",
          summary:
            "The palette exists so that four billion years can be told apart at a glance.",
          imageUrl: "https://example.test/hero.jpg",
          sourceUrl:
            "https://doorofperception.com/2026/08/the-geologic-atlas-of-the-moon/",
          attribution: "Door of Perception",
          body: null,
        })}
      />,
    );
    expect(
      screen.getByRole("link", { name: /Read the post on Door of Perception/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/four billion years/)).toBeInTheDocument();
  });

  it("prints the maker line once when attribution merely repeats the source label", () => {
    render(
      <ImageItemBody
        item={makeItem({
          type: "image",
          source: "doorofperception",
          attribution: "Door of Perception",
          imageUrl: "https://example.test/hero.jpg",
          sourceUrl: "https://doorofperception.com/x/",
        })}
      />,
    );
    // The label appears in the credit line's link and the link-out row — never as a maker line.
    expect(screen.getAllByText(/Door of Perception/)).toHaveLength(2);
    expect(
      screen.queryByText("Door of Perception", { exact: true, selector: "p" }),
    ).toBeNull();
  });

  it("still prints a real maker when the source names one", () => {
    render(
      <ImageItemBody
        item={makeItem({
          type: "image",
          source: "met",
          attribution: "An engraver",
          imageUrl: "https://example.test/p.jpg",
        })}
      />,
    );
    expect(screen.getByText("An engraver")).toBeInTheDocument();
  });
});
