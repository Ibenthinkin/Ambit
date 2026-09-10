"use client";

import * as React from "react";

import { Logo } from "~/components/icons";
import { useMediaQuery } from "~/hooks/use-media-query";

import { AuthSheet } from "./auth-sheet";
import { LandingSlideshow } from "./landing-slideshow";
import { fadeMs, pickRun, preloadRun, SLIDE_MS } from "./landing-slides";
import { useSlideshow } from "./use-slideshow";

// The landing screen (`Ambit - Landing 2.dc.html`): a rapid slideshow of the kind of thing Ambit
// shows you, which resolves into the sign-in sheet. Shared by `/` and `/reset-password` — the
// reset page is the same screen with the show already over, so a password-reset link doesn't land
// somewhere that looks like a different product.
//
// This replaced 5.2's `LandingShell` (two drifting blurred orbs behind a 42px hero), which is
// deleted along with the `drift` keyframe it was the only user of.

export interface LandingScreenProps {
  /**
   * `"cycle"` — the full slideshow, sheet rises at the end (`/`).
   * `"static"` — one still image, sheet open immediately (`/reset-password`).
   */
  mode: "cycle" | "static";
  children: React.ReactNode;
}

/**
 * Reduced motion is read the way `hydrated` is — after the hydration boundary, never in the
 * server's render. `useMediaQuery` is a `useSyncExternalStore` whose server snapshot is `false`, so
 * the server's markup and the hydration render agree for every reader, and a reduced-motion
 * reader's static-ness arrives one synchronous re-render later.
 *
 * **Until 09-10-26 it was read in a lazy `useState` initializer**, which the server evaluates as
 * `false` and a reduced-motion client as `true`. `onCollapse` hung off that value, so the server
 * rendered `AuthSheet`'s collapse glyph as a `<button>` and the client hydrated an inert
 * `<div aria-hidden>` — the hydration mismatch logged 09-08, and the reason the glyph "doesn't
 * open or close anything". Expected to be the production React #418 on `/` too
 * (`docs/BUILD_PLAN.md`).
 */
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/** A form field owns its arrow keys: in one, ←/→ move the caret, not the slideshow. */
function isEditable(el: Element | null): boolean {
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    (el instanceof HTMLElement && el.isContentEditable)
  );
}

// The hydration boundary, as a store rather than a mount-effect flag.
//
// The screen's content is *random* (a shuffled run), so it can't be part of the server's HTML —
// the server would pick one order, the client another, and every load would log a hydration
// mismatch. The usual fix is a `useState(false)` flipped in a mount effect; this does the same job
// without a synchronous setState inside an effect (which `react-hooks/set-state-in-effect`
// correctly objects to, since it re-renders the tree an extra time on every mount).
//
// `subscribe` returns an unsubscribe that never fires: the value goes false → true exactly once,
// when React finishes hydrating, and never changes again.
const subscribeToNothing = () => () => undefined;
const onClient = () => true;
const onServer = () => false;

export function LandingScreen({ mode, children }: LandingScreenProps) {
  const hydrated = React.useSyncExternalStore(
    subscribeToNothing,
    onClient,
    onServer,
  );

  // Reduced motion collapses into static mode: a reader who has asked the OS for less movement
  // should not be made to sit through a five-second animated preamble before they can sign in.
  // See REDUCED_MOTION above for why this is read here and not in the initializer below.
  const reduce = useMediaQuery(REDUCED_MOTION);
  const isStatic = mode === "static" || reduce;

  // Computed once, in a lazy initializer, and never recomputed — the same run has to survive every
  // re-render or the imagery would reshuffle mid-cycle. Nothing below renders it until `hydrated`,
  // so the randomness never reaches the server's markup. Keyed on the *prop* only: whether this
  // reader wants motion isn't known here (see above), so a cycle-mode run is always a full one.
  const [run] = React.useState(() =>
    pickRun(undefined, Math.random, mode === "static" ? 1 : undefined),
  );
  // What actually mounts: static shows one still picture, so only one is decoded and downloaded.
  const shown = React.useMemo(
    () => (isStatic ? run.slice(0, 1) : run),
    [isStatic, run],
  );

  const [ready, setReady] = React.useState(false);
  // The reader's own say about the sheet, once they've had one — the first pass raising it, the
  // glyph, a collapse. Until then (`null`) the mode decides: static arrives with it up.
  const [opened, setOpened] = React.useState<boolean | null>(null);

  // Gating on `hydrated` keeps the server's markup and the hydration render identical (sheet down,
  // no imagery) for every reader, including the reduced-motion one whose static-ness the server
  // can't know about; a frame later it rises on its own transition, which reads as intent rather
  // than as a flash.
  const open = hydrated && (opened ?? isStatic);

  React.useEffect(() => {
    let cancelled = false;
    // `setReady` is asynchronous here — it lands in a promise callback after the first slide has
    // decoded, not synchronously during the effect.
    void preloadRun(shown).then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [shown]);

  // Never stops (09-10-26): the pictures keep cycling behind the sheet once the first pass has
  // raised it. See `use-slideshow.ts`.
  const show = useSlideshow({
    count: isStatic || !hydrated ? 0 : run.length,
    slideMs: SLIDE_MS,
    enabled: ready,
    onFirstPass: () => setOpened(true),
  });
  const { advance } = show;

  // Collapsing replays the same run from the top (the prototype's behaviour) rather than picking a
  // fresh one — a reader who ducked back out to look at the pictures is asking for *those*
  // pictures again. Defined for every reader on `/`, reduced motion included (they collapse to
  // their one still picture); only `/reset-password` has no slideshow to go back to.
  const collapse = () => {
    setOpened(false);
    show.restart();
  };

  // ←/→ step the slides (09-10-26) — unless a form field has focus, where the arrows edit the
  // field, or a modifier is held, where Alt/⌘+← is the browser's own Back. Nothing here calls
  // `preventDefault`: the page doesn't scroll, and a key the slideshow ignores is the browser's.
  React.useEffect(() => {
    if (isStatic) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.metaKey || e.ctrlKey) return;
      if (isEditable(document.activeElement)) return;
      if (e.key === "ArrowRight") advance(1);
      else if (e.key === "ArrowLeft") advance(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isStatic, advance]);

  return (
    <div className="bg-bg-app relative min-h-dvh overflow-hidden">
      <LandingSlideshow
        run={hydrated ? shown : []}
        index={isStatic ? 0 : show.index}
        fade={fadeMs(SLIDE_MS)}
        // "Next", since 09-10-26 — it used to skip to the sheet. The glyph is the way to the sheet.
        onTap={isStatic ? undefined : () => advance(1)}
      />

      {/* The one visible control while the sheet is down. Its accessible name is deliberately not
          "Sign in" — that belongs to the form's submit button, and two controls sharing it would
          make every `getByRole("button", { name: "Sign in" })` in the e2e suite ambiguous. Keyed on
          the route, not on motion: a reduced-motion reader who collapsed the sheet needs a way
          back up too. */}
      {hydrated && mode !== "static" && !open ? (
        <button
          type="button"
          aria-label="Open sign-in"
          onClick={show.skip}
          className="border-ink/14 fixed bottom-[28px] left-1/2 z-20 flex size-[54px] -translate-x-1/2 items-center justify-center rounded-full border backdrop-blur-[14px]"
          style={{
            background: "rgba(27,24,21,0.72)",
            boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
          }}
        >
          <Logo size={30} className="text-accent" />
        </button>
      ) : null}

      {/* The hero follows the *route*, not the mode: a reduced-motion visitor to `/` still gets
          the pitch, while `/reset-password` never does regardless of how it renders. */}
      <AuthSheet
        open={open}
        // The prop, never the media query: this is what must be identical on both sides of
        // hydration (see REDUCED_MOTION).
        onCollapse={mode === "static" ? undefined : collapse}
        showHero={mode !== "static"}
      >
        {children}
      </AuthSheet>
    </div>
  );
}
