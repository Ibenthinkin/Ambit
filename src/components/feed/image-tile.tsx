"use client";

import * as React from "react";

import { usePress } from "~/hooks/use-press";
import { cn } from "~/lib/utils";
import type { FeedCard } from "~/server/services/feed";
import { DebugBadge } from "./debug-badge";

// The feed's dominant tile: **the image and nothing else**. Square corners, no border, no title,
// no source line, no per-tile save button — the redesign's feed is a wall of pictures, and every
// piece of chrome added here is a piece of the wall taken away. Anything you might want to know
// about the item lives one tap deeper, on `/i/[itemId]`.
//
// The four iOS incantations on the wrapper (`select-none`, `touch-manipulation`,
// `-webkit-touch-callout: none`, plus `pointer-events-none` on the `<img>` itself) are all load-
// bearing together, as established on /dev/tokens: without them Safari raises its own
// image-callout menu or starts a text selection partway through a long press, and the gesture
// never completes.

export interface ImageTileProps {
  card: FeedCard;
  /** A literal Tailwind aspect class from `IMAGE_ASPECTS` — see masonry.ts on why literal. */
  aspectClass: string;
  onTap: () => void;
  onLongPress: () => void;
}

export function ImageTile({
  card,
  aspectClass,
  onTap,
  onLongPress,
}: ImageTileProps) {
  const press = usePress({ onTap, onLongPress });
  const [broken, setBroken] = React.useState(false);
  const { item } = card;

  return (
    <div
      {...press}
      className={cn(
        "relative block w-full cursor-pointer touch-manipulation overflow-hidden select-none",
        aspectClass,
      )}
      style={{ WebkitTouchCallout: "none" }}
    >
      {broken || !item.imageUrl ? (
        // Images are hotlinked straight from museum CDNs until the image proxy lands in 5.7, and
        // several of those bot-block third-party referrers — so a nonzero broken rate here is
        // expected, not a defect. It still has to hold its slot: collapsing the tile would
        // reshuffle the column under the reader's thumb.
        <div className="bg-ink/5 flex h-full w-full items-center justify-center">
          <span className="text-ink/40 text-[11px]">Image unavailable</span>
        </div>
      ) : (
        // A plain `<img>`, not `next/image`, and not an oversight. `next/image` needs every image
        // host declared in next.config.js — but this feed draws from an open, growing set of
        // museum CDNs (SPEC §6.1's five sources today, more in Phase 6, plus the private
        // ambit-archive/loupe hosts), so the allowlist would be a permanent maintenance tax that
        // silently breaks a source the day it's added. The real answer is the image proxy in 5.7,
        // which gives every image one origin; until then, plain and honest.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          loading="lazy"
          src={item.imageUrl}
          alt={item.title}
          onError={() => setBroken(true)}
          className="pointer-events-none block h-full w-full object-cover"
        />
      )}
      <DebugBadge card={card} />
    </div>
  );
}
