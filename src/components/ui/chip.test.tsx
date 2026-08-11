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

  it("switches font class with the serif variant", () => {
    render(<Chip serif>Serif</Chip>);
    render(<Chip serif={false}>Sans</Chip>);

    expect(screen.getByRole("button", { name: "Serif" })).toHaveClass(
      "font-serif",
    );
    expect(screen.getByRole("button", { name: "Sans" })).toHaveClass(
      "font-sans",
    );
  });
});
