"use client";

import * as React from "react";

import { Eyebrow } from "~/components/ui/eyebrow";
import { cn } from "~/lib/utils";

// The chrome of `/profile/settings` (DESIGN_redesign §6.5, `Ambit - Profile Desktop.dc.html`'s
// Settings tab): a mono group header over an `ink/16` rule, then rows with `ink/8` hairlines.
// **No cards and no row icons.** Purely presentational — every behavior, including which rows are
// honest stubs, lives in `settings-screen.tsx`.
//
// **The arrow rule.** A row ends in a mono `→` unless it has an `action` (a small white square,
// "Install"), because the arrow is a claim: "this opens something". Sign out is not a doorway and
// carries neither.

export interface SettingsRowProps {
  label: string;
  /** The right-aligned mono value, e.g. "English" or "3 topics". Omit for a bare row. */
  value?: string;
  /**
   * The green 6 px attention dot, drawn before the value. Notifications being *denied* is the only
   * place it's used: a permission the reader has to leave the app to fix. It replaces the old
   * error-coloured value (1b has no error colour, DESIGN §3.2). Decoration only — the value's own
   * words ("Off") carry the meaning.
   */
  attention?: boolean;
  /**
   * Show the value as written rather than in the mono uppercase — for an email address, which
   * reads wrong shouted ("Get in touch").
   */
  verbatim?: boolean;
  /** A right-aligned label set like a small primary button instead of an arrow ("Install"). */
  action?: string;
  onClick?: () => void;
}

export function SettingsRow({
  label,
  value,
  attention = false,
  verbatim = false,
  action,
  onClick,
}: SettingsRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      // Same rule as every other tappable row in the app: a thumb resting here mid-scroll must not
      // fire it.
      onPointerDown={(e) => e.stopPropagation()}
      className="border-ink/8 flex w-full items-center gap-3 border-b py-4 text-left"
    >
      <span className="text-ink flex-1 truncate text-[18px]">{label}</span>
      {attention ? (
        <span
          data-attention-dot
          aria-hidden="true"
          className="bg-accent size-[6px] flex-none rounded-full"
        />
      ) : null}
      {value ? (
        <span
          className={cn(
            "text-ink/55 flex-none font-mono text-[11px]",
            !verbatim && "uppercase",
          )}
        >
          {value}
        </span>
      ) : null}
      {action ? (
        // Drawn as Button's `primary` at `sm` (DESIGN §4.1: white, dark text, square) rather than
        // rendered as a <Button>: the whole row is already the button, and buttons don't nest.
        <span className="bg-ink text-on-accent flex-none px-[14px] py-[6px] text-[14px]">
          {action}
        </span>
      ) : (
        <span
          aria-hidden="true"
          className="text-ink/40 flex-none font-mono text-[13px]"
        >
          →
        </span>
      )}
    </button>
  );
}

/**
 * A titled run of rows: the mono header sits over an `ink/16` rule and the rows' own bottom
 * hairlines do the dividing. Untitled, it is the Sign out slot — two `ink/16` rules around one row.
 */
export function SettingsGroup({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      {title ? (
        <Eyebrow
          as="h2"
          className="border-ink/16 block border-b pb-[10px] text-[11px]"
        >
          {title}
        </Eyebrow>
      ) : null}
      {children}
    </section>
  );
}
