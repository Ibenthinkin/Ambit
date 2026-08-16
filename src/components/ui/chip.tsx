import * as React from "react";

import { cn } from "~/lib/utils";

// Onboarding's interest chip (Ambit - Onboarding.dc.html): a pill toggle whose selected state
// swaps fill/border/text to the accent and plays the `chip-pop` squash-and-recover animation
// (globals.css — split from the prototype's overloaded "ambitpop" name, see PHASE5_PLAN.md
// Decision 6).
//
// The `serif` prop is gone as of Phase 5.4 — the redesign uses one typeface (Sora) everywhere, so
// there is no second family to switch into. The Saved screen's filter chip (5.9) is a smaller
// 12.5px/500 variant of this same pill; it gets added as a size prop when that screen is built,
// rather than guessed at now.
export interface ChipProps extends React.ComponentProps<"button"> {
  selected?: boolean;
}

export function Chip({ selected = false, className, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "border-hairline rounded-pill inline-flex flex-none items-center px-[17px] py-[11px] text-[15px] leading-none font-medium whitespace-nowrap transition-[background-color,color,border-color] duration-200 select-none",
        selected
          ? "bg-accent border-accent text-on-accent animate-chip-pop"
          : "bg-ink/5 border-ink/12 text-ink/82",
        className,
      )}
      {...rest}
    />
  );
}
