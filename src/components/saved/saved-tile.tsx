"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { ArticleCard } from "~/components/feed/article-card";
import { ImageTile } from "~/components/feed/image-tile";
import type { FeedTile } from "~/components/feed/masonry";
import { Bookmark } from "~/components/icons";
import { Rise } from "~/components/ui/rise";

// One tile on the Saved masonry: the feed's own `ImageTile`/`ArticleCard`, unchanged, plus the
// prototype's one addition — an always-visible unsave badge in the top-right corner. No long-press
// and no item sheet here (the prototype has neither); the badge *is* the per-tile action, which is
// why the tiles' `onLongPress` went optional in this phase.
//
// The badge is a **sibling overlay**, not a child of the pressable tile: absolutely positioned
// over it, so its clicks resolve against the badge and never reach the tile's press handlers. The
// `onPointerDown` stopPropagation is the same rule as every `PillButton` — a thumb resting here
// mid-scroll must not arm the tile's press underneath.

export interface SavedTileProps {
  /** Image and article tiles only — CORE cards never produce a Because tile (see SavedScreen). */
  tile: Exclude<FeedTile, { kind: "because" }>;
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

  return (
    // No stagger on the Rise: the prototype rises each tile individually at a fixed delay, and
    // `animate-rise` is the house version of that entrance.
    <Rise>
      <div className="relative" data-saved-id={item.id}>
        {tile.kind === "image" ? (
          <ImageTile
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
            tile.kind === "image"
              ? "border-hairline border-ink/16 bg-bg-app/62 absolute top-[9px] right-[9px] flex size-[30px] items-center justify-center rounded-full backdrop-blur-[8px]"
              : "border-hairline border-ink/10 bg-ink/5 absolute top-[12px] right-[12px] flex size-[28px] items-center justify-center rounded-full"
          }
        >
          <Bookmark
            filled
            size={tile.kind === "image" ? 14 : 13}
            className="text-accent"
          />
        </button>
      </div>
    </Rise>
  );
}
