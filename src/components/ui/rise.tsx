import * as React from "react";

// Wraps children in the shared "rise" entrance animation (globals.css) — fade + translateY(10px)
// on mount, used across most screens for section/card entrance. `delayMs` staggers a list of
// these (e.g. feed cards appearing one after another) via an inline `animation-delay`, since
// there's no way to vary a keyframe's timing per instance through a class name alone.
//
// `animationFillMode: "backwards"` overrides the token's `both` (10-05-26, the Lift's final
// review — docs/PLAN_tile-hover.md). The backwards half is what matters: it holds the `from`
// state through the stagger delay. The forwards half bought nothing — the keyframe ends at the
// element's natural state — and cost a stacking context: an animation that stays "in effect" on
// transform/opacity after it ends keeps one in Firefox, which trapped a lifted feed tile's
// z-index inside its Rise and let the next tile paint over its shadow.
export interface RiseProps {
  delayMs?: number;
  children: React.ReactNode;
}

export function Rise({ delayMs = 0, children }: RiseProps) {
  return (
    <div
      className="animate-rise"
      style={{
        animationDelay: `${delayMs}ms`,
        animationFillMode: "backwards",
      }}
    >
      {children}
    </div>
  );
}
