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
export interface TextLinkProps extends Omit<React.ComponentProps<"a">, "href"> {
  href: string;
  external?: boolean;
  bracket?: boolean;
  tone?: "default" | "body";
}

export function TextLink({
  href,
  external = false,
  bracket = false,
  tone = "default",
  className,
  children,
  ...rest
}: TextLinkProps) {
  const classes = cn(
    "underline underline-offset-3 decoration-1 transition-colors",
    tone === "body" ? "text-ink" : "text-ink/78",
    "hover:text-white hover:decoration-accent",
    className,
  );
  const label = bracket ? <>[{children}..]</> : children;

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={classes}
        {...rest}
      >
        {label} <span aria-hidden="true">↗</span>
      </a>
    );
  }
  return (
    <Link href={href} className={classes} {...rest}>
      {label}
    </Link>
  );
}
