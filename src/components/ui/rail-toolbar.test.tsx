// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RailToolbar } from "./rail-toolbar";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

describe("RailToolbar", () => {
  it("stacks the four controls top to bottom, Share last", () => {
    render(<RailToolbar onBookmark={vi.fn()} onShare={vi.fn()} />);
    const nav = screen.getByRole("navigation", { name: "Ambit toolbar" });
    expect(nav).toHaveAttribute("data-testid", "rail-toolbar");
    expect(nav).toHaveClass("flex-col", "fixed");
    expect(
      screen.getAllByRole("button").map((b) => b.getAttribute("aria-label")),
    ).toEqual(["Profile", "Feed", "Save to collection", "Share"]);
  });

  it("omits Share without a handler, like the pill", () => {
    render(<RailToolbar onBookmark={vi.fn()} />);
    expect(
      screen.queryByRole("button", { name: "Share" }),
    ).not.toBeInTheDocument();
  });

  // Decision 3: on the item screen the rail fades with the chrome. Hidden means hidden — the
  // `visibility` trick from hero-rail.tsx, so an invisible rail cannot be clicked.
  it("visible={false} hides it from pointers and assistive tech, with the fade transition", () => {
    render(<RailToolbar onBookmark={vi.fn()} visible={false} />);
    const nav = screen.getByTestId("rail-toolbar");
    expect(nav).toHaveAttribute("aria-hidden", "true");
    expect(nav.style.visibility).toBe("hidden");
    expect(nav.style.opacity).toBe("0");
    expect(nav.style.transition).toContain("visibility");
  });

  it("navigates like the pill by default, and hands rects to the handlers", () => {
    push.mockClear();
    const onBookmark = vi.fn();
    render(<RailToolbar onBookmark={onBookmark} />);
    fireEvent.click(screen.getByRole("button", { name: "Feed" }));
    expect(push).toHaveBeenCalledWith("/feed");
    fireEvent.click(screen.getByRole("button", { name: "Save to collection" }));
    expect(onBookmark.mock.calls[0]![0]).toHaveProperty("width");
  });
});
