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

  // Reduced motion (D6, 09-26-26): the line is for every reader now. The server renders phase
  // `in` for all of them (D8), and a reduced-motion reader gets it as a plain fade — so nothing
  // may hide it from first paint, and the root must opt out of the global 0.01 ms collapse.
  it("is no longer hidden for reduced-motion readers, and opts out of the global collapse", () => {
    render(<Overture phase="in" />);
    const line = screen.getByTestId("overture");
    expect(line.className).not.toContain("motion-reduce:hidden");
    expect(line.className).toContain("motion-gentle");
  });

  it("gentle collapse: the whole line fades on opacity alone — no clip, no drift, and the fade-in animation is dropped so the inline opacity can paint", () => {
    const { rerender } = render(<Overture phase="in" gentle />);
    const tail = screen.getByTestId("overture-tail");
    Object.defineProperty(tail, "getBoundingClientRect", {
      value: () => ({ width: 300 }),
    });
    rerender(<Overture phase="collapse" gentle />);
    const line = screen.getByTestId("overture");
    expect(line.style.opacity).toBe("0");
    expect(line.style.transition).toContain("opacity 2200ms");
    expect(line.style.animation).toBe("none");
    const mark = screen.getByTestId("overture-mark");
    expect(mark.style.transform).toBe("none");
    expect(mark.style.getPropertyValue("--drift")).toBe("");
    expect(tail.style.getPropertyValue("clip-path")).toBe("inset(0)");
    expect(tail.style.opacity).toBe("1");
  });

  it("gentle done: the tail is gone and the wordmark remounts, fading in again on its own", () => {
    const { rerender } = render(<Overture phase="collapse" gentle />);
    const before = screen.getByTestId("overture");
    rerender(<Overture phase="done" gentle />);
    const after = screen.getByTestId("overture");
    expect(after).not.toBe(before);
    expect(screen.queryByTestId("overture-tail")).not.toBeInTheDocument();
    expect(after.style.animation).toContain("overture-in 500ms");
    expect(after.style.opacity).toBe("");
  });

  it("full motion is unchanged by the prop's default: collapse still clips and drifts", () => {
    const { rerender } = render(<Overture phase="in" />);
    const tail = screen.getByTestId("overture-tail");
    Object.defineProperty(tail, "getBoundingClientRect", {
      value: () => ({ width: 300 }),
    });
    rerender(<Overture phase="collapse" />);
    expect(tail.style.getPropertyValue("clip-path")).toBe("inset(0 100% 0 0)");
    expect(screen.getByTestId("overture").style.opacity).toBe("");
  });
});
