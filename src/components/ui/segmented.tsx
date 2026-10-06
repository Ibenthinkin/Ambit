"use client";

import * as React from "react";

import { cn } from "~/lib/utils";

// DESIGN_redesign §4.3. One 1 px `ink/22` outline around joined cells with a 1 px divider between
// them — the four-way level control on a topic row, and the reading amount.
//
// **A real radiogroup.** Exactly one option is chosen at a time, which is what `role="radiogroup"`
// / `role="radio"` + `aria-checked` mean (the old `aria-pressed` buttons announced "toggle
// button", which an exclusive choice is not). The group follows the ARIA radio pattern:
//
//   * **Roving tabindex** — only the checked radio is in the tab order (`tabIndex=0`, the rest
//     `-1`), so a keyboard reader crosses the whole control in one Tab press and then moves
//     *inside* it with the arrow keys. A reader never has to Tab through four cells per topic
//     row on a page of forty topics.
//   * **Arrow keys move the selection**, not just the focus — in a radio group, focus and
//     choice travel together — and call `onChange`. Right/Down go forward, Left/Up back, both
//     wrap, Home/End jump to the ends. `preventDefault` keeps the page from scrolling.
//
// The key handler lives on each radio and only claims the keys above, so a `BottomSheet`'s own
// document-level handler (Escape closes, Tab traps — see `bottom-sheet.tsx`) is undisturbed:
// arrows are not its business, and the sheet's trap ignores `tabindex="-1"` controls so a Tab
// from the checked radio leaves the group in one press.
//
// Square: no radius class anywhere. The keyboard focus ring is the global `:focus-visible` rule,
// except the offset: §3.4 gives this control 2 px where the global rule says 3 px, because
// the cells are packed tight and a 3 px ring would cover the neighbour's divider.
export interface SegmentedOption<T extends string> {
  key: T;
  label: string;
  /**
   * `"muted"` is the selected look of a "not this" option — a topic's "off" is not an
   * achievement, so it reads `#2A2A2A` rather than the bright selected white.
   */
  tone?: "muted";
}

export interface SegmentedProps<T extends string> {
  /** The group's accessible name — what the control sets, e.g. "Reading amount". */
  label: string;
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: SegmentedProps<T>) {
  const radios = React.useRef<(HTMLButtonElement | null)[]>([]);

  // Select the option at `index` (wrapping) and carry focus to it. Focus is moved by hand,
  // straight away, because the roving `tabIndex` only updates on the next render and a
  // `tabindex="-1"` button is still programmatically focusable.
  const moveTo = (index: number) => {
    const next = options[(index + options.length) % options.length];
    if (!next) return;
    radios.current[options.indexOf(next)]?.focus();
    if (next.key !== value) onChange(next.key);
  };

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        moveTo(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        moveTo(index - 1);
        break;
      case "Home":
        moveTo(0);
        break;
      case "End":
        moveTo(options.length - 1);
        break;
      default:
        return; // not ours — Tab, Escape and the rest go on to whoever wants them
    }
    e.preventDefault();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="border-ink/22 divide-ink/22 inline-flex items-stretch divide-x border"
    >
      {options.map((option, i) => {
        const checked = option.key === value;
        return (
          <button
            key={option.key}
            ref={(el) => {
              radios.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onKeyDown={(e) => onKeyDown(e, i)}
            onClick={() => {
              // A click on the already-chosen cell fires nothing — a controlled component
              // shouldn't make its caller no-op a redundant write (a stray tap on "some" must
              // not re-save a pick that hasn't changed).
              if (checked) return;
              onChange(option.key);
            }}
            className={cn(
              "cursor-pointer px-[7px] py-[9px] font-mono text-[9.5px] whitespace-nowrap uppercase transition-[background-color,color,box-shadow] duration-200 md:px-[11px] md:text-[10.5px]",
              "focus-visible:outline-offset-2",
              checked
                ? option.tone === "muted"
                  ? "text-ink/78 bg-[#2A2A2A]"
                  : "bg-ink text-bg"
                : // Hover: a faint lift, brighter text, and the 2 px green inset underline.
                  "text-ink/62 hover:text-ink bg-transparent hover:bg-white/8 hover:shadow-[inset_0_-2px_0_var(--color-accent)]",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
