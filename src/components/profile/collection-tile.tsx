"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Plus } from "~/components/icons";
import { TILE_LIFT } from "~/components/feed/tile-lift";
import { markSavedOrigin } from "~/components/saved/saved-origin";
import { itemCountLabel } from "~/components/sheets/collection-rows";
import { CoverMosaic } from "./cover-mosaic";

// One tile in Profile's Collections tab (`Ambit - Profile.dc.html`, amended 09-12-26). A square
// face, a name and a count — the same three facts the collections *sheet* shows as a row, given
// pictures.
//
// The face is the four most recent images saved into the collection (`covers`, from
// `db/collections.ts`'s `withCovers`), painted by `CoverMosaic` as a square-cornered 2×2
// (docs/DESIGN_list-screens.md §2). A collection with no pictures in it — empty, or articles only —
// shows the mosaic's outline-bookmark placeholder instead.
const COUNT = "text-ink/55 mt-1 block font-mono text-[11px] uppercase";

export interface CollectionTileProps {
  id: string;
  name: string;
  itemCount: number;
  covers: string[];
}

export function CollectionTile({
  id,
  name,
  itemCount,
  covers,
}: CollectionTileProps) {
  const router = useRouter();

  return (
    // The Lift on a wrapper (the feed's and Saved's 1.035 zoom — DESIGN §6.5), so the face, name
    // and count rise together.
    <div className={TILE_LIFT}>
      <button
        type="button"
        data-collection-id={id}
        onClick={() => {
          // Identical to `CollectionsSheet.go` — one way into a filtered Saved, marker first so
          // Saved's own exits pop back here instead of rebuilding the feed (`saved-origin.ts`).
          markSavedOrigin();
          router.push(`/saved?collection=${encodeURIComponent(id)}`);
        }}
        // Same rule as every other tappable surface in the app: a thumb resting here mid-scroll
        // must not fire the tile.
        onPointerDown={(e) => e.stopPropagation()}
        className="w-full text-left transition-[scale] duration-150 active:scale-[0.98]"
      >
        {/* 2 px gaps and a hairline-only empty square on the tab (the prototype's numbers); the
          sheets' 38 px rows keep the component's 1 px defaults. */}
        <CoverMosaic
          covers={covers}
          className="border-ink/12 aspect-square w-full gap-0.5 bg-transparent"
        />
        <span className="text-ink mt-3 block truncate text-[17px]">{name}</span>
        <span className={COUNT}>{itemCountLabel(itemCount)}</span>
      </button>
    </div>
  );
}

/**
 * The dashed tile that leads the grid — the only way to make a collection in the app. Its own
 * component rather than a branch inside `CollectionTile` because it shares nothing but the caption
 * geometry: no cover, no navigation, no id.
 */
export function NewCollectionTile({ onClick }: { onClick: () => void }) {
  return (
    <div className={TILE_LIFT}>
      <button
        type="button"
        onClick={onClick}
        onPointerDown={(e) => e.stopPropagation()}
        className="w-full text-left transition-[scale] duration-150 active:scale-[0.98]"
      >
        {/* 1 px dashed ink/28, no fill (DESIGN §6.5). */}
        <div className="border-ink/28 flex aspect-square w-full items-center justify-center border border-dashed">
          <Plus size={26} className="text-ink/55" />
        </div>
        <span className="text-ink mt-3 block text-[17px]">New collection</span>
        <span className={COUNT}>Group what you keep</span>
      </button>
    </div>
  );
}
