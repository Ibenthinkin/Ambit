// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DESKTOP_QUERY } from "~/hooks/use-media-query";
import { stubMatchMedia } from "~/test/match-media";
import { BottomSheet, POPOVER_W, popoverStyle } from "./bottom-sheet";

/**
 * The drag's velocity test reads the wall clock (see `bottom-sheet.tsx`'s note on why it can't read
 * the event's own timestamp through a React synthetic handler), so the gap between a move and its
 * release is controlled by advancing vitest's fake clock — which mocks `Date.now()`.
 *
 * Every drag test runs under fake timers for that reason. `pause` is how a test says "the finger
 * rested here for a while" without waiting.
 */
const pause = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

/** Comfortably outside the 300ms flick window, so only the distance threshold can close. */
const SLOW = 800;

const send = (
  panel: HTMLElement,
  type: "pointerDown" | "pointerMove" | "pointerUp",
  init: Record<string, unknown>,
) => fireEvent[type](panel, { pointerId: 1, ...init });

const grab = (panel: HTMLElement, y = 10) =>
  send(panel, "pointerDown", { button: 0, clientX: 0, clientY: y });

/**
 * jsdom reports `scrollTop` as 0 for everything, which reads as "this sheet is at its top" —
 * the state in which a downward drag anywhere on the panel dismisses it. Faking a scrolled
 * panel is how the grab-zone rule gets tested at all.
 */
const scrollDownTo = (panel: HTMLElement, top: number) =>
  Object.defineProperty(panel, "scrollTop", {
    value: top,
    configurable: true,
  });

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

    // Regression guard. Every call site passes a fresh inline `onClose` arrow, so listing it as an
    // effect dependency made the focus effect tear down and rebuild on every parent render. Two
    // consequences, both of which defeat the feature this block exists for.
    it("does not steal focus back when the parent re-renders", () => {
      const { rerender } = render(
        <BottomSheet open onClose={() => undefined} title="Save to collection">
          <button type="button">Articles</button>
          <button type="button">Art</button>
        </BottomSheet>,
      );
      const art = screen.getByRole("button", { name: "Art" });
      art.focus();
      expect(document.activeElement).toBe(art);

      // A new inline arrow, exactly as a parent state or query update produces.
      rerender(
        <BottomSheet open onClose={() => undefined} title="Save to collection">
          <button type="button">Articles</button>
          <button type="button">Art</button>
        </BottomSheet>,
      );

      // Focus must stay where the user put it.
      expect(document.activeElement).toBe(art);
    });

    it("still restores focus outward after a parent re-render", () => {
      render(<button type="button">Open sheet</button>);
      const opener = screen.getByRole("button", { name: "Open sheet" });
      opener.focus();

      const { rerender } = render(
        <BottomSheet open onClose={() => undefined} title="Share">
          <button type="button">Copy link</button>
        </BottomSheet>,
      );
      // A re-render mid-open used to re-record the restore target as a control *inside* the sheet,
      // so closing "restored" focus to a node that was about to be unmounted.
      rerender(
        <BottomSheet open onClose={() => undefined} title="Share">
          <button type="button">Copy link</button>
        </BottomSheet>,
      );
      rerender(
        <BottomSheet open={false} onClose={() => undefined} title="Share">
          <button type="button">Copy link</button>
        </BottomSheet>,
      );

      expect(document.activeElement).toBe(opener);
    });

    // Safari blurs to <body> when you tap non-focusable sheet content (title, grabber, padding)
    // rather than focusing the tabindex="-1" ancestor. From body, an unguarded Tab goes to the
    // first focusable in *document* order — straight into the page behind the scrim.
    it("pulls focus back in when it has escaped the panel entirely", () => {
      render(<button type="button">Behind the scrim</button>);
      render(
        <BottomSheet open onClose={vi.fn()} title="Save to collection">
          <button type="button">Articles</button>
          <button type="button">Art</button>
        </BottomSheet>,
      );

      (document.activeElement as HTMLElement | null)?.blur();
      expect(document.activeElement).toBe(document.body);

      fireEvent.keyDown(document, { key: "Tab" });
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Articles" }),
      );
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
      stubMatchMedia(["(prefers-reduced-motion: reduce)"]);
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
  // ── 5.8: the gallery variant and its gestures ─────────────────────────────────────────────────
  // Everything above this line is the pill sheet, unchanged and untouched by the additions below —
  // which is the actual proof that they're additive.
  describe("gallery variant", () => {
    it("swaps in the gallery animation pair, and back out again on close", () => {
      vi.useFakeTimers();
      const { rerender } = render(
        <BottomSheet open onClose={vi.fn()} variant="gallery">
          <p>Details</p>
        </BottomSheet>,
      );
      const panel = screen.getByTestId("bottom-sheet-panel");
      expect(panel).toHaveClass("animate-sheet-gallery");
      expect(panel).toHaveClass("rounded-t-[26px]");

      rerender(
        <BottomSheet open={false} onClose={vi.fn()} variant="gallery">
          <p>Details</p>
        </BottomSheet>,
      );
      expect(screen.getByTestId("bottom-sheet-panel")).toHaveClass(
        "animate-sheet-gallery-out",
      );
      act(() => void vi.runAllTimers());
      vi.useRealTimers();
    });

    it("leaves the pill variant on its own animations", () => {
      render(
        <BottomSheet open onClose={vi.fn()}>
          <p>Details</p>
        </BottomSheet>,
      );
      const panel = screen.getByTestId("bottom-sheet-panel");
      expect(panel).toHaveClass("animate-sheet-up");
      expect(panel).not.toHaveClass("animate-sheet-gallery");
    });
  });

  describe("drag to close", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    /**
     * jsdom has no layout engine, so `getBoundingClientRect()` is all zeroes — which happens to be
     * exactly what the grab-zone check wants (a `clientY` of 10 reads as 10px below the panel's
     * top). Stated rather than relied on silently.
     */
    it("follows the finger downward, and only downward", () => {
      const onClose = vi.fn();
      render(
        <BottomSheet open onClose={onClose} variant="gallery" dragToClose>
          <p>Details</p>
        </BottomSheet>,
      );
      const panel = screen.getByTestId("bottom-sheet-panel");

      grab(panel);
      send(panel, "pointerMove", { clientX: 0, clientY: 50 });
      expect(panel.style.transform).toBe("translateY(40px)");

      // Dragging back up past the origin pins at rest rather than stretching the sheet taller.
      send(panel, "pointerMove", { clientX: 0, clientY: -40 });
      expect(panel.style.transform).toBe("translateY(0px)");
    });

    it("closes past the threshold", () => {
      const onClose = vi.fn();
      render(
        <BottomSheet open onClose={onClose} variant="gallery" dragToClose>
          <p>Details</p>
        </BottomSheet>,
      );
      const panel = screen.getByTestId("bottom-sheet-panel");

      grab(panel);
      send(panel, "pointerMove", { clientX: 0, clientY: 90 });
      pause(SLOW);
      send(panel, "pointerUp", { clientX: 0, clientY: 90 });

      expect(onClose).toHaveBeenCalledTimes(1);
      // Handed back to the CSS animations, so the exit runs instead of the inline transform.
      expect(panel.style.transform).toBe("");
      expect(panel.style.animation).toBe("");
    });

    it("snaps back when the drag was neither far enough nor fast enough", () => {
      const onClose = vi.fn();
      render(
        <BottomSheet open onClose={onClose} variant="gallery" dragToClose>
          <p>Details</p>
        </BottomSheet>,
      );
      const panel = screen.getByTestId("bottom-sheet-panel");

      grab(panel);
      send(panel, "pointerMove", { clientX: 0, clientY: 40 });
      pause(SLOW);
      send(panel, "pointerUp", { clientX: 0, clientY: 40 });

      expect(onClose).not.toHaveBeenCalled();
      expect(panel.style.transform).toBe("");
      expect(panel.style.transition).toContain("transform");
    });

    // "The details sheet should close with a down swipe" — device pass, 08-21-26. It didn't,
    // because a swipe is a flick and the only test was a distance one.
    it("closes on a short, fast flick down", () => {
      const onClose = vi.fn();
      render(
        <BottomSheet open onClose={onClose} variant="gallery" dragToClose>
          <p>Details</p>
        </BottomSheet>,
      );
      const panel = screen.getByTestId("bottom-sheet-panel");

      grab(panel);
      send(panel, "pointerMove", { clientX: 0, clientY: 35 });
      pause(120);
      send(panel, "pointerUp", { clientX: 0, clientY: 35 });

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    // The other half of the same report: the drag used to arm only in the panel's top 64px, so a
    // swipe starting anywhere below that did nothing at all.
    it("arms from anywhere on a sheet that isn't scrolled", () => {
      const onClose = vi.fn();
      render(
        <BottomSheet open onClose={onClose} variant="gallery" dragToClose>
          <p>Details</p>
        </BottomSheet>,
      );
      const panel = screen.getByTestId("bottom-sheet-panel");

      grab(panel, 300); // deep into the body, far below the grabber
      send(panel, "pointerMove", { clientX: 0, clientY: 400 });
      expect(panel.style.transform).toBe("translateY(100px)");

      pause(SLOW);
      send(panel, "pointerUp", { clientX: 0, clientY: 400 });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("stays out of the way of a scroll already in progress", () => {
      const onClose = vi.fn();
      render(
        <BottomSheet open onClose={onClose} variant="gallery" dragToClose>
          <p>Details</p>
        </BottomSheet>,
      );
      const panel = screen.getByTestId("bottom-sheet-panel");
      scrollDownTo(panel, 120);

      // A scrolled sheet, pressed below the grabber: this drag is the reader scrolling back up,
      // and hijacking it into a dismissal would make long sheets unreadable.
      grab(panel, 200);
      send(panel, "pointerMove", { clientX: 0, clientY: 300 });
      expect(panel.style.transform).toBe("");

      pause(SLOW);
      send(panel, "pointerUp", { clientX: 0, clientY: 300 });
      expect(onClose).not.toHaveBeenCalled();
    });

    it("still arms from the grabber even when the sheet is scrolled", () => {
      const onClose = vi.fn();
      render(
        <BottomSheet open onClose={onClose} variant="gallery" dragToClose>
          <p>Details</p>
        </BottomSheet>,
      );
      const panel = screen.getByTestId("bottom-sheet-panel");
      scrollDownTo(panel, 120);

      grab(panel, 10);
      send(panel, "pointerMove", { clientX: 0, clientY: 110 });
      pause(SLOW);
      send(panel, "pointerUp", { clientX: 0, clientY: 110 });

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("attaches no pointer handlers at all when neither gesture prop is passed", () => {
      const onClose = vi.fn();
      render(
        <BottomSheet open onClose={onClose}>
          <p>Details</p>
        </BottomSheet>,
      );
      const panel = screen.getByTestId("bottom-sheet-panel");

      // The proof a pill sheet is untouched: the same event sequence that closes a gallery sheet
      // does nothing here.
      grab(panel);
      send(panel, "pointerMove", { clientX: 0, clientY: 200 });
      pause(SLOW);
      send(panel, "pointerUp", { clientX: 0, clientY: 200 });

      expect(onClose).not.toHaveBeenCalled();
      expect(panel.style.transform).toBe("");
    });
  });

  describe("side swipe", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    const swipe = (panel: HTMLElement, dx: number) => {
      grab(panel);
      send(panel, "pointerMove", { clientX: dx, clientY: 14 });
      pause(SLOW);
      send(panel, "pointerUp", { clientX: dx, clientY: 14 });
    };

    it("closes and reports 1 for a leftward swipe — 'next'", () => {
      const onClose = vi.fn();
      const onSwipeSide = vi.fn();
      render(
        <BottomSheet
          open
          onClose={onClose}
          variant="gallery"
          dragToClose
          onSwipeSide={onSwipeSide}
        >
          <p>Details</p>
        </BottomSheet>,
      );

      swipe(screen.getByTestId("bottom-sheet-panel"), -120);

      expect(onSwipeSide).toHaveBeenCalledWith(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("reports -1 for a rightward swipe", () => {
      const onClose = vi.fn();
      const onSwipeSide = vi.fn();
      render(
        <BottomSheet
          open
          onClose={onClose}
          variant="gallery"
          dragToClose
          onSwipeSide={onSwipeSide}
        >
          <p>Details</p>
        </BottomSheet>,
      );

      swipe(screen.getByTestId("bottom-sheet-panel"), 120);

      expect(onSwipeSide).toHaveBeenCalledWith(-1);
    });

    it("ignores travel under the threshold, and travel that was mostly vertical", () => {
      const onClose = vi.fn();
      const onSwipeSide = vi.fn();
      render(
        <BottomSheet
          open
          onClose={onClose}
          variant="gallery"
          dragToClose
          onSwipeSide={onSwipeSide}
        >
          <p>Details</p>
        </BottomSheet>,
      );
      const panel = screen.getByTestId("bottom-sheet-panel");

      swipe(panel, 20); // under SWIPE_SIDE_PX
      expect(onSwipeSide).not.toHaveBeenCalled();

      // Further down than across: a dismissal, not a cycle.
      grab(panel);
      send(panel, "pointerMove", { clientX: 60, clientY: 110 });
      pause(SLOW);
      send(panel, "pointerUp", { clientX: 60, clientY: 110 });
      expect(onSwipeSide).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalledTimes(1); // dy 100 > 56, so it closed
    });
  });
});

// The desktop pass (docs/DESIGN_desktop-polish.md §3). Same component, same API, same keyboard
// contract; above `md` the panel stops being anchored to an edge, so it stops sliding in from one.
describe("above md — a centered dialog", () => {
  beforeEach(() => stubMatchMedia([DESKTOP_QUERY]));
  afterEach(() => vi.unstubAllGlobals());

  it("is 520px, centered, rounded on every corner, and arrives by the dialog pair", () => {
    render(
      <BottomSheet open onClose={vi.fn()} title="Save to collection">
        <p>Rows</p>
      </BottomSheet>,
    );
    const panel = screen.getByTestId("bottom-sheet-panel");
    expect(panel).toHaveClass(
      "md:w-[520px]",
      "md:left-1/2",
      "md:top-1/2",
      "md:-translate-x-1/2",
      "md:-translate-y-1/2",
      "md:rounded-sheet",
      "animate-dialog-in",
    );
    expect(panel).not.toHaveClass("animate-sheet-up");
  });

  it("leaves by the dialog pair too, gallery variant included", () => {
    const { rerender } = render(
      <BottomSheet open onClose={vi.fn()} variant="gallery" dragToClose>
        <p>Details</p>
      </BottomSheet>,
    );
    rerender(
      <BottomSheet open={false} onClose={vi.fn()} variant="gallery" dragToClose>
        <p>Details</p>
      </BottomSheet>,
    );
    expect(screen.getByTestId("bottom-sheet-panel")).toHaveClass(
      "animate-dialog-out",
    );
  });

  it("hides the grabber and never arms a drag", () => {
    const onClose = vi.fn();
    render(
      <BottomSheet open onClose={onClose} dragToClose>
        <p>Details</p>
      </BottomSheet>,
    );
    const panel = screen.getByTestId("bottom-sheet-panel");
    expect(panel.querySelector(".md\\:hidden")).not.toBeNull();

    // The phone's close gesture: a slow drag past DRAG_CLOSE_PX. On desktop it must do nothing.
    grab(panel);
    send(panel, "pointerMove", { clientX: 0, clientY: 120 });
    send(panel, "pointerUp", { clientX: 0, clientY: 120 });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("below md — unchanged", () => {
  it("keeps the slide-up pair and the bottom anchoring", () => {
    stubMatchMedia([]);
    render(
      <BottomSheet open onClose={vi.fn()}>
        <p>Rows</p>
      </BottomSheet>,
    );
    const panel = screen.getByTestId("bottom-sheet-panel");
    expect(panel).toHaveClass("animate-sheet-up", "bottom-0", "inset-x-0");
    vi.unstubAllGlobals();
  });
});

// A rect the way a rail button reports one at 1440×900: 52px square, 26px from the right edge.
const RAIL_RECT = {
  left: 1362,
  top: 424,
  width: 52,
  height: 52,
  right: 1414,
  bottom: 476,
  x: 1362,
  y: 424,
  toJSON: () => ({}),
} as DOMRect;

describe("popoverStyle — docs/DESIGN_chrome-redesign.md §2", () => {
  it("left: floats 14px left of the anchor, centred on it, with a symmetric height clamp", () => {
    const s = popoverStyle(RAIL_RECT, "left", 1440, 900);
    expect(s.right).toBe(1440 - 1362 + 14);
    expect(s.top).toBe(450);
    // `translate`, not `transform`: the entrance keyframe animates `transform` and would
    // otherwise replace the centring (CLAUDE.md, the dialog that landed 260px off).
    expect(s.translate).toBe("0 -50%");
    expect(s.transform).toBeUndefined();
    expect(s.maxHeight).toBe(Math.min(900 * 0.7, 2 * 450 - 32));
  });

  it("below: sits under the anchor when there is room, clamped to the viewport's right edge", () => {
    const pill = {
      ...RAIL_RECT,
      left: 1300,
      right: 1400,
      top: 100,
      bottom: 132,
      height: 32,
    } as DOMRect;
    const s = popoverStyle(pill, "below", 1440, 900);
    expect(s.top).toBe(140);
    expect(s.left).toBe(1440 - POPOVER_W - 16);
    expect(s.maxHeight).toBe(900 - 140 - 16);
  });

  it("below: flips above the anchor when fewer than 240px remain under it", () => {
    const low = {
      ...RAIL_RECT,
      left: 200,
      top: 760,
      bottom: 792,
      height: 32,
    } as DOMRect;
    const s = popoverStyle(low, "below", 1440, 900);
    expect(s.bottom).toBe(900 - 760 + 8);
    expect(s.top).toBeUndefined();
    expect(s.maxHeight).toBe(760 - 8 - 16);
  });
});

describe("BottomSheet — anchored (desktop popover)", () => {
  beforeEach(() => {
    stubMatchMedia([DESKTOP_QUERY]);
    Object.defineProperty(window, "innerWidth", {
      value: 1440,
      configurable: true,
    });
    Object.defineProperty(window, "innerHeight", {
      value: 900,
      configurable: true,
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("positions the panel from the anchor and paints no scrim (decision 5)", () => {
    render(
      <BottomSheet open onClose={vi.fn()} anchor={RAIL_RECT}>
        <p>Rows</p>
      </BottomSheet>,
    );
    const panel = screen.getByTestId("bottom-sheet-panel");
    expect(panel.style.right).toBe("92px");
    expect(panel.style.top).toBe("450px");
    expect(panel).toHaveClass("md:w-[360px]", "animate-menu-rise");
    expect(panel).not.toHaveClass("md:left-1/2");
    const scrim = screen.getByTestId("bottom-sheet-scrim");
    expect(scrim).not.toHaveClass("bg-scrim/66");
    expect(scrim).not.toHaveClass("backdrop-blur-[3px]");
  });

  it("still closes on the invisible scrim and on Escape", () => {
    const onClose = vi.fn();
    render(
      <BottomSheet open onClose={onClose} anchor={RAIL_RECT}>
        <p>Rows</p>
      </BottomSheet>,
    );
    fireEvent.click(screen.getByTestId("bottom-sheet-scrim"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("without an anchor the desktop dialog is exactly what it was", () => {
    render(
      <BottomSheet open onClose={vi.fn()}>
        <p>Rows</p>
      </BottomSheet>,
    );
    const panel = screen.getByTestId("bottom-sheet-panel");
    expect(panel).toHaveClass(
      "md:w-[520px]",
      "md:left-1/2",
      "animate-dialog-in",
    );
    expect(screen.getByTestId("bottom-sheet-scrim")).toHaveClass("bg-scrim/66");
  });
});
