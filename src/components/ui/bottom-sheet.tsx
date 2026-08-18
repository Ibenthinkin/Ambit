"use client";

import * as React from "react";

import { cn } from "~/lib/utils";

// The shared bottom-sheet shell: a 22px-top-radius panel sliding up from the bottom over a blurred
// scrim. Closes on scrim click or Escape. Every sheet in the app is this shell plus content —
// save-to-collection, the pill's collections list, share (all 5.5), and the feed's long-press item
// sheet (5.6).
//
// Phase 5.5 added the centered title slot and the **exit** animation. The exit is the reason this
// component carries state at all: returning `null` the instant `open` flipped false made the sheet
// vanish, which read as a glitch next to how deliberately it arrives. So a closing sheet stays
// mounted through `sheet-down` and unmounts on `animationend`, with a timer as the fallback (see
// `EXIT_MS`).
//
// Still not here: **drag-to-close**. The header comment used to attribute it to 5.5, but the design
// only specifies a drag-following close on the gallery details sheet — so it belongs to 5.8, and
// the grabber below stays decorative until then.
//
// Phase 5.4 note: `animate-sheet-up` resolves to the redesign's snappier 260ms `sheetup` curve. The
// longer 400ms travel this component originally used lives on as `animate-sheet-gallery`, reserved
// for the gallery details modal (5.8).
//
// Phase 5.6 added the `animation` prop (see `ANIMATIONS` below). The feed's long-press sheet is a
// contextual menu, not an arriving surface, so it lifts and fades instead of sliding — but it is
// otherwise this same shell, which is the whole point of putting the difference in one prop rather
// than forking the component.

/**
 * Matched to `--animate-sheet-down`'s 260ms, plus a little slack. Only a *fallback*: `animationend`
 * normally unmounts the sheet first. It exists because `animationend` never fires at all in two
 * real situations — a tab backgrounded mid-close, and jsdom, which runs no animations — and a sheet
 * that never unmounts leaves a scrim swallowing every tap on the page.
 */
const EXIT_MS = 300;

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  /** Centered title, Sora 600 15px — every sheet in the design has one. */
  title?: string;
  children: React.ReactNode;
  /**
   * Caps the panel height, with the caller's content doing the scrolling. The save sheet's list is
   * the reason this exists (the design puts it at 72%); the default lets short sheets size to
   * their content.
   */
  maxHeightPct?: number;
  /**
   * How the panel arrives and leaves.
   *
   * - `"sheet"` (default) — the 260ms slide up from off-screen. Every 5.5 sheet.
   * - `"menu"` — a 200ms lift-and-fade. The feed's long-press sheet (5.6) is a *contextual menu*
   *   summoned by a finger already resting on the thing it acts on; sliding a whole surface up
   *   from the bottom overstates that. Same shell, same scrim, same keyboard contract — only the
   *   two animation classes differ.
   */
  animation?: "sheet" | "menu";
}

// Enter/exit class pairs per variant. Both halves live together deliberately: an exit that doesn't
// mirror its entrance is the kind of mismatch that only shows up on a device.
const ANIMATIONS = {
  sheet: { in: "animate-sheet-up", out: "animate-sheet-down" },
  menu: { in: "animate-menu-rise", out: "animate-menu-drop" },
} as const;

/**
 * There's no point animating a sheet out for someone who asked the OS for less motion — globals.css
 * already collapses every animation to 0.01ms under this query, so without this check the sheet
 * would just sit there, invisible and inert, for the length of the fallback timer.
 *
 * `matchMedia` is guarded because jsdom doesn't implement it; absent, this reads as "no preference",
 * which is the right default.
 */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

export function BottomSheet({
  open,
  onClose,
  title,
  children,
  maxHeightPct = 80,
  animation = "sheet",
}: BottomSheetProps) {
  // Only the *closing* phase needs state; "open" is a prop, so `leaving` is the single extra bit
  // and the sheet is on screen whenever either is true.
  const [leaving, setLeaving] = React.useState(false);
  const [prevOpen, setPrevOpen] = React.useState(open);
  const panelRef = React.useRef<HTMLDivElement>(null);
  // Whatever had focus before the sheet opened, so it can be handed back on close — otherwise a
  // keyboard user is dumped at the top of the document every time a sheet dismisses.
  const returnFocusRef = React.useRef<HTMLElement | null>(null);
  const titleId = React.useId();

  const finish = React.useCallback(() => setLeaving(false), []);

  // Adjusting state *during render* when a prop changes, rather than in an effect. This is React's
  // own documented pattern for exactly this shape ("You Might Not Need an Effect"): an effect here
  // would render the closed sheet once, then re-render it as leaving — a visible flicker, and the
  // reason `react-hooks/set-state-in-effect` flags it.
  if (prevOpen !== open) {
    setPrevOpen(open);
    // Reduced motion skips the exit entirely: globals.css collapses every animation to 0.01ms
    // under that query, so animating out would leave the sheet sitting there inert instead.
    setLeaving(!open && !prefersReducedMotion());
  }

  const mounted = open || leaving;

  // The exit itself. A **native** listener rather than React's `onAnimationEnd`: React's synthetic
  // animation events are never delivered in jsdom (which has no `AnimationEvent` at all), so the
  // synthetic version of this is untestable — and this is the path that actually runs in a browser.
  // The timer is only a fallback; `animationend` also never fires for a tab backgrounded mid-close,
  // and a sheet that never unmounts leaves a scrim swallowing every tap on the page.
  React.useEffect(() => {
    if (!leaving) return;
    const el = panelRef.current;
    const onEnd = (e: Event) => {
      // `animationend` bubbles, so a child's animation finishing would otherwise tear the sheet
      // down mid-exit. Only this panel's own animation counts.
      if (e.target === el) finish();
    };
    el?.addEventListener("animationend", onEnd);
    const id = setTimeout(finish, EXIT_MS);
    return () => {
      el?.removeEventListener("animationend", onEnd);
      clearTimeout(id);
    };
  }, [leaving, finish]);

  // `onClose` through a ref so the effects below can depend on `open` alone. Every call site passes
  // a fresh inline arrow (`onClose={() => setSaveOpen(false)}`), so listing it as a dependency made
  // the focus effect tear down and rebuild on *every parent render* — which yanked focus back onto
  // the panel mid-interaction and, worse, re-recorded "what to restore focus to" as a control
  // *inside* the sheet, so closing restored focus to a node about to be unmounted. The feature
  // defeated itself.
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Entry/exit focus — deliberately keyed on `open` alone, so it runs exactly once per open.
  React.useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    // Focus the panel itself rather than its first control: the sheet's *title* is what the user
    // needs announced, and jumping straight onto a collection row would skip it.
    panel?.focus();
    return () => returnFocusRef.current?.focus();
  }, [open]);

  // The keyboard contract: Escape closes, Tab stays inside. The scrim hides the page visually but
  // does nothing to the tab order, so without a real trap the next Tab walks straight into the
  // page behind it.
  React.useEffect(() => {
    if (!open) return;

    // No `offsetParent`-style visibility filter here: it reports `null` for everything in jsdom
    // (which has no layout engine), which would silently empty this list under test while working
    // in a browser — the worst of both. Sheets don't render hidden controls, so the selector alone
    // is enough.
    const focusablesIn = (root: HTMLElement) => [
      ...root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ];

    const onKey = (e: KeyboardEvent) => {
      const panel = panelRef.current;
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel) return;

      const focusables = focusablesIn(panel);
      if (focusables.length === 0) {
        e.preventDefault(); // nothing to land on; keep focus on the panel
        panel.focus();
        return;
      }
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement;

      // Focus escaping the panel entirely is the case that actually leaks. Safari blurs to `body`
      // when you tap non-focusable sheet content (the title, the grabber, the padding) rather than
      // focusing the `tabindex="-1"` ancestor — and from `body`, an unguarded Tab goes to the first
      // focusable in *document* order, i.e. the page behind the scrim.
      if (!panel.contains(active)) {
        e.preventDefault();
        first.focus();
        return;
      }
      if (!e.shiftKey && (active === last || active === panel)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!mounted) return null;

  return (
    // z-[35] mirrors the prototype's own stacking value — there's no `--z-*` theme namespace to
    // draw a name from (PHASE5_PLAN.md flagged this unverified; arbitrary value it is).
    //
    // **`fixed`, not `absolute`.** The prototypes position against their iOS-frame wrapper; the
    // real app's equivalent of that frame is the viewport. With `absolute` this resolved against
    // the initial containing block on any page without a positioned ancestor (no page has one —
    // not `layout.tsx`, not `/dev/tokens`), so a sheet opened after scrolling rendered off-screen
    // at the top of the document. `fixed` makes it independent of what the caller happens to wrap
    // it in.
    //
    // `pointer-events-none` while leaving: a sheet on its way out must not eat the tap that comes
    // right after it.
    <div
      className={cn("fixed inset-0 z-[35]", leaving && "pointer-events-none")}
    >
      <div
        data-testid="bottom-sheet-scrim"
        onClick={onClose}
        className={cn(
          "bg-scrim/66 absolute inset-0 backdrop-blur-[3px]",
          leaving ? "animate-scrim-out" : "animate-scrim-in",
        )}
      />
      <div
        ref={panelRef}
        data-testid="bottom-sheet-panel"
        role="dialog"
        aria-modal="true"
        {...(title ? { "aria-labelledby": titleId } : {})}
        // Focusable so the sheet itself can take focus on open (see the keyboard effect above),
        // but not a tab stop of its own.
        tabIndex={-1}
        style={{ maxHeight: `${maxHeightPct}%` }}
        className={cn(
          // `overflow-y-auto` as a floor: the collection sheets scroll their own row list (which
          // keeps the grabber and title pinned), but a sheet with free-form children taller than
          // the cap would otherwise spill out of the rounded panel and paint over the scrim.
          "border-hairline bg-surface shadow-sheet rounded-t-sheet border-ink/12 absolute inset-x-0 bottom-0 flex flex-col overflow-y-auto border-t pt-2 pb-[26px] outline-none",
          leaving ? ANIMATIONS[animation].out : ANIMATIONS[animation].in,
        )}
      >
        {/* Grabber — decorative until 5.8 wires up drag-to-close. 36×4 at the redesign's own 0.18
            alpha, left off the text/border/fill ladder (which has no "solid indicator bar"
            category to normalize this into). */}
        <div className="flex shrink-0 flex-col items-center py-4">
          <div className="rounded-pill bg-ink/18 h-1 w-9" />
        </div>
        {title ? (
          <h2
            id={titleId}
            className="text-ink-hi shrink-0 px-[18px] pb-3 text-center text-[15px] font-semibold"
          >
            {title}
          </h2>
        ) : null}
        {/* Horizontal padding is deliberately NOT on the shell: the save/collections sheets need
            edge-to-edge scrolling rows, so each sheet's content owns its own insets — matching the
            prototypes' `padding:10px 0 26px` shell. */}
        {children}
      </div>
    </div>
  );
}
