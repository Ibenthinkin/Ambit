// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RailToolbar } from "./rail-toolbar";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

describe("RailToolbar", () => {
  const labels = (root: HTMLElement) =>
    within(root)
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label"));

  // Ben's review (09-11-26): "the save button does not float separately on the desktop". Profile
  // and Feed stay in the bar; Save and Share are detached discs below it — the desktop twin of the
  // phone's detached Share. The stack is the fixed, fading element; the bar and the discs are its
  // children, top to bottom.
  it("keeps Profile and Feed in the bar and floats Save and Share as discs below it", () => {
    render(<RailToolbar onBookmark={vi.fn()} onShare={vi.fn()} />);
    const stack = screen.getByTestId("rail-toolbar");
    const nav = screen.getByRole("navigation", { name: "Ambit toolbar" });
    expect(stack).toContainElement(nav);
    expect(stack).toHaveClass("flex-col", "fixed");
    expect(labels(nav)).toEqual(["Profile", "Feed"]);
    expect(labels(stack)).toEqual([
      "Profile",
      "Feed",
      "Save to collection",
      "Share",
    ]);
    for (const name of ["Save to collection", "Share"]) {
      const disc = screen.getByRole("button", { name });
      expect(nav).not.toContainElement(disc);
      expect(disc.parentElement).toBe(stack);
      expect(disc).toHaveClass("rounded-full");
    }
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
