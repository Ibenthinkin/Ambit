// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Segmented } from "./segmented";

const options = [
  { key: "all", label: "All" },
  { key: "reading", label: "Reading · 3" },
] as const;

describe("Segmented", () => {
  it("renders one control per option", () => {
    render(<Segmented options={[...options]} value="all" onChange={vi.fn()} />);
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("calls onChange with the clicked option's key", () => {
    const onChange = vi.fn();
    render(
      <Segmented options={[...options]} value="all" onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Reading · 3" }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("reading");
  });

  it("does not re-fire onChange for the already-active option", () => {
    const onChange = vi.fn();
    render(
      <Segmented options={[...options]} value="all" onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
