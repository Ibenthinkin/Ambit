"use client";

import * as React from "react";

// The kit's first range control, built for the dev knob panel (plan 09-05-26) and deliberately
// plain: a native <input type="range"> with `accent-color`, exactly what the Phase 0.5 bench
// used (phase0/feed.template.html:99-112). Native gets keyboard, focus rings and touch for free.
//
// **Commit on release, not on input.** Every commit costs the feed a request (and a page of
// corpus until it is forgotten), so a drag paints the number live and fires `onCommit` once,
// on pointer-up / key-up / blur, and only if the value actually moved. The panel therefore
// makes one request per gesture — the bench's "live, no apply button" feel without the spam.
export interface SliderProps {
  label: string;
  /** The committed value. The control keeps its own draft while a drag is in progress. */
  value: number;
  min: number;
  max: number;
  step: number;
  onCommit: (v: number) => void;
  /** How to paint the number. Default: two decimals for sub-integer steps, integer otherwise. */
  format?: (v: number) => string;
  /** One muted line under the track saying what the knob does. */
  note?: string;
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  onCommit,
  format,
  note,
}: SliderProps) {
  const id = React.useId();
  // `null` = no drag in progress, so the control shows the committed `value`. A parent-side change
  // (reset to defaults, a loaded preset) therefore wins automatically — there is no stale draft to
  // reconcile and no effect needed to do it. A drag sets a number; a release clears it.
  const [draft, setDraft] = React.useState<number | null>(null);
  const shown = draft ?? value;

  const paint =
    format ?? ((v: number) => (step < 1 ? v.toFixed(2) : String(v)));
  const commit = () => {
    if (draft !== null && draft !== value) onCommit(draft);
    setDraft(null);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-ink/62 text-[13px]">
          {label}
        </label>
        <b className="text-ink text-[13px] tabular-nums">{paint(shown)}</b>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={shown}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        className="w-full"
        style={{ accentColor: "var(--color-accent)" }}
      />
      {note ? (
        <p className="text-ink/40 text-[11px] leading-snug">{note}</p>
      ) : null}
    </div>
  );
}
