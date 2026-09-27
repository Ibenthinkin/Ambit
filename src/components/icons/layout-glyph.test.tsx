// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LayoutGlyph } from "./layout-glyph";

const bars = (container: HTMLElement) =>
  [...container.querySelectorAll("rect")].map((r) => [
    Number(r.getAttribute("x")),
    Number(r.getAttribute("width")),
  ]);

// The placeholder from docs/layout-picker/layout-picker.tokens.json: always four rects, which
// overlap into fewer, wider bars — that is what lets the glyph morph between states.
describe("LayoutGlyph", () => {
  it("draws one wide bar for a single picture", () => {
    const { container } = render(<LayoutGlyph pages={1} />);
    expect(bars(container)).toEqual(Array(4).fill([5.5, 13]));
  });

  it("draws two bars for a spread", () => {
    const { container } = render(<LayoutGlyph pages={2} />);
    expect(bars(container)).toEqual([
      [3, 7.6],
      [3, 7.6],
      [13.4, 7.6],
      [13.4, 7.6],
    ]);
  });

  it("transitions x and width, in currentColor", () => {
    const { container } = render(<LayoutGlyph pages={1} />);
    const rect = container.querySelector("rect")!;
    expect(rect.getAttribute("fill")).toBe("currentColor");
    expect(rect.style.transition).toContain("width");
  });
});
