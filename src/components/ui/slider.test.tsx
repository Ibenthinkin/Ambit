// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Slider } from "./slider";

describe("Slider", () => {
  it("shows the live value while dragging and commits once on release", () => {
    const onCommit = vi.fn();
    render(
      <Slider
        label="Drift temperature"
        value={0.15}
        min={0.03}
        max={0.6}
        step={0.01}
        onCommit={onCommit}
      />,
    );
    const input = screen.getByRole("slider", { name: "Drift temperature" });
    fireEvent.change(input, { target: { value: "0.3" } });
    expect(screen.getByText("0.30")).toBeInTheDocument(); // live, two decimals for a sub-1 step
    expect(onCommit).not.toHaveBeenCalled(); // dragging is not applying
    fireEvent.pointerUp(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(0.3);
  });

  it("does not commit when released at the value it started on", () => {
    const onCommit = vi.fn();
    render(
      <Slider
        label="Page size"
        value={12}
        min={6}
        max={24}
        step={1}
        onCommit={onCommit}
      />,
    );
    fireEvent.pointerUp(screen.getByRole("slider", { name: "Page size" }));
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByText("12")).toBeInTheDocument(); // integer step, no decimals
  });

  it("commits on keyboard release too", () => {
    const onCommit = vi.fn();
    render(
      <Slider
        label="Topic cap"
        value={3}
        min={1}
        max={8}
        step={1}
        onCommit={onCommit}
      />,
    );
    const input = screen.getByRole("slider", { name: "Topic cap" });
    fireEvent.change(input, { target: { value: "4" } });
    fireEvent.keyUp(input, { key: "ArrowRight" });
    expect(onCommit).toHaveBeenCalledWith(4);
  });
});
