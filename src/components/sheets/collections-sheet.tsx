"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { markSavedOrigin } from "~/components/saved/saved-origin";
import { BottomSheet } from "~/components/ui/bottom-sheet";
import { Spinner } from "~/components/ui/spinner";
import { api } from "~/trpc/react";
import {
  CollectionRow,
  CollectionRowList,
  itemCountLabel,
} from "./collection-rows";

// The **no-item-in-context** collection sheet — what the pill's bookmark opens on the feed, where
// there's no single "current item" to save. It browses rather than saves: every row navigates to
// Saved, filtered to that collection.
//
// This distinction is easy to miss and expensive to get wrong; it was recovered by reading the
// prototypes rather than the README (`Feed Masonry 3.dc.html:427-449` versus
// `Item Image.dc.html:231-243`). See `SaveToCollectionSheet` for the sibling that does save.
export interface CollectionsSheetProps {
  open: boolean;
  onClose: () => void;
}

export function CollectionsSheet({ open, onClose }: CollectionsSheetProps) {
  const router = useRouter();
  const collections = api.saves.collections.useQuery(undefined, {
    enabled: open,
  });
  const savedCount = api.saves.count.useQuery(undefined, { enabled: open });

  const go = (href: string) => {
    onClose();
    // Written immediately before the push, so the Saved screen's back-arrow (and its pill's Feed
    // button) can pop back to whatever screen opened this sheet instead of rebuilding the feed —
    // see `saved-origin.ts` for the corpus arithmetic behind that distinction.
    if (href.startsWith("/saved")) markSavedOrigin();
    router.push(href);
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Your collections"
      maxHeightPct={72}
    >
      {/* Both queries, not just the collections one: `count` resolves independently, and gating on
          `collections` alone rendered "Everything kept · 0 items" to a user who has plenty saved,
          then flipped it a moment later. */}
      {collections.isLoading || savedCount.isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : (
        <CollectionRowList>
          {/* Not a database row: "everything" is simply the unfiltered list. It leads because it's
              the one entry that always has something in it, and it's the only place an item saved
              outside any collection (a null `collection_id`) shows up. */}
          <CollectionRow
            label="Everything kept"
            sub={itemCountLabel(savedCount.data ?? 0)}
            tone="strong"
            onPick={() => go("/saved")}
          />

          {collections.data?.map((c) => (
            <CollectionRow
              key={c.id}
              label={c.name}
              sub={itemCountLabel(c.itemCount)}
              onPick={() => go(`/saved?collection=${encodeURIComponent(c.id)}`)}
            />
          ))}

          {/* Creating a collection lives on Profile (5.10) — the design puts it there, so this row
              is a signpost, not an affordance. Its sub-label says so out loud rather than opening
              something that doesn't exist yet. */}
          <CollectionRow
            label="New collection"
            sub="Make one on your profile"
            tone="faint"
            onPick={() => go("/profile")}
          />
        </CollectionRowList>
      )}
    </BottomSheet>
  );
}
