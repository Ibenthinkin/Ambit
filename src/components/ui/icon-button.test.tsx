// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { IconButton } from "./icon-button";

// DESIGN §4.6: the icon button goes square. Plain sits on the page; glass sits on a photograph
// and needs the stronger border.
describe("IconButton", () => {
  it("is square, not round", () => {
    render(<IconButton aria-label="Close">x</IconButton>);
    expect(screen.getByRole("button").className).not.toContain("rounded");
  });

  it("is sized by the size prop in both dimensions", () => {
    render(
      <IconButton size={42} aria-label="Share">
        x
      </IconButton>,
    );
    const el = screen.getByRole("button");
    expect(el.style.width).toBe("42px");
    expect(el.style.height).toBe("42px");
  });

  it("plain uses the quiet fill and border; glass the stronger border", () => {
    const { rerender } = render(<IconButton aria-label="a">x</IconButton>);
    expect(screen.getByRole("button")).toHaveClass("bg-ink/5", "border-ink/12");
    rerender(
      <IconButton glass aria-label="a">
        x
      </IconButton>,
    );
    expect(screen.getByRole("button")).toHaveClass("bg-ink/9", "border-ink/16");
  });

  it("is a button that does not submit, and brightens on hover", () => {
    render(<IconButton aria-label="a">x</IconButton>);
    const el = screen.getByRole("button");
    expect(el).toHaveAttribute("type", "button");
    expect(el.className).toContain("hover:text-ink");
  });
});
