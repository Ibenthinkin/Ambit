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

  // Ben's reviews (09-11-26, 09-12-26): the bar holds the same three controls as the phone's pill
  // — Profile, Feed, Save — and only Share floats, as a detached disc below it, because Share is
  // the one control that is not on every screen. The stack is the fixed, fading element; the bar
  // and the disc are its children, top to bottom.
  it("keeps Profile, Feed and Save in the bar and floats only Share as a disc below it", () => {
    render(<RailToolbar onBookmark={vi.fn()} onShare={vi.fn()} />);
    const stack = screen.getByTestId("rail-toolbar");
    const nav = screen.getByRole("navigation", { name: "Ambit toolbar" });
    expect(stack).toContainElement(nav);
    expect(stack).toHaveClass("flex-col", "fixed");
    expect(labels(nav)).toEqual(["Profile", "Feed", "Save to collection"]);
    expect(labels(stack)).toEqual([
      "Profile",
      "Feed",
      "Save to collection",
      "Share",
    ]);
    const disc = screen.getByRole("button", { name: "Share" });
    expect(nav).not.toContainElement(disc);
    expect(disc.parentElement).toBe(stack);
    expect(disc).toHaveClass("rounded-full");
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
