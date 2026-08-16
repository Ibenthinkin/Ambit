"use client";

import * as React from "react";

import { cn } from "~/lib/utils";

// The row shape shared by the two collection sheets. They diverge in *behavior* — one saves, one
// navigates — but the row is one design: 9px dot, name, sub-label, hairline rule.
//
// Dot alphas come straight from the handoff: `accent` marks the collection an item is currently
// in, 25% is an ordinary collection, and 40%/18% are the two pseudo-rows the browse sheet adds
// ("Everything kept" and "New collection").
export type DotTone = "accent" | "normal" | "strong" | "faint";

const DOT_TONE: Record<DotTone, string> = {
  accent: "bg-accent",
  normal: "bg-ink/25",
  strong: "bg-ink/40",
  faint: "bg-ink/18",
};

export interface CollectionRowProps {
  label: string;
  sub: string;
  tone?: DotTone;
  onPick: () => void;
}

export function CollectionRow({
  label,
  sub,
  tone = "normal",
  onPick,
}: CollectionRowProps) {
  return (
    <button
      type="button"
      onClick={onPick}
      // Same rule as the pill's controls: a thumb resting here mid-scroll must not fire the row.
      onPointerDown={(e) => e.stopPropagation()}
      className="border-hairline border-ink/6 flex w-full items-center gap-[13px] rounded-[14px] border-b px-3 py-[14px] text-left transition-transform duration-150 active:scale-[0.99]"
    >
      <span
        className={cn("size-[9px] flex-none rounded-full", DOT_TONE[tone])}
      />
      <span className="min-w-0 flex-1">
        <span className="text-ink block truncate text-[15px]">{label}</span>
        <span className="text-ink/38 mt-0.5 block truncate text-[12px]">
          {sub}
        </span>
      </span>
    </button>
  );
}

/** "1 item" / "N items" — the sub-label every collection row falls back to. */
export function itemCountLabel(n: number): string {
  return n === 1 ? "1 item" : `${n} items`;
}

/**
 * The scrolling container for a list of rows. The scroll lives here rather than on the sheet shell
 * so the grabber and title stay pinned while the list moves under them — which is why
 * `BottomSheet` deliberately carries no horizontal padding of its own.
 */
export function CollectionRowList({ children }: { children: React.ReactNode }) {
  return <div className="min-h-0 flex-1 overflow-y-auto px-3">{children}</div>;
}
