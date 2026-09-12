import * as React from "react";

import { cn } from "~/lib/utils";
import { Column, type ColumnProps } from "./column";

// Feed's sticky glass header (Ambit - Feed.dc.html ~32): frosted, translucent, sits above the
// scroll content on every screen that has one. Callers supply their own children (wordmark, icon
// button, back arrow, ...) — this primitive only owns the sticky/blur/border chrome that's
// common across screens, not any particular layout of content inside it.
//
// Desktop (docs/DESIGN_desktop-polish.md §1): the *chrome* stays full-width — a blur that stops
// at 600px would look like a mistake — but the content, padding included, sits in the same
// `narrow` column the screen's body uses, so a back button lines up with the body's left edge.
// `className` therefore lands on the inner column, where the flex layout lives, which is what
// every existing caller (`flex-col items-stretch` on Saved) was targeting anyway.
//
// `width` picks that column. `narrow` by default (`/dev/tokens` keeps it); Saved passes
// `wide` since 09-12-26 (docs/DESIGN_list-screens.md §6), because its body is the feed's column now.
export function GlassHeader({
  className,
  children,
  width = "narrow",
  ...rest
}: React.ComponentProps<"header"> & { width?: ColumnProps["width"] }) {
  return (
    <header
      // z-[8] mirrors the prototype's own stacking value — there's no `--z-*` theme namespace to
      // draw a name from (PHASE5_PLAN.md flagged this unverified; arbitrary value it is).
      className="bg-bg/66 border-ink/8 sticky top-0 z-[8] border-b-[0.5px] pt-14 pb-3 backdrop-blur-[18px] backdrop-saturate-[160%]"
      {...rest}
    >
      <Column
        width={width}
        className={cn("flex items-end justify-between px-5", className)}
      >
        {children}
      </Column>
    </header>
  );
}
