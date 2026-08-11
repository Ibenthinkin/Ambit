import * as React from "react";

import { cn } from "~/lib/utils";

// Feed's sticky glass header (Ambit - Feed.dc.html ~32): frosted, translucent, sits above the
// scroll content on every screen that has one. Callers supply their own children (wordmark, icon
// button, back arrow, ...) — this primitive only owns the sticky/blur/border chrome that's
// common across screens, not any particular layout of content inside it.
export function GlassHeader({
  className,
  children,
  ...rest
}: React.ComponentProps<"header">) {
  return (
    <header
      // z-[8] mirrors the prototype's own stacking value — there's no `--z-*` theme namespace to
      // draw a name from (PHASE5_PLAN.md flagged this unverified; arbitrary value it is).
      className={cn(
        "bg-bg/66 border-ink/8 sticky top-0 z-[8] flex items-end justify-between border-b-[0.5px] px-5 pt-14 pb-3 backdrop-blur-[18px] backdrop-saturate-[160%]",
        className,
      )}
      {...rest}
    >
      {children}
    </header>
  );
}
