import Link from "next/link";
import * as React from "react";

import { cn } from "~/lib/utils";

// DESIGN_redesign §4.6. An underlined link: 3 px offset, `ink/78` (or full `ink` with
// `tone="body"`, for a link inside running copy). Hover turns the text white and the underline
// accent — the accent's "hovered link's underline colour" job (§3.2). The focus ring is global.
//
// Two optional forms:
//   external  opens in a new tab (`noopener noreferrer`) and appends `↗` — "from <source> ↗".
//   bracket   wraps the label as `[Read on Wikipedia..]`.
//
// One component, two elements: an internal href renders Next's <Link> (client-side navigation,
// prefetch); `external` renders a plain <a>, because Link is for in-app routes. An `href` that
// is not a path (http(s):, mailto:) should be passed with `external`.
/** `↗` followed by U+FE0E, the text-presentation selector. A bare U+2197 has an emoji form, and
 *  iOS draws it as a blue emoji tile rather than the font's arrow; the selector asks for the
 *  glyph. Exported so tests can name it. */
export const ARROW = "↗︎";

/** The link's look as one string, for the rare `<button>` that must wear it (auth-card's). */
export const TEXT_LINK =
  "underline underline-offset-3 decoration-1 transition-colors text-ink/78 hover:text-white hover:decoration-accent";

export interface TextLinkProps extends Omit<React.ComponentProps<"a">, "href"> {
  href: string;
  /** Internal links only: replace the history entry instead of pushing one. */
  replace?: boolean;
  external?: boolean;
  bracket?: boolean;
  tone?: "default" | "body";
}

export function TextLink({
  href,
  external = false,
  bracket = false,
  tone = "default",
  replace,
  className,
  children,
  ...rest
}: TextLinkProps) {
  const classes = cn(TEXT_LINK, tone === "body" && "text-ink", className);
  // The brackets are typography, not words: hidden from AT so the link's name is the label alone.
  const label = bracket ? (
    <>
      <span aria-hidden="true">[</span>
      {children}
      <span aria-hidden="true">..]</span>
    </>
  ) : (
    children
  );

  if (external) {
    return (
      <a
        {...rest}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={classes}
      >
        {label} <span aria-hidden="true">{ARROW}</span>
      </a>
    );
  }
  return (
    <Link href={href} replace={replace} className={classes} {...rest}>
      {label}
    </Link>
  );
}
