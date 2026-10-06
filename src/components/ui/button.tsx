import * as React from "react";

import { cn } from "~/lib/utils";

// DESIGN_redesign §4.1. Three variants, three sizes, square, weight 400. `shape` is gone (the
// pill and the rounded rect both went with the radius token), `accent` became `primary` and
// `ghost` became `outline`.
//
//   primary  the one bright fill: `bg-ink` with dark text. Hover goes pure white and gains a 2 px
//            green line along the bottom edge (an inset box-shadow, so it adds no height and
//            never shifts layout); pressed dims a step.
//   outline  transparent with a 1 px border; hover fills faintly, brightens the border and draws
//            the same green line.
//   link     no box at all — underlined text; hover whitens it and turns the underline green.
//
// Hover/pressed styling is dropped when disabled (a button that can't be pressed shouldn't react).
// `size` is ignored for `link` (no box to size; it keeps its own 15 px text).
// The keyboard focus ring is global (globals.css `:focus-visible`), so nothing is added here.
type ButtonVariant = "primary" | "outline" | "link";
type ButtonSize = "sm" | "md" | "lg";

// lg is the 56 px block (auth card, install confirmation); md is the default CTA; sm has no fixed
// height and is padded 6 × 14 (Settings' "Install", the intro card).
const sizeClasses: Record<ButtonSize, string> = {
  lg: "h-14 px-6 text-[17px]",
  md: "h-[46px] px-5 text-[15px]",
  sm: "px-[14px] py-1.5 text-[14px]",
};

// The green underline shared by primary and outline hover.
const HOVER_LINE = "hover:shadow-[inset_0_-2px_0_var(--color-accent)]";

export interface ButtonProps extends React.ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = "primary",
  size = "md",
  disabled,
  className,
  ...rest
}: ButtonProps) {
  const isLink = variant === "link";
  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        // Shared: centred, weight 400, sentence case, 150 ms on the four things that change.
        "inline-flex items-center justify-center gap-2 font-sans font-normal whitespace-nowrap transition-[background-color,box-shadow,border-color,color] duration-150 select-none",
        // A link keeps its own text size and has no fixed height or padding box.
        isLink ? "text-[15px]" : sizeClasses[size],
        variant === "primary" &&
          (disabled
            ? "text-ink/34 bg-white/12"
            : cn(
                "bg-ink text-on-accent hover:bg-white active:bg-[#E6E6E6]",
                HOVER_LINE,
              )),
        variant === "outline" &&
          (disabled
            ? "border-ink/16 text-ink/34 border"
            : cn(
                "border-ink/35 text-ink hover:border-ink border hover:bg-white/8",
                HOVER_LINE,
              )),
        isLink &&
          (disabled
            ? "text-ink/34"
            : "text-ink/78 hover:decoration-accent underline decoration-1 underline-offset-[3px] hover:text-white"),
        disabled ? "cursor-default" : "cursor-pointer",
        className,
      )}
      {...rest}
    />
  );
}
