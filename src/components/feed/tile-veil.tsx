"use client";

import { TEXT_LINK } from "~/components/ui/text-link";
import { cn } from "~/lib/utils";

// The veil (docs/DESIGN_more-or-less.md D6; the explorations page's "Less of this · just
// tapped"): what a feed card becomes the moment the reader says "Less of this". It is covered **in
// place**, never removed — taking the tile out would re-pack the masonry and slide every card
// below it, which is exactly the jolt a calm feed must not make under the reader's thumb.
//
// So the veil is an absolutely positioned *sibling* of the tile inside the `group/tile relative`
// wrapper (FeedGrid) — the hover strip's pattern, and the Saved badge's before it. Absolute means
// it takes no space of its own, so the column's height cannot change; sibling means a press on it
// never reaches the tile's own press handlers (the pointer-down is stopped here as well, so a
// long-press can't start through it either).
//
// The card is already `seen_item` server-side (feedback.set writes it), so the next load skips it.
// "[Undo..]" takes the verdict back; the veil lifts because the screen's `feedback.mine` no longer
// lists the item.

export interface TileVeilProps {
  onUndo: () => void;
}

export function TileVeil({ onUndo }: TileVeilProps) {
  return (
    <div
      data-testid="tile-veil"
      onPointerDown={(e) => e.stopPropagation()}
      className="bg-bg/82 absolute inset-0 flex flex-col items-center justify-center gap-[10px]"
    >
      <span className="text-ink/78 font-mono text-[11px] uppercase">
        Less of this
      </span>
      {/* TextLink's look on a <button>: it does something, it goes nowhere. The brackets are
          typography, hidden from AT, so the button's name is "Undo". */}
      <button
        type="button"
        onClick={onUndo}
        // Full ink, as the explorations draw it (TextLink's `tone="body"`).
        className={cn(TEXT_LINK, "text-ink text-[14px]")}
      >
        <span aria-hidden="true">[</span>
        Undo
        <span aria-hidden="true">..]</span>
      </button>
    </div>
  );
}
