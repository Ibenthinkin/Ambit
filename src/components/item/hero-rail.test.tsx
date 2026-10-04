// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import * as React from "react";
import { describe, expect, it } from "vitest";

import type { RailItem } from "~/server/services/gallery-rail";
import { HeroRail } from "./hero-rail";
import type { HeroCells } from "./rail-cells";

const cell = (id: string, over: Partial<RailItem> = {}): RailItem => ({
  id,
  title: `Plate ${id}`,
  attribution: null,
  imageUrl: `https://example.test/${id}.jpg`,
  summary: null,
  body: null,
  source: "met",
  sourceUrl: `https://example.test/o/${id}`,
  license: null,
  topicId: null,
  topicLabel: null,
  ...over,
});

/** Single-mode cells, written the way the tests always did: one picture per cell. */
const one = (
  cells: readonly [RailItem | undefined, RailItem, RailItem | undefined],
): HeroCells => [
  cells[0] ? [cells[0]] : undefined,
  [cells[1]],
  cells[2] ? [cells[2]] : undefined,
];

function Harness({
  cells,
  spread,
  pages = 1,
  chromeVisible = false,
  zoom,
}: {
  cells?: readonly [RailItem | undefined, RailItem, RailItem | undefined];
  spread?: HeroCells;
  pages?: 1 | 2;
  chromeVisible?: boolean;
  zoom?: React.ComponentProps<typeof HeroRail>["zoom"];
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  return (
    <HeroRail
      cells={spread ?? one(cells!)}
      pages={pages}
      trackRef={ref}
      dragPx={0}
      dragging={false}
      chrome={<p>caption</p>}
      chromeVisible={chromeVisible}
      zoom={zoom}
    />
  );
}

describe("HeroRail", () => {
  it("renders the three cells, the current one alt-labelled, with no rounded corners and a pan-y track", () => {
    render(<Harness cells={[cell("a"), cell("b"), cell("c")]} />);
    const track = screen.getByTestId("gallery-track");
    expect(track.querySelectorAll("img")).toHaveLength(3);
    expect(track.style.touchAction).toBe("pan-y");
    const img = screen.getByAltText("Plate b");
    expect(img.className).not.toMatch(/rounded/);
    expect(img).toHaveAttribute("src", "/api/img/b");
  });

  it("renders an empty cell for an absent neighbour, so the end reads as an edge", () => {
    render(<Harness cells={[undefined, cell("b"), undefined]} />);
    expect(
      screen.getByTestId("gallery-track").querySelectorAll("img"),
    ).toHaveLength(1);
  });

  // Ben's review of the chrome redesign (09-11-26): "there's no gallery view on the phone". The
  // strip is the viewport on every width now — the phone's picture-height strip, and the caption
  // that sat *below* a short picture, are gone. The caption always overlays the foot.
  it("is the full viewport height on every width, with the caption overlaying its foot", () => {
    render(<Harness cells={[undefined, cell("b"), undefined]} />);
    const frame = screen.getByTestId("hero-frame");
    expect(frame).toHaveClass("h-dvh");
    expect(frame.style.height).toBe("");
    expect(frame).toContainElement(screen.getByTestId("gallery-chrome"));
    expect(screen.queryByTestId("hero-chrome-below")).toBeNull();
  });

  // "A little padding around the images, like the Photos app on iOS" — the same review. The
  // picture is centred both ways inside a 12px inset, whole, never cropped.
  it("insets the picture 12px on every side and centres it in the frame", () => {
    render(<Harness cells={[undefined, cell("b"), undefined]} />);
    const img = screen.getByAltText("Plate b");
    // The current single page wraps its picture in the zoom's measured box
    // (docs/DESIGN_hero-zoom.md D3), so the page is one level further up.
    const page = img.closest("[data-page-box]")!.parentElement!;
    expect(page).toHaveClass(
      "px-[12px]",
      "py-[12px]",
      "items-center",
      "justify-center",
    );
    expect(img).not.toHaveClass("object-left", "object-right");
    expect(img).toHaveClass("object-contain", "h-full", "w-full");
    expect(img).not.toHaveClass("object-top");
  });

  it("fades the chrome as one unit and makes it inert while hidden", () => {
    const { rerender } = render(
      <Harness cells={[undefined, cell("b"), undefined]} />,
    );
    const chrome = screen.getByTestId("gallery-chrome");
    expect(chrome).toHaveAttribute("aria-hidden", "true");
    expect(chrome.style.visibility).toBe("hidden");

    rerender(
      <Harness cells={[undefined, cell("b"), undefined]} chromeVisible />,
    );
    expect(chrome).toHaveAttribute("aria-hidden", "false");
    expect(chrome.style.visibility).toBe("visible");
    expect(chrome).toHaveTextContent("caption");
  });

  // docs/DESIGN_spread-mode.md D3, as refined after Ben's first look (09-27-26): the two pictures
  // meet at the spine — a thin gutter, each picture pushed against it — and the 12px inset stays on
  // the outer edges.
  it("a spread cell renders two pages that lean against the spine", () => {
    render(
      <Harness
        pages={2}
        spread={[
          [cell("a"), cell("b")],
          [cell("c"), cell("d")],
          [cell("e"), cell("f")],
        ]}
      />,
    );
    expect(
      screen.getByTestId("gallery-track").querySelectorAll("img"),
    ).toHaveLength(6);
    const left = screen.getByAltText("Plate c");
    const right = screen.getByAltText("Plate d");
    expect(left.parentElement).toHaveClass(
      "flex-1",
      "min-w-0",
      "pl-[12px]",
      "justify-end",
    );
    expect(right.parentElement).toHaveClass(
      "flex-1",
      "min-w-0",
      "pr-[12px]",
      "justify-start",
    );
    expect(left.parentElement!.style.paddingRight).toBe("0px");
    expect(right.parentElement!.style.paddingLeft).toBe("0px");
    expect(left).toHaveClass("object-contain", "object-right");
    expect(right).toHaveClass("object-contain", "object-left");
    // Both pages of the spread under the reader are fetched first.
    expect(screen.getByAltText("Plate c")).toHaveAttribute(
      "fetchpriority",
      "high",
    );
    expect(screen.getByAltText("Plate d")).toHaveAttribute(
      "fetchpriority",
      "high",
    );
    expect(screen.getByAltText("Plate e")).toHaveAttribute(
      "fetchpriority",
      "auto",
    );
  });

  // A rail that ends on an odd count: the last spread's right page is blank, like a magazine's
  // last verso — the lone picture stays on the left half rather than centring.
  it("a one-page cell in a spread keeps its page on the left half", () => {
    render(
      <Harness
        pages={2}
        spread={[[cell("a"), cell("b")], [cell("c")], undefined]}
      />,
    );
    const page = screen.getByAltText("Plate c").parentElement!;
    const cellEl = page.parentElement!;
    expect(cellEl.children).toHaveLength(2);
    expect(cellEl.children[0]).toBe(page);
    expect(cellEl.children[1]!.querySelector("img")).toBeNull();
    expect(cellEl.children[1]).toHaveClass("flex-1");
  });

  // The merge's single most likely regression, carried over from the old item hero's test: an
  // anchor changes iOS's long-press callout on the image it wraps, and the callout is what offers
  // the native "Add to Photos" (verified on device 08-20-26). `-webkit-touch-callout: none` —
  // which the *feed tiles* need — would kill it outright. Neither may appear on the strip.
  it("wraps the picture in no anchor and suppresses no callout", () => {
    const { container } = render(
      <Harness cells={[undefined, cell("b"), undefined]} />,
    );
    expect(screen.getByAltText("Plate b").closest("a")).toBeNull();
    expect(container.innerHTML).not.toContain("webkit-touch-callout");
  });
});

describe("zoom (docs/DESIGN_hero-zoom.md D4)", () => {
  const cells = [cell("a"), cell("b"), cell("c")] as const;

  it("puts the transform on the current cell's image only, with a top-left origin", () => {
    render(
      <Harness
        cells={cells}
        zoom={{ scale: 2, x: -100, y: -50, snapping: false }}
      />,
    );
    const b = screen.getByAltText("Plate b");
    expect(b.style.transform).toBe("translate(-100px, -50px) scale(2)");
    expect(b.style.transformOrigin).toBe("0 0");
    expect(b.style.transition).toBe("none");
    expect(screen.getByAltText("Plate a").style.transform).toBe("");
    expect(screen.getByAltText("Plate c").style.transform).toBe("");
  });

  it("transitions only while snapping", () => {
    render(
      <Harness cells={cells} zoom={{ scale: 2, x: 0, y: 0, snapping: true }} />,
    );
    expect(screen.getByAltText("Plate b").style.transition).toMatch(
      /transform 250ms/,
    );
  });

  it("hands the track to the picture while zoomed: touch-action none, pan-y otherwise", () => {
    const { rerender } = render(<Harness cells={cells} zoom={null} />);
    expect(screen.getByTestId("gallery-track").style.touchAction).toBe("pan-y");
    rerender(
      <Harness
        cells={cells}
        zoom={{ scale: 2, x: 0, y: 0, snapping: false }}
      />,
    );
    expect(screen.getByTestId("gallery-track").style.touchAction).toBe("none");
  });

  it("wraps the current page's picture in a measurable box", () => {
    render(<Harness cells={cells} />);
    const box = screen
      .getByTestId("hero-rail")
      .querySelector("[data-page-box]");
    expect(box).not.toBeNull();
    expect(box!.querySelector("img")).toBe(screen.getByAltText("Plate b"));
    // One box: the neighbours are not measured.
    expect(
      screen.getByTestId("hero-rail").querySelectorAll("[data-page-box]"),
    ).toHaveLength(1);
  });
});
