// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Chip } from "./chip";

// DESIGN_redesign §4.2: square, ink-filled when on, a cursor zoom of 1.05 over 350 ms, no
// `mixed` state and no pop animation.
describe("Chip", () => {
  it("is an outline with a 28% border when off", () => {
    render(<Chip>Off</Chip>);
    const off = screen.getByRole("button", { name: "Off" });
    expect(off).toHaveClass("border-ink/28", "text-ink/95", "bg-transparent");
    expect(off).toHaveClass("hover:border-ink/70");
    expect(off).not.toHaveClass("bg-ink");
  });

  it("fills with ink and takes dark text when on", () => {
    render(<Chip selected>On</Chip>);
    const on = screen.getByRole("button", { name: "On" });
    expect(on).toHaveClass("bg-ink", "border-ink", "text-bg");
    expect(on).not.toHaveClass("bg-accent");
  });

  it("is square: no radius class at all", () => {
    render(<Chip selected>Square</Chip>);
    expect(screen.getByRole("button").className).not.toMatch(/rounded/);
  });

  it("zooms 1.05 over 350 ms on hover and keyboard focus, and keeps easing under Reduce Motion", () => {
    render(<Chip>Zoom</Chip>);
    const chip = screen.getByRole("button", { name: "Zoom" });
    expect(chip).toHaveClass(
      "hover:scale-[1.05]",
      "focus-visible:scale-[1.05]",
      "duration-350",
      "ease-out",
      "motion-lift",
    );
    // Tailwind v4's scale-* is the standalone `scale` property, so that is what transitions.
    expect(chip.className).toMatch(/transition-\[[^\]]*\bscale\b/);
  });

  it("has no pop animation, selected or not, at either size", () => {
    render(
      <>
        <Chip selected>A</Chip>
        <Chip selected size="sm">
          B
        </Chip>
      </>,
    );
    for (const b of screen.getAllByRole("button")) {
      expect(b.className).not.toMatch(/animate-chip-pop/);
    }
  });

  it("fires its click handler", () => {
    const onClick = vi.fn();
    render(<Chip onClick={onClick}>Painting</Chip>);
    fireEvent.click(screen.getByRole("button", { name: "Painting" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("sizes: md is 16 px with 11 x 16 padding, sm is 13.5 px with 8 x 12", () => {
    render(
      <>
        <Chip>Medium</Chip>
        <Chip size="sm">Small</Chip>
      </>,
    );
    expect(screen.getByRole("button", { name: "Medium" })).toHaveClass(
      "px-4",
      "py-[11px]",
      "text-[16px]",
    );
    expect(screen.getByRole("button", { name: "Small" })).toHaveClass(
      "px-3",
      "py-2",
      "text-[13.5px]",
    );
  });

  it("reports its toggle state via aria-pressed, only ever true or false", () => {
    render(
      <>
        <Chip selected>On</Chip>
        <Chip>Off</Chip>
      </>,
    );
    expect(screen.getByRole("button", { name: "On" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Off" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
