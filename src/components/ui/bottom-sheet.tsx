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
// Phase 5.8 finished the grabber. It used to be decorative — the header comment here reassigned
// drag-to-close from 5.5 to 5.8, because the design only ever specifies a drag-following close on
// the gallery's details sheet. That sheet now exists, so `dragToClose` does too, along with
// `onSwipeSide` (swipe the details sheet sideways to cycle to the next picture without closing it
// first) and a `gallery` **variant** that swaps the animations and the panel's own styling.
//
// All three are additive and off by default: every 5.5/5.6 call site passes none of them and
// behaves exactly as it did.
//
// Phase 5.4 note: `animate-sheet-up` resolves to the redesign's snappier 260ms `sheetup` curve. The
// longer 400ms travel this component originally used lives on as `animate-sheet-gallery`, reserved
// for the gallery details modal (5.8).
//
// Phase 5.6 added the `animation` prop (see `ANIMATIONS` below). The feed's long-press sheet is a
// contextual menu, not an arriving surface, so it lifts and fades instead of sliding — but it is
// otherwise this same shell, which is the whole point of putting the difference in one prop rather
// than forking the component. `variant` (5.8) is the same idea one level up: it decides the panel's
// *skin* — radius, height cap, border, shadow, and which animation pair applies.

/**
 * Matched to each variant's exit animation, plus a little slack — `--animate-sheet-down` runs 260ms,
 * `--animate-sheet-gallery-out` 300ms. Only a *fallback*: `animationend` normally unmounts the
 * sheet first. It exists because `animationend` never fires at all in two real situations — a tab
 * backgrounded mid-close, and jsdom, which runs no animations — and a sheet that never unmounts
 * leaves a scrim swallowing every tap on the page.
 */
const EXIT_MS = { pill: 300, gallery: 360 } as const;

/** Past this much downward travel, releasing the grabber closes the sheet instead of snapping back. */
const DRAG_CLOSE_PX = 56;

/** How far down the panel a `pointerdown` still counts as "on the grabber". */
const GRAB_ZONE_PX = 64;

/** Past this much sideways travel (and more sideways than vertical), a release cycles instead. */
const SWIPE_SIDE_PX = 48;

/** The snap back to rest when a drag is released under the threshold. */
const SNAP = "transform .3s cubic-bezier(.22,.61,.36,1)";

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
  /**
   * The panel's skin, and which animation pair applies.
   *
   * - `"pill"` (default) — the 22px-radius surface every pill-summoned sheet uses. `animation`
   *   still chooses between the slide and the menu lift.
   * - `"gallery"` (5.8) — the immersive gallery's details sheet: a deeper 26px radius, a longer
   *   400ms travel, a heavier shadow, and a darker scrim, because it opens over a full-bleed
   *   picture on a near-black ground rather than over a page. `animation` is ignored here — the
   *   gallery pair is the variant.
   */
  variant?: "pill" | "gallery";
  /**
   * Let the reader drag the panel down by its grabber to dismiss it, following the finger the whole
   * way. Off everywhere else on purpose: the design only asks for it here, and a gesture that only
   * some sheets honor is worse than one no sheet does — but the gallery's details sheet is summoned
   * *by* a gesture, so leaving by one is the matching exit.
   *
   * Only a `pointerdown` in the top {@link GRAB_ZONE_PX}px of the panel arms it, which keeps the
   * gesture off the sheet's own scrollable body.
   */
  dragToClose?: boolean;
  /**
   * A sideways flick on the panel closes the sheet **and** reports the direction (`1` for a
   * leftward swipe — "next"). The gallery uses it to cycle to the neighbouring picture without
   * making the reader close the sheet, swipe, and reopen it. No other sheet passes it.
   */
  onSwipeSide?: (dir: 1 | -1) => void;
}

// Enter/exit class pairs per variant. Both halves live together deliberately: an exit that doesn't
// mirror its entrance is the kind of mismatch that only shows up on a device.
const ANIMATIONS = {
  sheet: { in: "animate-sheet-up", out: "animate-sheet-down" },
  menu: { in: "animate-menu-rise", out: "animate-menu-drop" },
  // The gallery pair. Longer and further than the pill sheets (see globals.css) — this one arrives
  // over a photograph, and a snappy 260ms would read as an interruption rather than an unfolding.
  gallery: { in: "animate-sheet-gallery", out: "animate-sheet-gallery-out" },
} as const;

// Per-variant panel styling. The gallery values are the prototype's own, inlined here rather than
// promoted to tokens: the 26px radius is deliberately *not* `--radius-sheet`'s 22 (a bigger surface
// over a darker ground wants a deeper corner), and a one-off doesn't earn a theme name.
const PANEL = {
  pill: "rounded-t-sheet border-ink/12 shadow-sheet",
  gallery:
    "rounded-t-[26px] border-ink/12 shadow-[0_-12px_50px_rgba(0,0,0,0.5)] overscroll-contain",
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
  variant = "pill",
  dragToClose = false,
  onSwipeSide,
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
    const id = setTimeout(finish, EXIT_MS[variant]);
    return () => {
      el?.removeEventListener("animationend", onEnd);
      clearTimeout(id);
    };
  }, [leaving, finish, variant]);

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

  // `variant` wins over `animation` when it's the gallery: that pair *is* the variant, and no call
  // site has any reason to mix the gallery's skin with the menu's lift.
  const pair = variant === "gallery" ? "gallery" : animation;

  // ── the drag gesture (5.8) ────────────────────────────────────────────────────────────────────
  // Refs, not state, throughout the gesture itself: the panel is moved by writing to its own
  // `style`, exactly as `use-swipe-back.ts` does, so a finger travelling down the screen never
  // re-renders the caller's sheet contents.
  //
  // **The animation has to be switched off before the transform will take.** `--animate-sheet-*`
  // carries `animation-fill-mode: both`, so once the entrance finishes the keyframe's own
  // `translateY(0)` keeps winning over any inline transform. Clearing `style.animation` at
  // pointer-down is what hands control back to this handler.
  const drag = React.useRef<{
    id: number;
    x: number;
    y: number;
    armed: boolean;
    dy: number;
    dx: number;
  } | null>(null);

  // `onSwipeSide` through a ref for the same reason `onClose` is: every call site passes a fresh
  // inline arrow, and this must not be a dependency of anything.
  const onSwipeSideRef = React.useRef(onSwipeSide);
  React.useEffect(() => {
    onSwipeSideRef.current = onSwipeSide;
  });

  const gestureEnabled = dragToClose || Boolean(onSwipeSide);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = panelRef.current;
    if (!el || e.button !== 0) return;
    // Only a press near the top of the panel arms the *downward* drag — that's the grabber and the
    // title, i.e. the parts that aren't the sheet's own scrollable body. A sideways flick is
    // tracked from anywhere, because there is nothing for it to fight with.
    const armed =
      dragToClose && e.clientY - el.getBoundingClientRect().top <= GRAB_ZONE_PX;
    drag.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      armed,
      dy: 0,
      dx: 0,
    };
    el.style.transition = "";
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    const el = panelRef.current;
    if (!state || !el || state.id !== e.pointerId) return;
    state.dx = e.clientX - state.x;
    state.dy = e.clientY - state.y;
    if (!state.armed) return;
    // Downward only. Dragging *up* on a sheet that is already as far up as it goes should do
    // nothing at all, not stretch it.
    el.style.animation = "none";
    el.style.transform = `translateY(${Math.max(0, state.dy)}px)`;
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    const el = panelRef.current;
    drag.current = null;
    if (!state || !el || state.id !== e.pointerId) return;

    const { dx, dy } = state;

    /** Hand the panel back to the CSS animations, wherever the finger left it. */
    const release = () => {
      el.style.transition = "";
      el.style.transform = "";
      el.style.animation = "";
    };

    // A sideways flick cycles *and* closes. Checked first: a swipe that travelled further sideways
    // than down was never an attempt to dismiss.
    if (
      onSwipeSideRef.current &&
      Math.abs(dx) > Math.abs(dy) &&
      Math.abs(dx) > SWIPE_SIDE_PX
    ) {
      release();
      onSwipeSideRef.current(dx < 0 ? 1 : -1);
      onCloseRef.current();
      return;
    }

    if (!state.armed) return;

    if (dy > DRAG_CLOSE_PX) {
      // The exit animation runs from `translateY(0)`, so releasing at (say) 70px down snaps that
      // last stretch back before sliding away. Visible only if you look for it, and the alternative
      // — hand-rolling the close travel here — would mean two implementations of the exit that
      // could disagree. Kept honest rather than clever.
      release();
      onCloseRef.current();
      return;
    }

    // Under the threshold: settle back. The animation stays switched off through the transition
    // (restoring it would re-apply the keyframe's `translateY(0)` instantly and there'd be nothing
    // to watch); `transitionend` hands it back afterwards.
    el.style.transition = SNAP;
    el.style.transform = "";
    const restore = () => {
      el.style.animation = "";
      el.removeEventListener("transitionend", restore);
    };
    el.addEventListener("transitionend", restore);
  };

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
        {...(gestureEnabled
          ? {
              onPointerDown,
              onPointerMove,
              onPointerUp: endDrag,
              onPointerCancel: endDrag,
            }
          : {})}
        className={cn(
          // `overflow-y-auto` as a floor: the collection sheets scroll their own row list (which
          // keeps the grabber and title pinned), but a sheet with free-form children taller than
          // the cap would otherwise spill out of the rounded panel and paint over the scrim.
          "border-hairline bg-surface absolute inset-x-0 bottom-0 flex flex-col overflow-y-auto border-t pt-2 pb-[26px] outline-none",
          PANEL[variant],
          leaving ? ANIMATIONS[pair].out : ANIMATIONS[pair].in,
        )}
      >
        {/* Grabber. 36×4 at the redesign's own 0.18 alpha, left off the text/border/fill ladder
            (which has no "solid indicator bar" category to normalize this into). Decorative on
            every sheet but the gallery's, which passes `dragToClose` and makes it mean what it
            looks like — the whole top {@link GRAB_ZONE_PX}px of the panel is the handle, not just
            these four pixels. */}
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
