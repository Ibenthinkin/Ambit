import * as React from "react";

import { cn } from "~/lib/utils";

/**
 * The underline input (DESIGN §4.4): no box, no fill, no radius — one 1 px line under the text.
 * Rest `ink/28`, hover `ink/60`, focus: the line turns accent and a `box-shadow: 0 1px 0 accent`
 * thickens it to 2 px total (a shadow rather than a 2 px border, so the text doesn't jump).
 *
 * `outline-none` is deliberate: the underline IS the focus state, so the global
 * `:focus-visible` ring would double it. `--color-accent` is a plain `@theme` token, so
 * `focus:border-accent` reaches it directly.
 *
 * `size` is the display size — `md` 18 px, `lg` 22 px (the profile's desktop tabs) — and shadows
 * the HTML `size` attribute, which nothing here uses.
 */
export const INPUT_BASE =
  "border-0 border-b border-ink/28 bg-transparent text-ink placeholder:text-ink/34 hover:border-ink/60 focus:border-accent focus:shadow-[0_1px_0_var(--color-accent)] w-full px-0 py-2.5 font-sans transition-[border-color,box-shadow] duration-200 outline-none disabled:opacity-50 disabled:hover:border-ink/28";

export const INPUT_SIZES = {
  md: "text-[18px]",
  lg: "text-[22px]",
} as const;

export function Input({
  className,
  size = "md",
  ...rest
}: Omit<React.ComponentProps<"input">, "size"> & {
  size?: keyof typeof INPUT_SIZES;
}) {
  return (
    <input className={cn(INPUT_BASE, INPUT_SIZES[size], className)} {...rest} />
  );
}
