"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Plus } from "~/components/icons";
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
      className="w-full text-left transition-transform duration-150 active:scale-[0.98]"
    >
      <CoverMosaic covers={covers} className="aspect-square w-full" />
      <span className="text-ink mt-[10px] block truncate text-[15px] font-medium">
        {name}
      </span>
      <span className="text-ink/40 mt-[3px] block text-[12.5px]">
        {itemCountLabel(itemCount)}
      </span>
    </button>
  );
}

/**
 * The dashed tile that leads the grid — the only way to make a collection in the app. Its own
 * component rather than a branch inside `CollectionTile` because it shares nothing but the caption
 * geometry: no cover, no navigation, no id.
 */
export function NewCollectionTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      className="w-full text-left transition-transform duration-150 active:scale-[0.98]"
    >
      <div className="bg-ink/[4.5%] border-ink/16 flex aspect-square w-full items-center justify-center border-[0.5px] border-dashed">
        <Plus size={26} className="text-ink/55" />
      </div>
      <span className="text-ink mt-[10px] block text-[15px] font-medium">
        New collection
      </span>
      <span className="text-ink/40 mt-[3px] block text-[12.5px]">
        Group what you keep
      </span>
    </button>
  );
}
