"use client";

import * as React from "react";

// The gallery's chrome — title, maker, hint, pill — on a slow ten-second heartbeat.
//
// It starts **hidden**, which is the whole design in one word: `/g/[itemId]` is a picture, and a
// picture with a caption permanently welded to it is a catalogue entry. So the caption comes and
// goes on its own, ten seconds at a time, and any tap brings it straight back.
//
// A cycle rather than a timeout, because a timeout makes the labels a thing you *lost*. On a loop
// they're a thing that comes back around — you can wait a beat instead of reaching for the screen,
// which is the difference between a calm surface and one that's testing your reflexes.
//
// Nothing here knows what the chrome *is*. The caller renders it and fades it; this only owns when.

/** One phase of the cycle. Ten seconds each way — long enough to read, short enough to come back. */
const PHASE_MS = 10_000;

export interface ChromeCycle {
  visible: boolean;
  /** Flip now, and start the next phase from where the flip left it. */
  toggle: () => void;
  /** Hide now, and start over. Called on every image change — a new picture, a fresh look at it. */
  reset: () => void;
}

export function useChromeCycle(): ChromeCycle {
  const [visible, setVisible] = React.useState(false);
  // Bumped by `toggle`/`reset` to restart the timer. A counter rather than a boolean because the
  // effect has to re-run even when two resets in a row leave `visible` at the same value — which
  // is the common case (swipe, swipe, swipe, all of them hiding already-hidden chrome).
  const [phase, setPhase] = React.useState(0);

  React.useEffect(() => {
    const id = setTimeout(() => {
      setVisible((v) => !v);
      setPhase((p) => p + 1);
    }, PHASE_MS);
    return () => clearTimeout(id);
  }, [phase]);

  const toggle = React.useCallback(() => {
    setVisible((v) => !v);
    setPhase((p) => p + 1);
  }, []);

  const reset = React.useCallback(() => {
    setVisible(false);
    setPhase((p) => p + 1);
  }, []);

  return { visible, toggle, reset };
}
