// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BottomSheet } from "./bottom-sheet";

describe("BottomSheet", () => {
  it("renders nothing when it has never been opened", () => {
    render(
      <BottomSheet open={false} onClose={vi.fn()}>
        <p>Details</p>
      </BottomSheet>,
    );
    expect(screen.queryByText("Details")).not.toBeInTheDocument();
  });

  it("renders its children when open", () => {
    render(
      <BottomSheet open onClose={vi.fn()}>
        <p>Details</p>
      </BottomSheet>,
    );
    expect(screen.getByText("Details")).toBeInTheDocument();
  });

  it("renders a centered title when given one", () => {
    render(
      <BottomSheet open onClose={vi.fn()} title="Save to collection">
        <p>Details</p>
      </BottomSheet>,
    );
    expect(
      screen.getByRole("heading", { name: "Save to collection" }),
    ).toBeInTheDocument();
  });

  it("calls onClose when the scrim is clicked", () => {
    const onClose = vi.fn();
    render(
      <BottomSheet open onClose={onClose}>
        <p>Details</p>
      </BottomSheet>,
    );
    fireEvent.click(screen.getByTestId("bottom-sheet-scrim"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose on Escape", () => {
    const onClose = vi.fn();
    render(
      <BottomSheet open onClose={onClose}>
        <p>Details</p>
      </BottomSheet>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("ignores Escape once closed", () => {
    const onClose = vi.fn();
    render(
      <BottomSheet open={false} onClose={onClose}>
        <p>Details</p>
      </BottomSheet>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  // The shell is the base for four sheets, so its modal semantics are four screens' worth of
  // accessibility in one place. Escape always worked; this is the entry half.
  describe("dialog semantics and focus", () => {
    it("is a labelled modal dialog", () => {
      render(
        <BottomSheet open onClose={vi.fn()} title="Save to collection">
          <button type="button">Articles</button>
        </BottomSheet>,
      );
      const dialog = screen.getByRole("dialog", {
        name: "Save to collection",
      });
      expect(dialog).toHaveAttribute("aria-modal", "true");
    });

    it("moves focus to the panel so the title is announced", () => {
      render(
        <BottomSheet open onClose={vi.fn()} title="Share">
          <button type="button">Copy link</button>
        </BottomSheet>,
      );
      // The panel, not its first control: focusing a row would skip past the sheet's own title.
      expect(document.activeElement).toBe(
        screen.getByTestId("bottom-sheet-panel"),
      );
    });

    it("returns focus to whatever opened it", () => {
      render(<button type="button">Open sheet</button>);
      const opener = screen.getByRole("button", { name: "Open sheet" });
      opener.focus();

      const { rerender } = render(
        <BottomSheet open onClose={vi.fn()} title="Share">
          <button type="button">Copy link</button>
        </BottomSheet>,
      );
      expect(document.activeElement).not.toBe(opener);

      rerender(
        <BottomSheet open={false} onClose={vi.fn()} title="Share">
          <button type="button">Copy link</button>
        </BottomSheet>,
      );
      // Without this, dismissing a sheet dumps a keyboard user at the top of the document.
      expect(document.activeElement).toBe(opener);
    });

    it("keeps Tab inside the sheet", () => {
      render(
        <BottomSheet open onClose={vi.fn()} title="Save to collection">
          <button type="button">Articles</button>
          <button type="button">Art</button>
        </BottomSheet>,
      );
      const first = screen.getByRole("button", { name: "Articles" });
      const last = screen.getByRole("button", { name: "Art" });

      // From the panel, Tab lands on the first control...
      fireEvent.keyDown(document, { key: "Tab" });
      expect(document.activeElement).toBe(first);

      // ...and from the last, it wraps rather than escaping into the page behind the scrim.
      last.focus();
      fireEvent.keyDown(document, { key: "Tab" });
      expect(document.activeElement).toBe(first);

      // Shift+Tab off the first wraps backwards to the last.
      first.focus();
      fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
      expect(document.activeElement).toBe(last);
    });
  });

  // Phase 5.5's exit animation. The old "renders nothing when closed" assertion covered both
  // "never opened" and "just closed"; those are now different, and this block is the difference.
  describe("exit animation", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("keeps children mounted while animating out, then unmounts them", () => {
      const { rerender } = render(
        <BottomSheet open onClose={vi.fn()}>
          <p>Details</p>
        </BottomSheet>,
      );
      expect(screen.getByText("Details")).toBeInTheDocument();

      rerender(
        <BottomSheet open={false} onClose={vi.fn()}>
          <p>Details</p>
        </BottomSheet>,
      );
      // Still on screen — this is the whole point of the change.
      expect(screen.getByText("Details")).toBeInTheDocument();
      expect(screen.getByTestId("bottom-sheet-panel")).toHaveClass(
        "animate-sheet-down",
      );

      act(() => void vi.runAllTimers());
      expect(screen.queryByText("Details")).not.toBeInTheDocument();
    });

    it("unmounts on animationend without waiting for the fallback timer", () => {
      const { rerender } = render(
        <BottomSheet open onClose={vi.fn()}>
          <p>Details</p>
        </BottomSheet>,
      );
      rerender(
        <BottomSheet open={false} onClose={vi.fn()}>
          <p>Details</p>
        </BottomSheet>,
      );

      // A raw `dispatchEvent`, not `fireEvent.animationEnd`: jsdom implements no `AnimationEvent`
      // at all, so React never delivers a synthetic `onAnimationEnd` here — which is exactly why
      // the component listens natively instead. This dispatch is what a browser really sends.
      act(() => {
        screen
          .getByTestId("bottom-sheet-panel")
          .dispatchEvent(new Event("animationend", { bubbles: true }));
      });
      expect(screen.queryByText("Details")).not.toBeInTheDocument();
    });

    it("ignores a child's animationend while leaving", () => {
      const { rerender } = render(
        <BottomSheet open onClose={vi.fn()}>
          <p data-testid="sheet-child">Details</p>
        </BottomSheet>,
      );
      rerender(
        <BottomSheet open={false} onClose={vi.fn()}>
          <p data-testid="sheet-child">Details</p>
        </BottomSheet>,
      );

      act(() => {
        screen
          .getByTestId("sheet-child")
          .dispatchEvent(new Event("animationend", { bubbles: true }));
      });
      // A child animation finishing must not tear the sheet down mid-exit.
      expect(screen.getByText("Details")).toBeInTheDocument();
    });

    it("stops swallowing taps while it animates out", () => {
      const { rerender } = render(
        <BottomSheet open onClose={vi.fn()}>
          <p>Details</p>
        </BottomSheet>,
      );
      rerender(
        <BottomSheet open={false} onClose={vi.fn()}>
          <p>Details</p>
        </BottomSheet>,
      );
      // Without this, the scrim of a closing sheet eats whatever the user taps next.
      expect(
        screen.getByTestId("bottom-sheet-scrim").parentElement,
      ).toHaveClass("pointer-events-none");
    });

    it("skips the exit entirely under prefers-reduced-motion", () => {
      // globals.css already collapses every animation to 0.01ms under this query, so animating out
      // would just leave the sheet sitting there invisible and inert for the fallback timer.
      vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
      const { rerender } = render(
        <BottomSheet open onClose={vi.fn()}>
          <p>Details</p>
        </BottomSheet>,
      );
      rerender(
        <BottomSheet open={false} onClose={vi.fn()}>
          <p>Details</p>
        </BottomSheet>,
      );

      // Gone already — no timers advanced.
      expect(screen.queryByText("Details")).not.toBeInTheDocument();
      vi.unstubAllGlobals();
    });

    it("reopening mid-exit cancels the exit", () => {
      const { rerender } = render(
        <BottomSheet open onClose={vi.fn()}>
          <p>Details</p>
        </BottomSheet>,
      );
      rerender(
        <BottomSheet open={false} onClose={vi.fn()}>
          <p>Details</p>
        </BottomSheet>,
      );
      rerender(
        <BottomSheet open onClose={vi.fn()}>
          <p>Details</p>
        </BottomSheet>,
      );

      act(() => void vi.runAllTimers());
      // The stale unmount timer from the aborted close must not fire into the reopened sheet.
      expect(screen.getByText("Details")).toBeInTheDocument();
      expect(screen.getByTestId("bottom-sheet-panel")).toHaveClass(
        "animate-sheet-up",
      );
    });
  });
});
