"use client";

import * as React from "react";

// The overture's clock (docs/DESIGN_landing-redo.md D4), read off doorofperception.com/explore's
// `runIntro`: the line fades in, holds, the tail collapses over 2.2 s, and the reel cuts in on the
// frame the collapse ends. No click — the reference waits for a gesture because it plays sound.
export const OVERTURE = {
  fadeInMs: 500,
  holdMs: 1400,
  collapseMs: 2200,
  tailFadeMs: 1600,
} as const;
/** When the reel may cut in. */
export const OVERTURE_MS = OVERTURE.holdMs + OVERTURE.collapseMs;

export type OverturePhase = "in" | "collapse" | "done";

/**
 * `enabled: false` (reduced motion, `/reset-password`) is `done` from the first render: the
 * wordmark must not flash on a screen that arrives with the sheet up.
 *
 * `enabled` can change after the first render — the reduced-motion answer only exists after
 * hydration (D8). The phase follows it during render (React's "adjust state when a prop changes"
 * pattern) rather than in an effect: turning off ends the overture at once, turning on starts it
 * from the top.
 */
export function useOverture(enabled: boolean): { phase: OverturePhase } {
  const [phase, setPhase] = React.useState<OverturePhase>(
    enabled ? "in" : "done",
  );
  const [wasEnabled, setWasEnabled] = React.useState(enabled);
  if (wasEnabled !== enabled) {
    setWasEnabled(enabled);
    setPhase(enabled ? "in" : "done");
  }

  React.useEffect(() => {
    if (!enabled) return;
    const a = setTimeout(() => setPhase("collapse"), OVERTURE.holdMs);
    const b = setTimeout(() => setPhase("done"), OVERTURE_MS);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [enabled]);

  return { phase: enabled ? phase : "done" };
}
