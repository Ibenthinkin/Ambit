// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CoverMosaic } from "./cover-mosaic";

// The face of a collection (docs/DESIGN_list-screens.md §2): nothing → the bookmark square, one
// picture fills, two to four tile a 2×2 with the empties filled by a flat cell. The arithmetic
// is the whole component, so the assertions are about cell counts.
const urls = (n: number) =>
  Array.from({ length: n }, (_, i) => `https://example.test/${i}.jpg`);

describe("CoverMosaic", () => {
  it("shows the bookmark placeholder and no image when there is nothing to show", () => {
    render(<CoverMosaic covers={[]} className="size-9" />);
    const face = screen.getByTestId("cover-mosaic");
    expect(face).toHaveAttribute("data-count", "0");
    expect(face.querySelector("img")).toBeNull();
    expect(face.querySelector("svg")).not.toBeNull();
  });

  it("one picture fills the square on its own", () => {
    render(<CoverMosaic covers={urls(1)} className="size-9" />);
    const face = screen.getByTestId("cover-mosaic");
    expect(face).toHaveAttribute("data-count", "1");
    expect(face.querySelectorAll("img")).toHaveLength(1);
    expect(face.querySelectorAll("[data-filler]")).toHaveLength(0);
  });

  it("three pictures fill three cells and a filler takes the fourth", () => {
    render(<CoverMosaic covers={urls(3)} className="size-9" />);
    const face = screen.getByTestId("cover-mosaic");
    expect(face).toHaveAttribute("data-count", "3");
    expect(face.querySelectorAll("img")).toHaveLength(3);
    expect(face.querySelectorAll("[data-filler]")).toHaveLength(1);
  });

  it("never shows more than four, in the order given", () => {
    render(<CoverMosaic covers={urls(6)} className="size-9" />);
    const srcs = [
      ...screen.getByTestId("cover-mosaic").querySelectorAll("img"),
    ].map((img) => img.getAttribute("src"));
    expect(srcs).toEqual(urls(4));
  });

  it("every picture is decorative", () => {
    render(<CoverMosaic covers={urls(2)} className="size-9" />);
    for (const img of document.querySelectorAll("img")) {
      expect(img).toHaveAttribute("alt", "");
    }
  });
});
