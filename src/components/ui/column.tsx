import * as React from "react";

import { cn } from "~/lib/utils";

/**
 * The three widths the desktop design needs, and no fourth. Literal `md:` classes on purpose —
 * Tailwind's scanner reads source text, so `` `md:max-w-[${px}px]` `` would generate no rule
 * and the column would quietly stay full-width.
 */
const WIDTHS = {
  /** Onboarding, saved, profile, edit profile, settings — anything list-shaped. */
  narrow: "md:max-w-[600px]",
  /** The item page: a book-width measure for body text. */
  reader: "md:max-w-[720px]",
  /** The feed: room for four ~270px masonry columns. */
  wide: "md:max-w-[1120px]",
} as const;

export interface ColumnProps extends React.ComponentProps<"div"> {
  width: keyof typeof WIDTHS;
}

/**
 * The whole desktop mechanism (docs/DESIGN_desktop-polish.md §1): a screen keeps its phone
 * composition and simply stops stretching. Below `md` this is a plain full-width `div`; above
 * it, a centered column. Screens keep their own horizontal padding *inside* it.
 */
export function Column({ width, className, children, ...rest }: ColumnProps) {
  return (
    <div className={cn("mx-auto w-full", WIDTHS[width], className)} {...rest}>
      {children}
    </div>
  );
}
