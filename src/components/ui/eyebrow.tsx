import * as React from "react";

import { cn } from "~/lib/utils";

// DESIGN_redesign §3.3 / §4.6 / §4.7. The app's one small label: Geist Mono, 10.5 px, uppercase,
// +0.4 px tracking, `ink/55` grey. It replaces the old accent-coloured Sora eyebrow (and its
// ~twenty near-variants) — an eyebrow is never green any more (§3.2: the accent has seven jobs
// and a label is not one of them).
//
// `dot` adds the leading 6 px green dot the Because and Ambit cards carry. The dot is the one
// accent-coloured part, and it is decoration, so it is `aria-hidden`.
//
// `as` picks the element (a heading when the eyebrow names a section); default is a `span`.
// The 2 px keyboard focus ring is global, so nothing outline-ish is added here.
export interface EyebrowProps extends React.HTMLAttributes<HTMLElement> {
  as?: React.ElementType;
  dot?: boolean;
}

export function Eyebrow({
  as: Tag = "span",
  dot = false,
  className,
  children,
  ...rest
}: EyebrowProps) {
  return (
    <Tag
      className={cn(
        "text-ink/55 font-mono text-[10.5px] leading-none font-normal tracking-[0.4px] uppercase",
        dot && "inline-flex items-center gap-2",
        className,
      )}
      {...rest}
    >
      {dot && (
        <span
          data-eyebrow-dot
          aria-hidden="true"
          className="bg-accent size-[6px] flex-none rounded-full"
        />
      )}
      {children}
    </Tag>
  );
}
