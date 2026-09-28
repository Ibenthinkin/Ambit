// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ViewGlyph } from "./view-glyph";

const paths = (container: HTMLElement) =>
  [...container.querySelectorAll("path")].map((p) => p.getAttribute("d"));

// Ben's mark from docs/viewTOggleTOkens/: always two paths with the same command structure, so
// `d` can morph between a single page and an open magazine.
describe("ViewGlyph", () => {
  it("draws one page, as two halves meeting at x=12", () => {
    const { container } = render(<ViewGlyph mode="single" />);
    expect(paths(container)).toEqual([
      "M12 4C12 4 6.5 4 6.5 4V20C6.5 20 12 20 12 20Z",
      "M12 4C12 4 17.5 4 17.5 4V20C17.5 20 12 20 12 20Z",
    ]);
  });

  it("draws an open magazine for a spread, with the same commands", () => {
    const single = paths(render(<ViewGlyph mode="single" />).container);
    const spread = paths(render(<ViewGlyph mode="spread" />).container);
    const shape = (d: string | null) => d!.replace(/[-\d.]+/g, "#");
    expect(spread.map(shape)).toEqual(single.map(shape));
    expect(spread).not.toEqual(single);
  });

  it("transitions d, in currentColor", () => {
    const { container } = render(<ViewGlyph mode="spread" />);
    const path = container.querySelector("path")!;
    expect(path.getAttribute("fill")).toBe("currentColor");
    expect(path.getAttribute("style")).toContain("transition");
  });
});
