// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { beforeEach, describe, expect, it } from "vitest";

import type { RailItem } from "~/server/services/gallery-rail";
import { HeroRail, heroHeight } from "./hero-rail";

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
  desktop = false,
  chromeVisible = false,
}: {
  cells: readonly [RailItem | undefined, RailItem, RailItem | undefined];
  desktop?: boolean;
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
      desktop={desktop}
    />
  );
}

/** jsdom's viewport is 1024×768 by default; the strip reads both on mount and on resize. */
function viewport(w: number, h: number) {
  Object.defineProperty(window, "innerWidth", { value: w, configurable: true });
  Object.defineProperty(window, "innerHeight", {
    value: h,
    configurable: true,
  });
  act(() => void window.dispatchEvent(new Event("resize")));
}

/** Fires the picture's `load` with a natural size, which is how the strip learns its ratio. */
function loaded(img: HTMLElement, w: number, h: number) {
  Object.defineProperty(img, "naturalWidth", { value: w, configurable: true });
  Object.defineProperty(img, "naturalHeight", {
    value: h,
    configurable: true,
  });
  fireEvent.load(img);
}

describe("heroHeight", () => {
  it("is the viewport height on desktop, whatever the picture", () => {
    expect(heroHeight(2, 1440, 900, true)).toBe(900);
    expect(heroHeight(undefined, 1440, 900, true)).toBe(900);
  });

  it("is the picture's own height on the phone, capped at the viewport", () => {
    expect(heroHeight(1, 402, 874, false)).toBe(402); // square → as tall as it is wide
    expect(heroHeight(0.5, 402, 874, false)).toBe(201); // landscape
    expect(heroHeight(3, 402, 874, false)).toBe(874); // tall → capped
  });

  it("is the viewport height while the ratio is unknown — the entry picture is preloaded, so that is a frame", () => {
    expect(heroHeight(undefined, 402, 874, false)).toBe(874);
  });
});

describe("HeroRail", () => {
  beforeEach(() => viewport(402, 874));

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

  it("follows the current picture's height once it has loaded, and places the chrome below a short one", () => {
    render(<Harness cells={[undefined, cell("b"), undefined]} />);
    const strip = screen.getByTestId("hero-rail");
    const frame = screen.getByTestId("hero-frame");
    // Unknown ratio: full height, chrome overlaid.
    expect(frame.style.height).toBe("874px");
    expect(strip).toHaveAttribute("data-overlay", "true");

    loaded(screen.getByAltText("Plate b"), 1000, 1000); // square
    expect(frame.style.height).toBe("402px");
    expect(strip).toHaveAttribute("data-overlay", "false");
  });

  it("keeps a tall picture at the full viewport height with the chrome over it", () => {
    render(<Harness cells={[undefined, cell("b"), undefined]} />);
    loaded(screen.getByAltText("Plate b"), 1000, 2200);
    expect(screen.getByTestId("hero-frame").style.height).toBe("874px");
    expect(screen.getByTestId("hero-rail")).toHaveAttribute(
      "data-overlay",
      "true",
    );
  });

  it("is always the viewport height on desktop", () => {
    viewport(1440, 900);
    render(<Harness cells={[undefined, cell("b"), undefined]} desktop />);
    loaded(screen.getByAltText("Plate b"), 1000, 1000);
    expect(screen.getByTestId("hero-frame").style.height).toBe("900px");
    expect(screen.getByTestId("hero-rail")).toHaveAttribute(
      "data-overlay",
      "true",
    );
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
