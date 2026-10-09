// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TileVeil } from "./tile-veil";

describe("TileVeil — a Less veils the tile in place", () => {
  it("covers the tile absolutely, so the masonry never moves", () => {
    render(<TileVeil onUndo={vi.fn()} />);
    const veil = screen.getByTestId("tile-veil");
    expect(veil).toHaveClass("absolute", "inset-0", "bg-bg/82");
    expect(screen.getByText("Less of this")).toHaveClass(
      "font-mono",
      "text-[11px]",
      "text-ink/78",
    );
  });

  it("offers [Undo..] as a button named Undo, which calls onUndo", () => {
    const onUndo = vi.fn();
    render(<TileVeil onUndo={onUndo} />);
    const undo = screen.getByRole("button", { name: "Undo" });
    expect(undo).toHaveTextContent("[Undo..]");
    fireEvent.click(undo);
    expect(onUndo).toHaveBeenCalledOnce();
  });

  it("stops a pointer-down, so a press on the veil never reaches the tile", () => {
    const parent = vi.fn();
    render(
      <div onPointerDown={parent}>
        <TileVeil onUndo={vi.fn()} />
      </div>,
    );
    fireEvent.pointerDown(screen.getByTestId("tile-veil"));
    expect(parent).not.toHaveBeenCalled();
  });
});
