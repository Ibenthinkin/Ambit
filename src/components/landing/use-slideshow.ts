"use client";

import * as React from "react";

import { END_TO_SHEET_MS } from "./landing-slides";

// The landing slideshow's *timing*, separated from anything that paints.
//
// Splitting it out buys two things. The obvious one is testability: the cycle's whole contract —
// advance, stop on the last slide, hand off to the sheet, be skippable, be restartable — is
// exercised in `use-slideshow.test.tsx` with fake timers and no DOM to speak of. The subtler one is
// that the component reading this hook has no timers in it at all, which is what stops the "clean
// up the interval on unmount" class of bug from ever arising there.
//
// **Why timeouts rather than the prototype's `setInterval`.** The prototype keeps one interval and
// calls `clearInterval` from inside its own `setState` updater when it reaches the end. That works
// in a prototype and is a hazard in React 19 with StrictMode double-invoking updaters. Chaining a
// fresh `setTimeout` per slide, keyed on the index, means the effect's own cleanup cancels the
// pending slide on every change — there is never more than one timer alive, and nothing has to
// remember to stop anything.

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
  /** Fires exactly once per run: after the last slide's delay, or immediately on `skip()`. */
  onDone: () => void;
}

export interface Slideshow {
  index: number;
  running: boolean;
  /** End the run now — the reader tapped, or asked for the sheet. Idempotent. */
  skip: () => void;
  /** Start the same run over from slide 0 (the reader collapsed the sheet). */
  restart: () => void;
}

export function useSlideshow({
  count,
  slideMs,
  enabled,
  endDelayMs = END_TO_SHEET_MS,
  onDone,
}: SlideshowOptions): Slideshow {
  const [index, setIndex] = React.useState(0);
  const [running, setRunning] = React.useState(true);

  // Mirrors `running` in a ref so `finish` can be idempotent without putting a side effect inside a
  // state updater. React 19's StrictMode deliberately invokes updaters twice to surface impurity;
  // an `onDone()` in there would fire the sheet's entrance twice, and the ref check is how the
  // "have we already finished?" question gets answered synchronously instead.
  const runningRef = React.useRef(true);

  // Latest-callback ref: the effect below must not tear down and restart the cycle merely because
  // the parent re-rendered with a new `onDone` identity. Reading it through a ref keeps the
  // dependency list honest without making the timing hostage to the caller's memoization.
  //
  // The assignment lives in an effect rather than in the render body — a render may be thrown away
  // (StrictMode, a suspended sibling), and writing a ref from one that never commits is how a
  // component ends up holding a callback belonging to a render that never happened.
  const onDoneRef = React.useRef(onDone);
  React.useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const finish = React.useCallback(() => {
    if (!runningRef.current) return;
    runningRef.current = false;
    setRunning(false);
    onDoneRef.current();
  }, []);

  React.useEffect(() => {
    if (!enabled || !running || count === 0) return;

    if (index >= count - 1) {
      // On the last slide: hold it, then hand off to the sheet.
      const timer = setTimeout(finish, endDelayMs);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(() => setIndex((i) => i + 1), slideMs);
    return () => clearTimeout(timer);
  }, [enabled, running, count, index, slideMs, endDelayMs, finish]);

  const restart = React.useCallback(() => {
    runningRef.current = true;
    setIndex(0);
    setRunning(true);
  }, []);

  return { index, running, skip: finish, restart };
}
