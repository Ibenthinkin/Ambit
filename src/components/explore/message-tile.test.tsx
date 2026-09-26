// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EXPLORE_BLOCKS } from "~/config/explore";
import { MessageTile } from "./message-tile";

describe("MessageTile", () => {
  it("says its block's copy", () => {
    render(<MessageTile message="about" onAction={vi.fn()} />);
    expect(screen.getByText(EXPLORE_BLOCKS.about.title)).toBeInTheDocument();
    expect(screen.getByText(EXPLORE_BLOCKS.about.body)).toBeInTheDocument();
  });

  it.each(["about", "signup", "signin"] as const)(
    "the %s block's one button asks for %s",
    (message) => {
      const onAction = vi.fn();
      render(<MessageTile message={message} onAction={onAction} />);
      const buttons = screen.getAllByRole("button");
      expect(buttons).toHaveLength(1);
      fireEvent.click(buttons[0]!);
      expect(onAction).toHaveBeenCalledWith(message);
    },
  );

  it("the end card offers all three, sign up first", () => {
    const onAction = vi.fn();
    render(<MessageTile message="end" onAction={onAction} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual([
      "Sign up",
      "Sign in",
      "What is this?",
    ]);
    buttons.forEach((b) => fireEvent.click(b));
    expect(onAction.mock.calls.map((c) => c[0] as string)).toEqual([
      "signup",
      "signin",
      "about",
    ]);
  });
});
