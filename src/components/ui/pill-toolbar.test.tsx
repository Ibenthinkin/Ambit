// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PillToolbar } from "./pill-toolbar";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

function renderPill(
  props: Partial<React.ComponentProps<typeof PillToolbar>> = {},
) {
  return render(
    <PillToolbar onBookmark={vi.fn()} onShare={vi.fn()} {...props} />,
  );
}

describe("PillToolbar", () => {
  it("renders the four controls", () => {
    renderPill();
    for (const label of ["Profile", "Feed", "Save to collection", "Share"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  // The feed's shape (5.6): three controls, because share has no referent without a current item.
  it("omits share entirely when no handler is given", () => {
    render(<PillToolbar onBookmark={vi.fn()} />);
    expect(
      screen.queryByRole("button", { name: "Share" }),
    ).not.toBeInTheDocument();
    for (const label of ["Profile", "Feed", "Save to collection"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("fires onBookmark and onShare", () => {
    const onBookmark = vi.fn();
    const onShare = vi.fn();
    renderPill({ onBookmark, onShare });

    fireEvent.click(screen.getByRole("button", { name: "Save to collection" }));
    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    expect(onBookmark).toHaveBeenCalledOnce();
    expect(onShare).toHaveBeenCalledOnce();
  });

  it("navigates to /profile and /feed by default", () => {
    push.mockClear();
    renderPill();
    fireEvent.click(screen.getByRole("button", { name: "Profile" }));
    expect(push).toHaveBeenCalledWith("/profile");
    fireEvent.click(screen.getByRole("button", { name: "Feed" }));
    expect(push).toHaveBeenCalledWith("/feed");
  });

  it("lets a caller override the navigation targets", () => {
    const onHome = vi.fn();
    renderPill({ onHome });
    fireEvent.click(screen.getByRole("button", { name: "Feed" }));
    expect(onHome).toHaveBeenCalledOnce();
  });

  // The three bookmark states have to be visually distinct or the pill can't tell you whether the
  // thing you're looking at is already saved — which is the only state it communicates.
  it("renders the three bookmark states distinctly", () => {
    const svgOf = (container: HTMLElement) =>
      container.querySelector('[aria-label="Save to collection"] svg')!;

    const idle = svgOf(renderPill({ bookmark: "idle" }).container);
    const saved = svgOf(renderPill({ bookmark: "saved" }).container);
    const onSaved = svgOf(renderPill({ bookmark: "on-saved" }).container);

    expect(idle.querySelector("path")).toHaveAttribute("fill", "none");
    expect(saved.querySelector("path")).toHaveAttribute("fill", "currentColor");
    expect(onSaved.querySelector("path")).toHaveAttribute(
      "fill",
      "currentColor",
    );
    // Filled-accent (an item you saved) vs filled-white (you're on the Saved screen).
    expect(saved).toHaveClass("text-accent");
    expect(onSaved).toHaveClass("text-white");
  });

  // Regression guard for the mistake this component is most likely to acquire in a refactor: the
  // wrapper spans the full width, so if it ever takes pointer events it silently eats every scroll
  // gesture that starts near the bottom of the screen.
  it("keeps the full-width wrapper transparent to pointer events", () => {
    const { container } = renderPill();
    const wrapper = container.firstElementChild!;
    expect(wrapper).toHaveClass("pointer-events-none");
    expect(wrapper.querySelector("nav")).toHaveClass("pointer-events-auto");
  });

  it("renders a page-specific extra action in the same row", () => {
    renderPill({ extra: <button type="button">Closer look</button> });
    const nav = screen.getByRole("navigation");
    expect(
      screen.getByRole("button", { name: "Closer look" }).parentElement,
    ).toBe(nav);
  });
});
