// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Overture, TAGLINE, WORDMARK } from "./overture";

vi.mock("~/lib/fonts", () => ({ inter: { className: "font-inter-test" } }));

describe("Overture", () => {
  it("renders the wordmark and the tail as separate spans, in the reference's order", () => {
    render(<Overture phase="in" />);
    const line = screen.getByTestId("overture");
    expect(line.textContent).toBe(`${WORDMARK}${TAGLINE}`);
    expect(screen.getByTestId("overture-tail").textContent).toBe(TAGLINE);
    expect(line.className).toContain("font-inter-test");
    expect(WORDMARK).toBe("AMBIT");
    expect(TAGLINE).toBe(" — A quieter way to be curious.");
  });

  it("collapse clips and fades the tail and drifts the wordmark by half the tail's width — no layout properties", () => {
    const { rerender } = render(<Overture phase="in" />);
    const tail = screen.getByTestId("overture-tail");
    Object.defineProperty(tail, "getBoundingClientRect", {
      value: () => ({ width: 300 }),
    });
    rerender(<Overture phase="collapse" />);
    expect(tail.style.getPropertyValue("clip-path")).toBe("inset(0 100% 0 0)");
    expect(tail.style.opacity).toBe("0");
    const mark = screen.getByTestId("overture-mark");
    expect(mark.style.getPropertyValue("--drift")).toBe("150px");
    expect(mark.style.transform).toBe("translateX(var(--drift, 0px))");
    expect(tail.style.transition).not.toMatch(/width|left|margin/);
  });

  it("done: the tail is gone and the mark stays", () => {
    render(<Overture phase="done" />);
    expect(screen.queryByTestId("overture-tail")).not.toBeInTheDocument();
    expect(screen.getByTestId("overture-mark")).toBeInTheDocument();
  });

  // The blend must sit on the fixed layer itself: a `position: fixed` + z-index element is its own
  // stacking context, so a blended child inside it blends against that empty group and never
  // reaches the pictures (seen on the 09-25 device pass — white text on light ice).
  it("blends in difference at the fixed layer, not on a child inside its stacking context", () => {
    render(<Overture phase="done" />);
    expect(screen.getByTestId("overture").className).toContain(
      "mix-blend-difference",
    );
    expect(screen.getByTestId("overture-mark").className).not.toContain(
      "mix-blend-difference",
    );
  });

  it("hidden: nothing renders (the sheet is up)", () => {
    render(<Overture phase="done" hidden />);
    expect(screen.queryByTestId("overture")).not.toBeInTheDocument();
  });
});
