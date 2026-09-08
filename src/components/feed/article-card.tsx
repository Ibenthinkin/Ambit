"use client";

import * as React from "react";

import { useDesktopPress, usePress } from "~/hooks/use-press";
import { sourceLabel } from "~/lib/source-label";
import { cn } from "~/lib/utils";
import type { FeedCard } from "~/server/services/feed";
import { DebugBadge } from "./debug-badge";

// The feed's text tile: source eyebrow, headline, lede. **No body, no "read more", no per-card
// buttons** — like `ImageTile`, this is a doorway, not a destination; the article itself is one
// tap deeper.
//
// Square-cornered like the image tiles, deliberately: the redesign's feed is a single wall of
// full-bleed rectangles, and a rounded card in the middle of it reads as a different component
// from a different app. (There *is* a `--radius-card` token; it belongs to the item page's CTA
// card, not here.)
//
// The press-scale is local state rather than something `usePress` exposes: the hook is
// deliberately ref-only (it fires several times per gesture and re-rendering mid-press would be
// pure waste), so a component that genuinely wants to *look* pressed opts into the re-render
// itself. The image tiles don't — a photo that shrinks under the thumb looks like a bug.

export interface ArticleCardProps {
  card: FeedCard;
  onTap: () => void;
  /** Optional as of 5.9 — see `ImageTileProps.onLongPress`; Saved's cards have no item sheet. */
  onLongPress?: () => void;
}

export function ArticleCard({ card, onTap, onLongPress }: ArticleCardProps) {
  const press = usePress({ onTap, onLongPress });
  const desktop = useDesktopPress({ onTap, onLongPress });
  const [pressing, setPressing] = React.useState(false);
  const { item } = card;

  // Wrap, don't replace: every one of these still has to reach the gesture hook, or a press that
  // ends outside the card leaves the long-press timer running.
  const handlers = {
    ...press,
    onPointerDown: (e: React.PointerEvent) => {
      setPressing(true);
      press.onPointerDown(e);
    },
    onPointerUp: (e: React.PointerEvent) => {
      setPressing(false);
      press.onPointerUp(e);
    },
    onPointerCancel: () => {
      setPressing(false);
      press.onPointerCancel();
    },
    onPointerLeave: () => {
      setPressing(false);
      press.onPointerLeave();
    },
  };

  return (
    <div
      {...handlers}
      {...desktop}
      role="button"
      tabIndex={0}
      // The `<h2>` below already gives this a heading for a screen reader; this names the *button*
      // the wrapper has just become.
      aria-label={item.title}
      data-pressing={pressing ? "" : undefined}
      className={cn(
        // The hover lift is one step up the fill ladder, not a transform: this card has a border,
        // and scaling a hairline is how you get a blurry hairline. `hover:` and `focus-visible:`
        // are both pointer/keyboard-gated, so a phone sees neither (see `image-tile.tsx`).
        "border-hairline bg-ink/[3.5%] border-ink/7 focus-visible:outline-accent hover:bg-ink/[5%] relative block w-full cursor-pointer touch-manipulation border px-[14px] pt-4 pb-[14px] transition-transform duration-200 outline-none select-none focus-visible:outline-2 focus-visible:-outline-offset-2",
        pressing && "scale-[0.985]",
      )}
      style={{ WebkitTouchCallout: "none" }}
    >
      <p className="text-ink/34 text-[9.5px] font-semibold tracking-[1.3px] uppercase">
        {sourceLabel(item.source)}
      </p>
      <h2 className="text-ink-hi mt-[10px] text-[19px] leading-[1.25] font-semibold">
        {item.title}
      </h2>
      {/* **Clamped, and the prototype isn't** — a divergence forced by real data. Every lede in
          the prototype's fixture is hand-written editorial copy of a sentence or two; the actual
          `summary` column holds whatever the source's synopsis is, and Wikipedia's routinely runs
          600+ characters. Unclamped in a 196px column that's a twenty-five-line wall of text,
          which is the "no body, no expand affordance" rule broken by accident — at that length the
          lede *is* the body. Five lines clears the prototype's own longest lede untouched.
          `masonry.ts`'s height estimate caps at the same five, so packing still predicts the tile. */}
      {item.summary ? (
        <p className="text-ink/58 mt-[9px] line-clamp-5 text-[13.5px] leading-[1.52]">
          {item.summary}
        </p>
      ) : null}
      <DebugBadge card={card} />
    </div>
  );
}
