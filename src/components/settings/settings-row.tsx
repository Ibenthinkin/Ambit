"use client";

import * as React from "react";

import { ChevronRight } from "~/components/icons";
import { cn } from "~/lib/utils";

// The chrome of `/settings` (`Ambit - Settings.dc.html`): a titled card of rows, and one row.
// Purely presentational — every behavior, including which rows are honest stubs, lives in
// `settings-screen.tsx`.
//
// **The chevron rule.** A row shows a chevron unless it has an `action` pill, which means the
// chevron is a claim: "this opens something". A row that merely displays a value (Muted sources'
// "None") still carries one, because tapping it still *does* something — even if in 5.10 that
// something is a "coming soon" toast. The one row with no chevron at all is Sign out, which is not
// a doorway.

export interface SettingsRowProps {
  icon: React.ReactNode;
  label: string;
  /** The right-aligned muted value, e.g. "English" or "3 topics". Omit for a bare row. */
  value?: string;
  /**
   * Renders `value` in the warn tint instead of the muted one — the app's `--color-error`, which is
   * the same `#D98C6A` the prototype uses for exactly this state. Notifications being *denied* is
   * the only place it's used: a permission the reader has to leave the app to fix.
   */
  warnValue?: boolean;
  /** A right-aligned accent pill instead of a chevron ("Install"). */
  action?: string;
  onClick?: () => void;
}

export function SettingsRow({
  icon,
  label,
  value,
  warnValue = false,
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
      className="flex w-full items-center gap-[13px] px-4 py-[15px] text-left"
    >
      <span className="text-ink/60 flex w-[26px] flex-none justify-center">
        {icon}
      </span>
      <span className="text-ink flex-1 truncate text-[15px]">{label}</span>
      {value ? (
        <span
          className={cn(
            "flex-none text-[13.5px]",
            warnValue ? "text-error" : "text-ink/42",
          )}
        >
          {value}
        </span>
      ) : null}
      {action ? (
        <span className="bg-accent text-on-accent rounded-pill flex-none px-[15px] py-[7px] text-[13px] font-semibold">
          {action}
        </span>
      ) : (
        <ChevronRight size={13} className="text-ink/32 flex-none" />
      )}
    </button>
  );
}

/**
 * A titled card of rows. The eyebrow sits *outside* the card (that's the design's own arrangement),
 * and the hairline dividers come from `divide-y` on the card rather than a border per row, so the
 * first and last rows can't accidentally carry one.
 */
export function SettingsGroup({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-[30px]">
      {title ? (
        <h2 className="text-ink/34 mx-1 mb-[10px] text-[11px] font-semibold tracking-[1.2px] uppercase">
          {title}
        </h2>
      ) : null}
      <div className="border-hairline border-ink/8 bg-ink/[3.5%] divide-ink/7 divide-y-[0.5px] overflow-hidden rounded-[18px]">
        {children}
      </div>
    </section>
  );
}
