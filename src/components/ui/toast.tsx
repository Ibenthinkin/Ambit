"use client";

import * as React from "react";

import { cn } from "~/lib/utils";

// Feed's ephemeral confirmation toast: since the 1b redesign (DESIGN §4.6) a square white block
// (`bg-ink`) of dark Geist Mono caps — no radius, no blur, no shadow — centered, that fades in,
// holds, then dismisses itself. The component owns its own dismiss timer rather than making every
// caller wire up a `setTimeout` — callers just flip `open` to `true` and handle `onDone`
// (typically by setting their own `open` state back to `false`).
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
  /**
   * Lifts the toast clear of the floating pill toolbar. The handoff specifies the toast's bottom
   * offset as "46-120px depending on screen" — that range is exactly this distinction: 46px on a
   * screen with no pill, higher on one where the pill occupies the bottom 26px plus its own height.
   */
  raised?: boolean;
}

export function Toast({
  text,
  open,
  onDone,
  durationMs = 1800,
  raised = false,
}: ToastProps) {
  React.useEffect(() => {
    if (!open) return;
    const id = setTimeout(onDone, durationMs);
    return () => clearTimeout(id);
  }, [open, durationMs, onDone]);

  if (!open) return null;

  return (
    // `fixed`, not `absolute` — same reason as BottomSheet and PillToolbar: no page in the app
    // establishes a positioning context, so `absolute` resolved against the initial containing
    // block and painted the toast ~46px above the *first viewport* of a long page. A toast that
    // confirms an action has to appear where the user is, and a failed-save message that scrolls
    // off-screen is worse than none at all.
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 z-[50] flex justify-center",
        raised ? "bottom-[92px]" : "bottom-[46px]",
      )}
    >
      {/* `role="status"` + polite: the text is also said aloud, without cutting off whatever a
          screen reader is in the middle of. A toast is sometimes the only word an action gets
          ("Keep at least one topic.", "Couldn't save that — try again."), so seeing it can't be
          the only way to get it. */}
      <div
        role="status"
        aria-live="polite"
        className="animate-toast-in bg-ink text-on-accent px-[14px] py-[10px] font-mono text-[11px] tracking-[0.3px] whitespace-nowrap uppercase"
      >
        {text}
      </div>
    </div>
  );
}
