"use client";

import * as React from "react";

import type { Tempo } from "./tempos";

// The reel's clock (docs/DESIGN_landing-redo.md D5), separated from anything that paints — the
// split 5.11's `use-slideshow.ts` made, for the same two reasons: the whole contract is testable
// with fake timers, and the component has no timers in it at all.
//
// **One setTimeout per frame, never setInterval.** React 19 StrictMode double-invokes updaters; a
// timeout armed by an effect and cancelled by that effect's own cleanup can never leave two timers
// alive. `epoch` bumps on every manual step or restart so the next automatic step is a full frame
// from *now*; the tempo's `frameMs` is a dependency too, so the gear change behind the sheet
// applies immediately.
//
// **Frame rules.** A frame whose picture has not decoded is skipped, never shown blank — the reel
// moves to the next ready one and keeps time. Only when *no* other picture is ready does it hold,
// and it wakes on the next decode (`readyVersion`) rather than on its next tick: the held frame
// has already served its time. The first pass is a count of frames shown (`tempo.firstPass`),
// fired exactly once per run through a ref — the check must be synchronous and outside a state
// updater, or StrictMode fires it twice (the lesson 5.11 recorded).
//
// **`isReady` is read through a ref.** The screen passes a fresh closure every render, and a
// decode re-renders the screen; were the closure a timer dependency, every decode would push the
// next step back and a burst of arrivals would stall the cut.

export interface ReelOptions {
  count: number;
  tempo: Tempo;
  /** `false` while the overture is playing; the gate is checked only once this is true. */
  enabled: boolean;
  isReady: (index: number) => boolean;
  /** A picture that will never be ready (its decode rejected). Settled, for the gate's purposes. */
  isFailed?: (index: number) => boolean;
  /** Bumped by `usePictures` on every decode — what opens the gate and wakes a held reel. */
  readyVersion: number;
  onFirstPass: () => void;
}

/**
 * How long the reel waits, once enabled, for its gate to open before raising the sheet anyway. "Never
 * cut to a blank" must not become "never cut": a visitor whose pictures all fail still gets the
 * sign-in sheet on its own (docs/DESIGN_landing-redo.md D5; review finding 1, 09-25-26).
 */
export const GATE_DEADLINE_MS = 8000;

export interface Reel {
  index: number;
  /** The frame just left, or null on the first — the leaving layer of a cross-fade. */
  prev: number | null;
  /** Whether the gate has opened. Until it has, the overture's wordmark holds the screen. */
  started: boolean;
  /** Raise the sheet now (the glyph). Idempotent; the pictures keep moving. */
  skip: () => void;
  /** Back to frame 0 with the first pass re-armed (the sheet was collapsed). */
  restart: () => void;
  /** Step one ready frame either way, wrapping, and start the next automatic step from now. */
  advance: (dir: 1 | -1) => void;
}

interface Frame {
  index: number;
  prev: number | null;
}
type FrameAction =
  | { type: "go"; to: number }
  | { type: "start"; at: number }
  | { type: "reset" };

function frameReducer(state: Frame, action: FrameAction): Frame {
  if (action.type === "reset") return { index: 0, prev: null };
  // The gate opening on a picture other than 0 (0 failed): a first frame, so nothing is leaving.
  if (action.type === "start") return { index: action.at, prev: null };
  return { index: action.to, prev: state.index };
}

export function useReel({
  count,
  tempo,
  enabled,
  isReady,
  isFailed = () => false,
  readyVersion,
  onFirstPass,
}: ReelOptions): Reel {
  const [frame, dispatch] = React.useReducer(frameReducer, {
    index: 0,
    prev: null,
  });
  const [epoch, setEpoch] = React.useState(0);
  const [held, setHeld] = React.useState(false);

  // The gate, as a sticky flag adjusted during render (React's documented "storing information
  // from previous renders" pattern) rather than a setState inside an effect. It opens on the first
  // render where the reel is enabled and either its first `gateFrames` pictures (or all, if fewer)
  // have decoded, or those pictures have all *settled* — decoded or failed — and at least one
  // picture anywhere is ready. It then starts on the first ready picture, so a failed picture 0
  // is never the frame the reel cuts into. It never closes again.
  const [started, setStarted] = React.useState(false);
  if (!started && enabled && count > 0) {
    const need = Math.min(tempo.gateFrames, count);
    let readyInGate = 0;
    let settledInGate = 0;
    for (let i = 0; i < need; i++) {
      if (isReady(i)) readyInGate += 1;
      if (isReady(i) || isFailed(i)) settledInGate += 1;
    }
    let firstReady = -1;
    for (let i = 0; i < count && firstReady < 0; i++)
      if (isReady(i)) firstReady = i;
    const open =
      readyInGate === need || (settledInGate === need && firstReady >= 0);
    if (open) {
      setStarted(true);
      if (firstReady > 0) dispatch({ type: "start", at: firstReady });
    }
  }

  const isReadyRef = React.useRef(isReady);
  const onFirstPassRef = React.useRef(onFirstPass);
  React.useEffect(() => {
    isReadyRef.current = isReady;
    onFirstPassRef.current = onFirstPass;
  }, [isReady, onFirstPass]);

  const shown = React.useRef(1); // frames shown this run; the first counts
  const firedRef = React.useRef(false);

  const fire = React.useCallback(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    onFirstPassRef.current();
  }, []);

  const firstPass = tempo.firstPass;
  const countFrame = React.useCallback(() => {
    shown.current += 1;
    if (shown.current > firstPass) fire();
  }, [firstPass, fire]);

  /** The next ready index from `from` in `dir`, within one lap, or null if none. */
  const nextReady = React.useCallback(
    (from: number, dir: 1 | -1): number | null => {
      for (let step = 1; step < count; step++) {
        const i = (((from + dir * step) % count) + count) % count;
        if (isReadyRef.current(i)) return i;
      }
      return null;
    },
    [count],
  );

  const goTo = React.useCallback(
    (to: number) => {
      dispatch({ type: "go", to });
      countFrame();
    },
    [countFrame],
  );

  // The deadline: a gate that has not opened GATE_DEADLINE_MS after the reel was enabled raises
  // the sheet anyway. The pictures may still arrive and start the reel behind it.
  React.useEffect(() => {
    if (!enabled || started || count === 0) return;
    const timer = setTimeout(fire, GATE_DEADLINE_MS);
    return () => clearTimeout(timer);
  }, [enabled, started, count, fire]);

  // The automatic step.
  React.useEffect(() => {
    if (!started || count === 0 || held) return;
    const timer = setTimeout(() => {
      // A one-picture reel (the fallback, Save-Data) has nowhere to go but still owes the sheet
      // its cue: it counts the frame and re-arms.
      if (count === 1) {
        countFrame();
        setEpoch((e) => e + 1);
        return;
      }
      const next = nextReady(frame.index, 1);
      if (next === null) setHeld(true);
      else goTo(next);
    }, tempo.frameMs);
    return () => clearTimeout(timer);
  }, [
    started,
    count,
    held,
    frame.index,
    epoch,
    tempo.frameMs,
    nextReady,
    goTo,
    countFrame,
  ]);

  // A held reel wakes on the next decode. Deferred a tick so the state change lands from a
  // callback, not synchronously inside the effect.
  React.useEffect(() => {
    if (!held) return;
    const timer = setTimeout(() => {
      const next = nextReady(frame.index, 1);
      if (next === null) return;
      setHeld(false);
      goTo(next);
    }, 0);
    return () => clearTimeout(timer);
  }, [held, readyVersion, frame.index, nextReady, goTo]);

  const advance = React.useCallback(
    (dir: 1 | -1) => {
      if (count < 2) return;
      const next = nextReady(frame.index, dir);
      if (next !== null) goTo(next);
      setHeld(false);
      setEpoch((e) => e + 1);
    },
    [count, frame.index, nextReady, goTo],
  );

  const restart = React.useCallback(() => {
    firedRef.current = false;
    shown.current = 1;
    dispatch({ type: "reset" });
    setHeld(false);
    setEpoch((e) => e + 1);
  }, []);

  return {
    index: frame.index,
    prev: frame.prev,
    started,
    skip: fire,
    restart,
    advance,
  };
}
