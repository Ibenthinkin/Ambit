import * as React from "react";

import { cn } from "~/lib/utils";

// DESIGN_redesign §4.2. A toggle ("rather not see", Saved's filters, onboarding's pick-all).
//
//   off  transparent, a 1 px `ink/28` border, `ink/95` text. Hover or the keyboard cursor
//        brightens the border to `ink/70` and zooms the chip 1.05 over 350 ms.
//   on   `bg-ink` with dark text — the same "white when chosen" as the primary button.
//
// Square: no radius class. `aria-pressed` is strictly true/false — the old tri-state `mixed`
// (the umbrella-group chips) and the `chip-pop` squash animation are gone, along with the
// accent fill; the accent is only for attention now.
//
// The zoom is Tailwind v4's `scale-*`, i.e. the standalone `scale` property, so `scale` is what
// the transition names. `.motion-lift` (globals.css) exempts the chip from the reduced-motion
// collapse — Ben's machines run Reduce Motion, and a 5% zoom is not what the setting targets.
// The keyboard focus ring is global (`:focus-visible`), so nothing outline-ish is added here.
export interface ChipProps extends React.ComponentProps<"button"> {
  selected?: boolean;
  /** `sm` is Saved's filter chip: 13.5 px, 8 × 12. */
  size?: "md" | "sm";
}

export function Chip({
  selected = false,
  size = "md",
  className,
  ...rest
}: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "motion-lift inline-flex flex-none cursor-pointer items-center border leading-none font-normal whitespace-nowrap ease-out select-none",
        "transition-[background-color,color,border-color,scale] duration-350",
        "hover:scale-[1.05] focus-visible:scale-[1.05]",
        size === "md"
          ? "px-4 py-[11px] text-[16px]"
          : "px-3 py-2 text-[13.5px]",
        selected
          ? "bg-ink border-ink text-bg"
          : "border-ink/28 text-ink/95 hover:border-ink/70 bg-transparent",
        className,
      )}
      {...rest}
    />
  );
}
