// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OrbitMark, RingMark, TerminatorMark } from "./marks";

describe("candidate profile marks (docs/DESIGN_landing-redo.md D7)", () => {
  it.each([
    ["orbit", OrbitMark],
    ["terminator", TerminatorMark],
    ["ring", RingMark],
  ] as const)(
    "%s renders an svg of `size`, hue-driven, aria-hidden",
    (_, Mark) => {
      const { container } = render(<Mark size={40} hue={200} />);
      const svg = container.querySelector("svg")!;
      expect(svg.getAttribute("width")).toBe("40");
      expect(svg.getAttribute("height")).toBe("40");
      expect(svg.getAttribute("aria-hidden")).toBe("true");
      expect(container.innerHTML).toContain("hsl(200");
    },
  );

  it("orbit: the satellite's angle follows the hue, so two readers differ in position as well as colour", () => {
    const a = render(<OrbitMark size={40} hue={0} />).container.querySelector(
      "circle[data-satellite]",
    )!;
    const b = render(<OrbitMark size={40} hue={180} />).container.querySelector(
      "circle[data-satellite]",
    )!;
    expect(a.getAttribute("cx")).not.toBe(b.getAttribute("cx"));
  });

  it("orbit: two marks on one page never share a gradient id", () => {
    const { container } = render(
      <>
        <OrbitMark size={40} hue={10} />
        <OrbitMark size={40} hue={10} />
      </>,
    );
    const ids = [...container.querySelectorAll("linearGradient")].map(
      (g) => g.id,
    );
    expect(new Set(ids).size).toBe(2);
  });
});
