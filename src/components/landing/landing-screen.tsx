"use client";

import * as React from "react";

import { Logo } from "~/components/icons";

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

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  // Guarded: jsdom has no `matchMedia` unless a test stubs one, and this runs during a lazy state
  // initializer, where a throw would take the render down rather than degrade.
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
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

  // Computed once, in a lazy initializer, and never recomputed — the same run has to survive every
  // re-render or the imagery would reshuffle mid-cycle. Nothing below renders it until `hydrated`,
  // so the randomness never reaches the server's markup.
  //
  // Reduced motion collapses into static mode: a reader who has asked the OS for less movement
  // should not be made to sit through a five-second animated preamble before they can sign in.
  const [{ run, isStatic }] = React.useState(() => {
    const staticMode = mode === "static" || prefersReducedMotion();
    return {
      run: pickRun(undefined, Math.random, staticMode ? 1 : undefined),
      isStatic: staticMode,
    };
  });

  const [ready, setReady] = React.useState(false);
  const [opened, setOpened] = React.useState(false);

  // Static mode arrives with the sheet already up. Gating on `hydrated` keeps the server's markup
  // and the hydration render identical (sheet down, no imagery) for every reader, including the
  // reduced-motion one whose static-ness the server can't know about; a frame later it rises on
  // its own transition, which reads as intent rather than as a flash.
  const open = hydrated && (isStatic || opened);

  React.useEffect(() => {
    let cancelled = false;
    // `setReady` is asynchronous here — it lands in a promise callback after the first slide has
    // decoded, not synchronously during the effect.
    void preloadRun(run).then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [run]);

  const show = useSlideshow({
    count: isStatic || !hydrated ? 0 : run.length,
    slideMs: SLIDE_MS,
    enabled: ready,
    onDone: () => setOpened(true),
  });

  // Collapsing replays the same run from the top (the prototype's behaviour) rather than picking a
  // fresh one — a reader who ducked back out to look at the pictures is asking for *those*
  // pictures again.
  const collapse = isStatic
    ? undefined
    : () => {
        setOpened(false);
        show.restart();
      };

  return (
    <div className="bg-bg-app relative min-h-dvh overflow-hidden">
      <LandingSlideshow
        run={hydrated ? run : []}
        index={show.index}
        fade={fadeMs(SLIDE_MS)}
        onTap={isStatic ? undefined : show.skip}
      />

      {/* The one visible control while the show runs. Its accessible name is deliberately not
          "Sign in" — that belongs to the form's submit button, and two controls sharing it would
          make every `getByRole("button", { name: "Sign in" })` in the e2e suite ambiguous. */}
      {hydrated && !isStatic && !open ? (
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

      <AuthSheet open={open} onCollapse={collapse}>
        {children}
      </AuthSheet>
    </div>
  );
}
