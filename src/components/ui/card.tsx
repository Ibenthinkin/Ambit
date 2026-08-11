import * as React from "react";

import { cn } from "~/lib/utils";

// The subtle raised surface behind a feed article card (Ambit - Feed.dc.html ~385-395) or a
// saved tile — barely-there fill and hairline border, distinguished from the page background
// mostly by the border. `radius` picks between the two card radii the handoff actually uses;
// `as` lets callers render `<article>` for a feed/saved item (semantically a piece of content)
// vs `<div>` for structural grouping.
export interface CardProps extends React.ComponentProps<"div"> {
  as?: "div" | "article";
  radius?: "card" | "tile";
}

export function Card({
  as = "div",
  radius = "card",
  className,
  ...rest
}: CardProps) {
  const Comp = as;
  return (
    <Comp
      className={cn(
        "border-hairline border-ink/8 bg-ink/3",
        radius === "card" ? "rounded-card" : "rounded-tile",
        className,
      )}
      {...rest}
    />
  );
}
