// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SpreadToggle } from "./spread-toggle";

describe("SpreadToggle", () => {
  it("is a pressed-state button that says what it does, and flips on click", () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <SpreadToggle spread={false} onToggle={onToggle} />,
    );
    const button = screen.getByRole("button", {
      name: "Magazine view",
    });
    expect(button).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(<SpreadToggle spread onToggle={onToggle} />);
    expect(button).toHaveAttribute("aria-pressed", "true");
  });
});
