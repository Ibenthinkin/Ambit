// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import * as React from "react";
import { describe, expect, it } from "vitest";

import type { RailItem } from "~/server/services/gallery-rail";
import { HeroRail } from "./hero-rail";

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

function Harness({
  cells,
  chromeVisible = false,
}: {
  cells: readonly [RailItem | undefined, RailItem, RailItem | undefined];
  chromeVisible?: boolean;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  return (
    <HeroRail
      cells={cells}
      trackRef={ref}
      dragPx={0}
      dragging={false}
      chrome={<p>caption</p>}
      chromeVisible={chromeVisible}
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
    const cellEl = img.parentElement!;
    expect(cellEl).toHaveClass("p-[12px]", "items-center", "justify-center");
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
