import * as React from "react";

import { cn } from "~/lib/utils";

// A ring spinner driven by the shared `spinner` keyframe (globals.css) — used anywhere the
// handoff implies a loading state (Feed's "load more" tail, an async sign-in submit). Two-tone
// (faint full track + accent-colored leading edge) rather than a single rotating arc, since
// that's the more legible construction at the small sizes every use case here needs.
export interface SpinnerProps {
  size?: number;
  className?: string;
}

export function Spinner({ size = 18, className }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label="Loading"
      style={{ width: size, height: size }}
      className={cn(
        "animate-spinner border-ink/20 border-t-accent inline-block rounded-full border-2",
        className,
      )}
    />
  );
}
