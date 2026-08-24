"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Bookmark, Plus } from "~/components/icons";
import { markSavedOrigin } from "~/components/saved/saved-origin";
import { itemCountLabel } from "~/components/sheets/collection-rows";

// One tile in Profile's collections grid (`Ambit - Profile.dc.html`). A square cover, a name and a
// count — the same three facts the collections *sheet* shows as a row, given a picture.
//
// The cover is the most recent image saved into the collection (`db/collections.ts`'s `withCovers`).
// A collection with no pictures in it — empty, or articles only — falls back to an outline bookmark
// on a bordered square, which is the same glyph-shows-the-affordance treatment Saved's empty state
// uses rather than an image placeholder that promises a picture there isn't.
export interface CollectionTileProps {
  id: string;
  name: string;
  itemCount: number;
  cover: string | null;
}

export function CollectionTile({
  id,
  name,
  itemCount,
  cover,
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
      {cover ? (
        // Not `next/image`: these are arbitrary remote museum URLs, the same reason every other
        // image surface in the app uses a plain `<img>`.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cover}
          alt=""
          className="aspect-square w-full rounded-[20px] object-cover"
        />
      ) : (
        <div className="border-hairline border-ink/10 bg-ink/3 flex aspect-square w-full items-center justify-center rounded-[20px]">
          <Bookmark size={26} className="text-ink/30" />
        </div>
      )}
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
      <div className="bg-ink/[4.5%] border-ink/16 flex aspect-square w-full items-center justify-center rounded-[20px] border-[0.5px] border-dashed">
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
