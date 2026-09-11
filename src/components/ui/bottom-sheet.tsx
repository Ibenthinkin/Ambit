"use client";

import * as React from "react";

import { DESKTOP_QUERY, useMediaQuery } from "~/hooks/use-media-query";
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

/** Past this much downward travel, releasing closes the sheet instead of snapping back. */
const DRAG_CLOSE_PX = 56;

/**
 * The fast path: this much downward travel inside {@link FLICK_MS} closes regardless of distance.
 *
 * Added after the 08-21-26 device pass, where Ben's report was simply that "the details sheet should
 * close with a down swipe" — and it didn't, because a *swipe* is a flick and the only test was a
 * distance one. Same two-way "far enough OR fast enough" shape as the gallery's own gestures
 * (`hooks/use-rail-gestures.ts`).
 */
const FLICK_PX = 24;
const FLICK_MS = 300;

/**
 * How far down the panel a `pointerdown` counts as "on the grabber" *even when the sheet is
 * scrolled*. Below this, the drag arms only when the panel is scrolled to its top — at which point
 * a downward drag has nothing else it could mean, which is the same rule every native sheet uses.
 * Arming only in this band was the other half of why a down-swipe from mid-sheet did nothing.
 */
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
  /**
   * Desktop only (09-11-26): the rect of the control that opened this sheet, captured at click
   * time (`e.currentTarget.getBoundingClientRect()`). With it, and above `md`, the panel is a
   * popover floating beside that control rather than the centred dialog; the scrim goes invisible
   * but keeps catching clicks. Ignored on the phone. See `popoverStyle`.
   */
  anchor?: DOMRect | null;
  /** Which side of the anchor the popover takes: `left` (rail buttons, default) or `below` (tile pills). */
  placement?: "left" | "below";
}

// Enter/exit class pairs per variant. Both halves live together deliberately: an exit that doesn't
// mirror its entrance is the kind of mismatch that only shows up on a device.
const ANIMATIONS = {
  sheet: { in: "animate-sheet-up", out: "animate-sheet-down" },
  menu: { in: "animate-menu-rise", out: "animate-menu-drop" },
  // The gallery pair. Longer and further than the pill sheets (see globals.css) — this one arrives
  // over a photograph, and a snappy 260ms would read as an interruption rather than an unfolding.
  gallery: { in: "animate-sheet-gallery", out: "animate-sheet-gallery-out" },
  // Above `md` every variant uses this one (docs/DESIGN_desktop-polish.md §3): the panel is
  // centered, so a slide from the bottom edge would travel half a screen to get there.
  dialog: { in: "animate-dialog-in", out: "animate-dialog-out" },
} as const;

// Per-variant panel styling. The gallery values are the prototype's own, inlined here rather than
// promoted to tokens: the 26px radius is deliberately *not* `--radius-sheet`'s 22 (a bigger surface
// over a darker ground wants a deeper corner), and a one-off doesn't earn a theme name.
const PANEL = {
  pill: "rounded-t-sheet border-ink/12 shadow-sheet",
  gallery:
    "rounded-t-[26px] border-ink/12 shadow-[0_-12px_50px_rgba(0,0,0,0.5)] overscroll-contain",
} as const;

// Above `md` the panel stops being a sheet: 520px, centered both ways, every corner rounded at
// the sheet radius, a full hairline border rather than a top one. `md:inset-auto` clears the
// phone's `inset-x-0 bottom-0` before the `left/top` pair re-anchors it. `overscroll-contain`
// so a wheel at the end of the rows doesn't scroll the page underneath.
const PANEL_DESKTOP =
  "md:inset-auto md:left-1/2 md:top-1/2 md:w-[520px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-sheet md:border md:overscroll-contain";

// The desktop **popover** (docs/DESIGN_chrome-redesign.md §2, decision 5): with an `anchor` the
// panel stops being a centred dialog and floats beside the control that opened it — left of a
// rail button, under a tile's collection pill. 360px wide, the sheet radius, a full hairline
// border, the *menu* animation pair (a lift-and-fade; a dialog's scale would read as arriving
// from nowhere). Position is inline, computed by `popoverStyle` from the anchor's rect.
export const POPOVER_W = 360;
const PANEL_POPOVER =
  "md:inset-auto md:w-[360px] md:rounded-sheet md:border md:overscroll-contain";

const POPOVER_GAP = 14; // between a rail button and its panel
const BELOW_GAP = 8; // between a tile pill and its picker
const EDGE = 16; // the least the panel keeps from any viewport edge
const MIN_BELOW = 240; // under this much room, a `below` panel flips above

/**
 * Where a popover goes, as inline style. Pure, so the flip and the clamp are unit-testable.
 *
 * `left` centres the panel on the anchor vertically. **The centring is the `translate`
 * property, not `transform`**: `animate-menu-rise` animates `transform` with `fill-mode: both`,
 * and a `transform: translateY(-50%)` here would be replaced by the keyframe's own value the
 * moment it played — the same composition trap CLAUDE.md records for the 520px dialog, from the
 * other side. The max-height is twice the shorter distance to a viewport edge, less margins: a
 * panel centred on its anchor cannot then overflow either way.
 *
 * `below` drops the panel under the anchor's left edge (Cosmos's picker), flips above when
 * fewer than `MIN_BELOW`px remain, and keeps its left edge on screen.
 */
export function popoverStyle(
  a: DOMRect,
  placement: "left" | "below",
  vw: number,
  vh: number,
): React.CSSProperties {
  if (placement === "left") {
    const cy = a.top + a.height / 2;
    const room = 2 * Math.min(cy, vh - cy) - 2 * EDGE;
    return {
      right: vw - a.left + POPOVER_GAP,
      top: cy,
      translate: "0 -50%",
      maxHeight: Math.min(vh * 0.7, room),
      transformOrigin: "right center",
    };
  }
  const left = Math.max(EDGE, Math.min(a.left, vw - POPOVER_W - EDGE));
  const below = vh - a.bottom - BELOW_GAP - EDGE;
  if (below >= MIN_BELOW) {
    return {
      left,
      top: a.bottom + BELOW_GAP,
      maxHeight: below,
      transformOrigin: "top left",
    };
  }
  return {
    left,
    bottom: vh - a.top + BELOW_GAP,
    maxHeight: a.top - BELOW_GAP - EDGE,
    transformOrigin: "bottom left",
  };
}

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
  anchor = null,
  placement = "left",
}: BottomSheetProps) {
  // Only the *closing* phase needs state; "open" is a prop, so `leaving` is the single extra bit
  // and the sheet is on screen whenever either is true.
  const [leaving, setLeaving] = React.useState(false);
  const [prevOpen, setPrevOpen] = React.useState(open);
  // One read, shared by the animation pair, the panel skin and the gesture gate below. Sheets
  // only ever render on the client (they open from a tap), so the server snapshot never paints.
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  // A popover only ever renders on a desktop client, so reading the viewport here is safe; the
  // dimensions are read per render, which is what keeps a resized window's panel on screen.
  const anchored = isDesktop && anchor !== null;
  const popover = anchored
    ? popoverStyle(anchor, placement, window.innerWidth, window.innerHeight)
    : null;
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
  // site has any reason to mix the gallery's skin with the menu's lift. Above `md` the dialog pair
  // wins over both, because the panel is centered there and has no edge to slide from.
  //
  // An anchored panel lifts and fades in place — it is a menu beside its button, not a surface
  // arriving — so the menu pair wins over everything.
  const pair = anchored
    ? "menu"
    : isDesktop
      ? "dialog"
      : variant === "gallery"
        ? "gallery"
        : animation;

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
    at: number;
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

  // No drag-to-close and no sideways cycling on a desktop: there is no finger, the grabber is
  // hidden, and a mouse wheel over the rows must never be mistaken for a pull.
  const gestureEnabled = !isDesktop && (dragToClose || Boolean(onSwipeSide));

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = panelRef.current;
    if (!el || e.button !== 0) return;
    // Only a press near the top of the panel arms the *downward* drag — that's the grabber and the
    // title, i.e. the parts that aren't the sheet's own scrollable body. A sideways flick is
    // tracked from anywhere, because there is nothing for it to fight with.
    const armed =
      dragToClose &&
      (e.clientY - el.getBoundingClientRect().top <= GRAB_ZONE_PX ||
        // Anywhere on a sheet that isn't scrolled: there is no scroll for the drag to steal, so a
        // downward pull can only mean "put this away".
        el.scrollTop <= 0);
    drag.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      // **`Date.now()`, deliberately, and not `e.timeStamp`.** These are React *synthetic*
      // handlers, and React normalizes that field as `nativeEvent.timeStamp || Date.now()` — so a
      // falsy native timestamp silently becomes an epoch millisecond while its sibling event keeps
      // a `performance.now()`-based one. Two clocks, one subtraction, a negative "elapsed", and a
      // velocity test that passes for every gesture. (`hooks/use-rail-gestures.ts` reads
      // `e.timeStamp` safely because it attaches *native* listeners, where the value is the raw
      // DOMHighResTimeStamp React never touches.)
      at: Date.now(),
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
    const elapsed = Date.now() - state.at; // one clock — see `at`'s note in onPointerDown

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

    // Far enough OR fast enough — a flick down is a dismissal even when it barely travelled.
    if (dy > DRAG_CLOSE_PX || (dy > FLICK_PX && elapsed < FLICK_MS)) {
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
          "absolute inset-0",
          // Decision 5: a popover's scrim is an invisible click-catcher. The page stays fully
          // visible; click-outside, Escape and the focus trap all still work through it.
          !anchored && "bg-scrim/66 backdrop-blur-[3px]",
          !anchored && (leaving ? "animate-scrim-out" : "animate-scrim-in"),
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
        // A popover's own px `maxHeight` (and position) wins over the percentage cap.
        style={{ maxHeight: `${maxHeightPct}%`, ...popover }}
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
          anchored ? PANEL_POPOVER : PANEL_DESKTOP,
          leaving ? ANIMATIONS[pair].out : ANIMATIONS[pair].in,
        )}
      >
        {/* Grabber. 36×4 at the redesign's own 0.18 alpha, left off the text/border/fill ladder
            (which has no "solid indicator bar" category to normalize this into). Decorative on
            every sheet but the gallery's, which passes `dragToClose` and makes it mean what it
            looks like — the whole top {@link GRAB_ZONE_PX}px of the panel is the handle, not just
            these four pixels. */}
        <div className="flex shrink-0 flex-col items-center py-4 md:hidden">
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
