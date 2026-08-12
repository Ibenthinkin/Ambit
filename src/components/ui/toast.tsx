"use client";

import * as React from "react";

// Feed's ephemeral confirmation toast (Ambit - Feed.dc.html ~158-165): a centered glass pill
// that fades in, holds, then dismisses itself. The component owns its own dismiss timer rather
// than making every caller wire up a `setTimeout` — callers just flip `open` to `true` and
// handle `onDone` (typically by setting their own `open` state back to `false`).
//
// Porting note (PHASE5_PLAN.md): the prototype's keyframe bakes `translate(-50%, ...)` into the
// same transform that also does the vertical rise, which makes horizontal centering load-bearing
// on an animation. Here the outer wrapper centers with `left-1/2 -translate-x-1/2` (static,
// never animated) and only the inner pill animates opacity + Y via `animate-toast-in`.
export interface ToastProps {
  text: string;
  open: boolean;
  onDone: () => void;
  durationMs?: number;
}

export function Toast({ text, open, onDone, durationMs = 1800 }: ToastProps) {
  React.useEffect(() => {
    if (!open) return;
    const id = setTimeout(onDone, durationMs);
    return () => clearTimeout(id);
  }, [open, durationMs, onDone]);

  if (!open) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[46px] z-[50] flex justify-center">
      <div className="border-hairline animate-toast-in shadow-toast bg-overlay/92 rounded-pill border-ink/12 text-ink px-[18px] py-[11px] font-sans text-[13px] whitespace-nowrap backdrop-blur-[12px]">
        {text}
      </div>
    </div>
  );
}
