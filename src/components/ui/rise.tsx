import * as React from "react";

// Wraps children in the shared "rise" entrance animation (globals.css) — fade + translateY(10px)
// on mount, used across most screens for section/card entrance. `delayMs` staggers a list of
// these (e.g. feed cards appearing one after another) via an inline `animation-delay`, since
// there's no way to vary a keyframe's timing per instance through a class name alone.
export interface RiseProps {
  delayMs?: number;
  children: React.ReactNode;
}

export function Rise({ delayMs = 0, children }: RiseProps) {
  return (
    <div className="animate-rise" style={{ animationDelay: `${delayMs}ms` }}>
      {children}
    </div>
  );
}
