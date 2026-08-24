// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Chip } from "./chip";

describe("Chip", () => {
  it("applies different classes for selected vs unselected", () => {
    render(<Chip selected>On</Chip>);
    render(<Chip>Off</Chip>);

    const on = screen.getByRole("button", { name: "On" });
    const off = screen.getByRole("button", { name: "Off" });

    expect(on.className).not.toBe(off.className);
    expect(on).toHaveClass("bg-accent");
    expect(off).toHaveClass("bg-ink/5");
  });

  it("fires its click handler", () => {
    const onClick = vi.fn();
    render(<Chip onClick={onClick}>Painting</Chip>);
    fireEvent.click(screen.getByRole("button", { name: "Painting" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  // The 5.9 size variant: Saved's filter chips are the same pill, smaller — and deliberately
  // without the onboarding pop on select (see the component's header comment).
  it("renders the small variant's sizing classes", () => {
    render(<Chip size="sm">Articles</Chip>);
    const chip = screen.getByRole("button", { name: "Articles" });
    expect(chip).toHaveClass("px-[15px]", "py-2", "text-[12.5px]");
  });

  it("reports pressed state on a selected small chip without playing the pop", () => {
    render(
      <Chip size="sm" selected>
        Art
      </Chip>,
    );
    render(<Chip selected>Onboarding</Chip>);

    const sm = screen.getByRole("button", { name: "Art" });
    expect(sm).toHaveAttribute("aria-pressed", "true");
    expect(sm).not.toHaveClass("animate-chip-pop");
    // The default size keeps it — proof the suppression is the variant's, not a regression.
    expect(screen.getByRole("button", { name: "Onboarding" })).toHaveClass(
      "animate-chip-pop",
    );
  });

  // Replaced the old serif-variant test in Phase 5.4: the `serif` prop is gone (the redesign has
  // one typeface), so the meaningful thing left to assert about the toggle is that it reports its
  // state to assistive tech, which the onboarding grid depends on.
  it("reports its toggle state via aria-pressed", () => {
    render(<Chip selected>On</Chip>);
    render(<Chip>Off</Chip>);

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
