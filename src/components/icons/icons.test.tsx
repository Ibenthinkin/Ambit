// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Minus, Plus } from "./index";

describe("Minus / Plus", () => {
  it("Minus draws the one horizontal arm on the 26 grid, round caps", () => {
    const { container } = render(<Minus />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 26 26");
    expect(svg.getAttribute("stroke-linecap")).toBe("round");
    expect(svg.querySelector("path")!.getAttribute("d")).toBe("M6 13h14");
  });
  it("forwards strokeWidth, defaulting to 1.5", () => {
    const a = render(<Minus strokeWidth={2} />).container.querySelector("svg")!;
    expect(a.getAttribute("stroke-width")).toBe("2");
    const b = render(<Plus />).container.querySelector("svg")!;
    expect(b.getAttribute("stroke-width")).toBe("1.5");
  });
});
