// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./button";

// DESIGN §4.1: three variants (primary / outline / link), three sizes, no `shape`. These tests
// pin the class strings that carry each state, since hover/pressed can't be forced in jsdom.
describe("Button", () => {
  it("blocks the click handler when disabled", () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Start exploring
      </Button>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Start exploring" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("fires the click handler when enabled", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Start exploring</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Start exploring" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("is primary at md by default: bright fill, dark text, square, green hover underline", () => {
    render(<Button>Go</Button>);
    const el = screen.getByRole("button", { name: "Go" });
    expect(el).toHaveClass("bg-ink", "text-on-accent", "h-[46px]");
    expect(el).toHaveClass("hover:bg-white", "active:bg-[#E6E6E6]");
    expect(el.className).toContain(
      "hover:shadow-[inset_0_-2px_0_var(--color-accent)]",
    );
    expect(el.className).not.toMatch(/rounded/);
    expect(el).toHaveClass("duration-150");
  });

  it("dims a disabled primary and drops its hover", () => {
    render(<Button disabled>Go</Button>);
    const el = screen.getByRole("button", { name: "Go" });
    expect(el).toHaveClass("bg-white/12", "text-ink/34");
    expect(el).not.toHaveClass("bg-ink");
    expect(el.className).not.toContain("hover:");
  });

  it("draws the outline variant with a 1px ink/35 border and a dimmer disabled one", () => {
    render(
      <>
        <Button variant="outline">Out</Button>
        <Button variant="outline" disabled>
          Off
        </Button>
      </>,
    );
    const rest = screen.getByRole("button", { name: "Out" });
    expect(rest).toHaveClass("border", "border-ink/35", "text-ink");
    expect(rest).toHaveClass("hover:bg-white/8", "hover:border-ink");
    const off = screen.getByRole("button", { name: "Off" });
    expect(off).toHaveClass("border-ink/16", "text-ink/34");
    expect(off.className).not.toContain("hover:");
  });

  it("renders the link variant with no box: underline, no fill, no border, no fixed height", () => {
    render(<Button variant="link">More</Button>);
    const el = screen.getByRole("button", { name: "More" });
    expect(el).toHaveClass(
      "underline",
      "underline-offset-[3px]",
      "text-ink/78",
    );
    expect(el).toHaveClass("hover:text-white", "hover:decoration-accent");
    expect(el.className).not.toMatch(/(^|\s)(bg-|border(\s|$)|h-)/);
  });

  it("draws a disabled link with no underline", () => {
    render(
      <Button variant="link" disabled>
        More
      </Button>,
    );
    const el = screen.getByRole("button", { name: "More" });
    expect(el).toHaveClass("text-ink/34");
    expect(el).not.toHaveClass("underline");
  });

  it("sizes: lg is 56px/17px, md 46px/15px, sm is 14px with 6x14 padding", () => {
    render(
      <>
        <Button size="lg">L</Button>
        <Button size="md">M</Button>
        <Button size="sm">S</Button>
      </>,
    );
    expect(screen.getByRole("button", { name: "L" })).toHaveClass(
      "h-14",
      "text-[17px]",
    );
    expect(screen.getByRole("button", { name: "M" })).toHaveClass(
      "h-[46px]",
      "text-[15px]",
    );
    const sm = screen.getByRole("button", { name: "S" });
    expect(sm).toHaveClass("text-[14px]", "px-[14px]", "py-1.5");
    expect(sm.className).not.toMatch(/\bh-/);
  });

  it("keeps weight 400 (only 400 and 500 are loaded)", () => {
    render(<Button>W</Button>);
    expect(screen.getByRole("button", { name: "W" })).toHaveClass(
      "font-normal",
    );
  });

  it("lets a caller-supplied className survive the cn() merge", () => {
    render(<Button className="mt-6">Continue</Button>);
    expect(screen.getByRole("button", { name: "Continue" })).toHaveClass(
      "mt-6",
    );
  });
});
