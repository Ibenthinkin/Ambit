"use client";

import * as React from "react";

import { cn } from "~/lib/utils";

// Saved's filter row (Ambit - Saved.dc.html ~245-262): a row of pill toggles where exactly one
// is active at a time — a single-select segmented control, not a tab list (there are only ever
// 2-3 options in the handoff, so no roving-focus/arrow-key affordance is implemented).
export interface SegmentedOption<T extends string> {
  key: T;
  label: string;
}

export interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: SegmentedProps<T>) {
  return (
    <div className="flex items-center gap-2">
      {options.map((option) => {
        const active = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            aria-pressed={active}
            onClick={() => {
              // Guard against re-firing onChange for a click on the already-active segment —
              // the prototype's handler is unconditional, but a controlled component shouldn't
              // ask its caller to no-op a redundant state update.
              if (active) return;
              onChange(option.key);
            }}
            className={cn(
              "border-hairline rounded-pill border px-[15px] py-2 font-sans text-[12.5px] font-medium whitespace-nowrap transition-[background-color,color,border-color] duration-200",
              active
                ? "bg-accent border-accent text-on-accent"
                : "bg-ink/5 border-ink/12 text-ink/62",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
