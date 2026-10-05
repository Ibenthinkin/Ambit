"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { ArticleCard } from "~/components/feed/article-card";
import { ImageTile } from "~/components/feed/image-tile";
import type { CardTile } from "~/components/feed/masonry";
import { TILE_LIFT } from "~/components/feed/tile-lift";
import { WritingTile } from "~/components/feed/writing-tile";
import { Bookmark } from "~/components/icons";
import { Rise } from "~/components/ui/rise";
import { cn } from "~/lib/utils";

// One tile on the Saved masonry: the feed's own `ImageTile`/`ArticleCard`, unchanged, plus the
// prototype's one addition — an always-visible unsave badge in the top-right corner. No long-press
// and no item sheet here (the prototype has neither); the badge *is* the per-tile action, which is
// why the tiles' `onLongPress` went optional in this phase.
//
// The badge is a **sibling overlay**, not a child of the pressable tile: absolutely positioned
// over it, so its clicks resolve against the badge and never reach the tile's press handlers. The
// `onPointerDown` stopPropagation is the same rule as every `PillButton` — a thumb resting here
// mid-scroll must not arm the tile's press underneath.
//
// Since 10-04-26 the wrapper also carries the feed's Lift (`TILE_LIFT`): hover or keyboard focus
// scales wrapper, tile and badge together, 3.5% over 350 ms. docs/PLAN_tile-hover.md.

export interface SavedTileProps {
  /** Card tiles only — CORE cards never produce a Because tile, and Saved never asks for message
   *  tiles (see SavedScreen). */
  tile: CardTile;
  /** Fires with no arguments — the screen already knows which item this tile is. */
  onUnsave: () => void;
}

export function SavedTile({ tile, onUnsave }: SavedTileProps) {
  const router = useRouter();
  const { item } = tile.card;

  // Every tile opens the item page — a picture's is the merged screen since 09-10-26 (the gallery
  // at `/g/`, and the gallery-origin marker this used to write, are gone).
  //
  // Deliberately NO `markFeedOrigin` before this push. That marker semantically means "the *feed*
  // is one entry down"; writing it from here would make the item page's Escape and pill pop back
  // to Saved under a button labeled Feed. Accepted seam: leaving a Saved-opened item page pushes a
  // fresh `/feed?focus=` (browser back still returns here).
  const openItem = () => {
    router.push(`/i/${item.id}`);
  };

  // A writing tile with a picture wears the picture's glass badge: it is a picture underneath.
  const overPicture = tile.kind !== "article";

  return (
    // No stagger on the Rise: the prototype rises each tile individually at a fixed delay, and
    // `animate-rise` is the house version of that entrance.
    <Rise>
      {/* `group/tile` + the Lift (docs/PLAN_tile-hover.md Task 5): the same hover and keyboard
          lift as the feed's wrapper in feed-grid.tsx, so Saved is the same wall. The group name
          is what lets the dev tier tag (debug-badge.tsx) fill here too. The unsave badge below is
          inside this wrapper and rises with the picture. */}
      <div className={cn("group/tile", TILE_LIFT)} data-saved-id={item.id}>
        {tile.kind === "image" ? (
          <ImageTile
            card={tile.card}
            aspectClass={tile.aspectClass}
            onTap={openItem}
          />
        ) : tile.kind === "writing-picture" ? (
          <WritingTile
            card={tile.card}
            aspectClass={tile.aspectClass}
            onTap={openItem}
          />
        ) : (
          <ArticleCard card={tile.card} onTap={openItem} />
        )}
        {/* Two badge treatments from the prototype: a glass circle over imagery (needs the blur
            and stronger border to stay legible on arbitrary pictures), a flat one on the already-
            quiet article card. */}
        <button
          type="button"
          aria-label="Remove from Saved"
          onClick={onUnsave}
          onPointerDown={(e) => e.stopPropagation()}
          className={
            overPicture
              ? "border-hairline border-ink/16 bg-bg-app/62 absolute top-[9px] right-[9px] flex size-[30px] items-center justify-center rounded-full backdrop-blur-[8px]"
              : "border-hairline border-ink/10 bg-ink/5 absolute top-[12px] right-[12px] flex size-[28px] items-center justify-center rounded-full"
          }
        >
          <Bookmark
            filled
            size={overPicture ? 14 : 13}
            className="text-accent"
          />
        </button>
      </div>
    </Rise>
  );
}
