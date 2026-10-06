// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Eyebrow } from "./eyebrow";

// DESIGN §4.6 / §4.7: the one mono label. Grey, never accent; the dot alone is green.
describe("Eyebrow", () => {
  it("is mono, uppercase, 10.5px, 0.4px tracking, ink/55", () => {
    render(<Eyebrow>Your first exhibition</Eyebrow>);
    const el = screen.getByText("Your first exhibition");
    expect(el.tagName).toBe("SPAN");
    for (const c of [
      "font-mono",
      "uppercase",
      "text-[10.5px]",
      "tracking-[0.4px]",
      "text-ink/55",
    ]) {
      expect(el.className).toContain(c);
    }
    expect(el.className).not.toContain("text-accent");
  });

  it("renders as another element with `as`", () => {
    render(<Eyebrow as="h2">Because</Eyebrow>);
    expect(screen.getByRole("heading", { name: "Because" })).toBeTruthy();
  });

  it("has no dot by default", () => {
    const { container } = render(<Eyebrow>Plain</Eyebrow>);
    expect(container.querySelector("[data-eyebrow-dot]")).toBeNull();
  });

  it("dot adds a 6px green, decorative, round dot", () => {
    const { container } = render(<Eyebrow dot>Ambit</Eyebrow>);
    const dot = container.querySelector("[data-eyebrow-dot]")!;
    expect(dot.getAttribute("aria-hidden")).toBe("true");
    expect(dot.className).toContain("bg-accent");
    expect(dot.className).toContain("size-[6px]");
    expect(dot.className).toContain("rounded-full");
  });
});
