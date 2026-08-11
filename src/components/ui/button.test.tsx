// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./button";

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

  it("produces distinct class strings across variant/size/shape", () => {
    render(<Button variant="accent">Accent</Button>);
    render(<Button variant="ghost">Ghost</Button>);
    render(
      <Button size="sm" shape="rounded">
        Small rounded
      </Button>,
    );
    render(
      <Button size="lg" shape="pill">
        Large pill
      </Button>,
    );

    const accent = screen.getByRole("button", { name: "Accent" }).className;
    const ghost = screen.getByRole("button", { name: "Ghost" }).className;
    const smallRounded = screen.getByRole("button", {
      name: "Small rounded",
    }).className;
    const largePill = screen.getByRole("button", {
      name: "Large pill",
    }).className;

    expect(accent).not.toBe(ghost);
    expect(smallRounded).not.toBe(largePill);
    expect(smallRounded).toContain("rounded-input");
    expect(largePill).toContain("rounded-pill");
  });

  it("lets a caller-supplied className survive the cn() merge", () => {
    render(<Button className="mt-6">Continue</Button>);
    expect(screen.getByRole("button", { name: "Continue" })).toHaveClass(
      "mt-6",
    );
  });
});
