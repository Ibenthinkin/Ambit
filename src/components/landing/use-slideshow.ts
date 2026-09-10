"use client";

import * as React from "react";

import { END_TO_SHEET_MS } from "./landing-slides";

// The landing slideshow's *timing*, separated from anything that paints.
//
// Splitting it out buys two things. The obvious one is testability: the cycle's whole contract —
// advance forever, hand off to the sheet once, be steppable, be skippable, be restartable — is
// exercised in `use-slideshow.test.tsx` with fake timers and no DOM to speak of. The subtler one is
// that the component reading this hook has no timers in it at all, which is what stops the "clean
// up the interval on unmount" class of bug from ever arising there.
//
// **The show never stops (09-10-26, docs/DESIGN_screen-structure.md §3).** Until then the run
// ended on its last slide and froze behind the sheet. Now it wraps — `(index + 1) % count` — on the
// same timer chain, forever. What used to be the end of the run is the end of the *first pass*:
// the last slide of that pass still holds for the handoff beat and then fires `onFirstPass`, which
// raises the sheet on exactly the old schedule while the pictures keep moving behind it. Every
// later pass is silent.
//
// **Why timeouts rather than the prototype's `setInterval`.** The prototype keeps one interval and
// calls `clearInterval` from inside its own `setState` updater when it reaches the end. That works
// in a prototype and is a hazard in React 19 with StrictMode double-invoking updaters. Chaining a
// fresh `setTimeout` per slide, keyed on the index, means the effect's own cleanup cancels the
// pending slide on every change — there is never more than one timer alive, and nothing has to
// remember to stop anything.
//
// **`epoch`.** A manual step (`advance`) or a replay (`restart`) bumps it, and it sits in the timer
// effect's dependencies, so the next automatic step is scheduled a full `slideMs` from *now*. A
// click 500ms into a slide must not be followed 100ms later by the step that was already pending —
// and a `restart` onto the index it was already on would otherwise not re-arm at all.

export interface SlideshowOptions {
  /** Slides in this run. `0` means the cycle never starts (static mode). */
  count: number;
  slideMs: number;
  /**
   * `false` until the first slide has decoded (see `preloadRun`). The cycle waits for it, so slide
   * 0 gets its full time on screen instead of being half-spent on a blank frame.
   */
  enabled: boolean;
  endDelayMs?: number;
  /** Fires exactly once per run: after the last slide of the first pass has held for
   *  `endDelayMs`, or immediately on `skip()`. What raises the sheet. */
  onFirstPass: () => void;
}

export interface Slideshow {
  index: number;
  /** Raise the sheet now — the reader tapped the glyph. Idempotent. The pictures keep moving. */
  skip: () => void;
  /** Start the run over from slide 0 (the reader collapsed the sheet); the first pass fires again. */
  restart: () => void;
  /** Step one slide either way, wrapping, and start the next automatic step from now. */
  advance: (dir: 1 | -1) => void;
}

export function useSlideshow({
  count,
  slideMs,
  enabled,
  endDelayMs = END_TO_SHEET_MS,
  onFirstPass,
}: SlideshowOptions): Slideshow {
  const [index, setIndex] = React.useState(0);
  // The first pass is what raises the sheet, and it must fire exactly once — but the cycle now goes
  // on forever underneath, so "have we fired?" can't be "are we still running?" any more. A ref,
  // for the StrictMode reason this hook has always had: the check has to be synchronous and outside
  // a state updater, because React 19 invokes updaters twice and an `onFirstPass()` in one would
  // raise the sheet twice.
  const firedRef = React.useRef(false);
  const [epoch, setEpoch] = React.useState(0);

  // Latest-callback ref: the effect below must not tear down and restart the cycle merely because
  // the parent re-rendered with a new `onFirstPass` identity. The assignment lives in an effect
  // rather than in the render body — a render may be thrown away (StrictMode, a suspended
  // sibling), and writing a ref from one that never commits is how a component ends up holding a
  // callback belonging to a render that never happened.
  const onFirstPassRef = React.useRef(onFirstPass);
  React.useEffect(() => {
    onFirstPassRef.current = onFirstPass;
  }, [onFirstPass]);

  const fire = React.useCallback(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    onFirstPassRef.current();
  }, []);

  React.useEffect(() => {
    if (!enabled || count === 0) return;

    // The last slide of an unfired pass holds for the handoff beat, then fires and wraps; every
    // other slide simply moves on. One setTimeout per slide, never setInterval (see the header).
    if (index >= count - 1 && !firedRef.current) {
      const timer = setTimeout(() => {
        fire();
        setIndex(0);
      }, endDelayMs);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(() => setIndex((i) => (i + 1) % count), slideMs);
    return () => clearTimeout(timer);
  }, [enabled, count, index, slideMs, endDelayMs, fire, epoch]);

  const advance = React.useCallback(
    (dir: 1 | -1) => {
      if (count === 0) return;
      setIndex((i) => (i + dir + count) % count);
      setEpoch((e) => e + 1);
    },
    [count],
  );

  const restart = React.useCallback(() => {
    firedRef.current = false;
    setIndex(0);
    setEpoch((e) => e + 1);
  }, []);

  return { index, skip: fire, restart, advance };
}
