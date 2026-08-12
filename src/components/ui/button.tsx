import * as React from "react";

import { cn } from "~/lib/utils";

// The two CTA shapes the prototypes use everywhere: Landing's full-width primary button
// (Ambit - Landing.dc.html ~140-152, `rounded`/14px-radius) and Onboarding's compact pill CTA
// (~130-142, `pill`/999px-radius). Both share the same accent/ghost + disabled treatment — only
// the corner radius and default padding differ, which is why `shape` and `size` are independent
// knobs rather than folding everything into one `variant` union.
type ButtonVariant = "accent" | "ghost";
type ButtonSize = "sm" | "md" | "lg";
type ButtonShape = "pill" | "rounded";

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-4 py-2 text-[13px]",
  md: "px-5 py-3 text-[14.5px]",
  lg: "px-6 py-4 text-[15.5px]",
};

// Tailwind auto-generates a `rounded-<name>` utility for every `--radius-<name>` token in
// globals.css's `@theme` block — no config-file mapping needed, this just names which one.
const shapeClasses: Record<ButtonShape, string> = {
  pill: "rounded-pill",
  rounded: "rounded-input",
};

export interface ButtonProps extends React.ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  shape?: ButtonShape;
}

export function Button({
  variant = "accent",
  size = "md",
  shape = "pill",
  disabled,
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        // Shared chrome: every CTA in the handoff is a solid/ghost pill or rounded rect with a
        // 0.5px border, system-sans, semibold, centered, no text selection on tap.
        "border-hairline inline-flex items-center justify-center gap-2 font-sans font-semibold tracking-[0.2px] whitespace-nowrap transition-[opacity,background-color,color,border-color] duration-200 select-none",
        sizeClasses[size],
        shapeClasses[shape],
        // Disabled state (Onboarding's "Pick N more" CTA) reuses the ghost fill/border ladder
        // stops regardless of `variant` — an accent button that can't be pressed shouldn't still
        // look accent-colored. (Prototype used one-off 0.07/0.10 alphas here; normalized to the
        // ladder's nearest named stops per PHASE5_PLAN.md Decision 1.)
        variant === "accent" &&
          (disabled
            ? "bg-ink/5 border-ink/12 text-ink/38"
            : "bg-accent border-accent text-on-accent"),
        variant === "ghost" &&
          (disabled
            ? "bg-ink/5 border-ink/12 text-ink/38"
            : "bg-ink/5 border-ink/12 text-ink/82"),
        disabled ? "cursor-default" : "cursor-pointer",
        className,
      )}
      {...rest}
    />
  );
}
