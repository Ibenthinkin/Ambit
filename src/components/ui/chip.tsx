import * as React from "react";

import { cn } from "~/lib/utils";

// Onboarding's interest chip (Ambit - Onboarding.dc.html): a pill toggle whose selected state
// swaps fill/border/text to the accent and plays the `chip-pop` squash-and-recover animation
// (globals.css — split from the prototype's overloaded "ambitpop" name, see PHASE5_PLAN.md
// Decision 6).
//
// The `serif` prop is gone as of Phase 5.4 — the redesign uses one typeface (Sora) everywhere, so
// there is no second family to switch into.
//
// `size="sm"` is the Saved screen's collection filter chip (5.9, `Ambit - Saved.dc.html`): the
// same pill at 12.5px/500 with tighter padding — and **no pop on select**. The pop belongs to
// onboarding, where toggling a chip is the screen's one event; Saved's chips are a filter row the
// reader flicks between, and a squash animation on every flick reads as noise. The prototype's own
// chips transition colors only, which the shared `transition ... duration-200` already covers.
export interface ChipProps extends React.ComponentProps<"button"> {
  selected?: boolean;
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
        "border-hairline rounded-pill inline-flex flex-none items-center leading-none font-medium whitespace-nowrap transition-[background-color,color,border-color] duration-200 select-none",
        size === "md"
          ? "px-[17px] py-[11px] text-[15px]"
          : "px-[15px] py-2 text-[12.5px]",
        selected
          ? cn(
              "bg-accent border-accent text-on-accent",
              size === "md" && "animate-chip-pop",
            )
          : "bg-ink/5 border-ink/12 text-ink/82",
        className,
      )}
      {...rest}
    />
  );
}
