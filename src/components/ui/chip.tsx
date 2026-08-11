import * as React from "react";

import { cn } from "~/lib/utils";

// Onboarding's interest chip (Ambit - Onboarding.dc.html ~112-130): a pill toggle whose selected
// state swaps fill/border/text to the accent and plays the `chip-pop` squash-and-recover
// animation (globals.css — split from the prototype's overloaded "ambitpop" name, see
// PHASE5_PLAN.md Decision 6). `serif` switches the label typeface; Onboarding's chips default to
// serif (its `serifChips` prop defaults `true`), so this primitive does too.
export interface ChipProps extends React.ComponentProps<"button"> {
  selected?: boolean;
  serif?: boolean;
}

export function Chip({
  selected = false,
  serif = true,
  className,
  ...rest
}: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "border-hairline rounded-pill inline-flex flex-none items-center border px-[17px] py-[11px] leading-none font-medium whitespace-nowrap transition-[background-color,color,border-color] duration-200 select-none",
        serif ? "font-serif text-[16px]" : "font-sans text-[14px]",
        selected
          ? "bg-accent border-accent text-on-accent animate-chip-pop"
          : "bg-ink/5 border-ink/12 text-ink/82",
        className,
      )}
      {...rest}
    />
  );
}
