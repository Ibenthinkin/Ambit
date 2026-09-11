"use client";

import * as React from "react";

import { BottomSheet } from "~/components/ui/bottom-sheet";
import type { SaveDrift } from "~/lib/save-toast";
import { Spinner } from "~/components/ui/spinner";
import { writeLastCollectionId } from "~/lib/last-collection";
import { api } from "~/trpc/react";
import {
  CollectionRow,
  CollectionRowList,
  NewCollectionRow,
  itemCountLabel,
} from "./collection-rows";

// The **item-in-context** collection sheet — the one opened from an item page's pill, where "the
// current item" is unambiguous. Picking a row saves the item there and closes; so does making a
// new collection with the last row (09-10-26), which files the item into what it makes.
//
// Its sibling, `CollectionsSheet`, looks nearly identical and does something completely different
// (it browses, from the feed pill, where there is no current item). They are deliberately two
// components over one shell rather than one component with a `mode` flag: the moment they merge,
// this file's "Already saved here" logic starts leaking into a sheet that has no item to say it
// about. See docs/PHASE5_PLAN_5.5.md, "Settled at plan time".
export interface SaveToCollectionSheetProps {
  open: boolean;
  onClose: () => void;
  itemId: string;
  /** Which collection the item is in right now, if any — drives the accent dot. */
  currentCollectionId?: string;
  /**
   * The slot the card was served under, when opened from a feed tile — the save bumps it
   * (docs/DESIGN_chrome-redesign.md §5). The item screen passes none.
   */
  topicId?: string | null;
  /**
   * Called after a successful save. Carries the id as well as the name because the caller almost
   * always needs both: the name to toast with, and the id to move its own `currentCollectionId` to
   * so reopening the sheet shows the accent dot on the right row. `drift` (Phase 6.1) is what the
   * save just taught the feed — null on a move between collections — so callers can build the
   * combined toast via `saveToastText`.
   */
  onSaved: (collection: { id: string; name: string }, drift: SaveDrift) => void;
  /**
   * Called if the write fails. Required, not optional, and deliberately so: the sheet dismisses the
   * instant a row is picked, so without this a failed save — an expired session, a dropped
   * connection, the router's own NOT_FOUND — is completely indistinguishable from a successful one.
   * The user walks away believing the item was filed.
   */
  onError: (message: string) => void;
  /** Desktop popover anchoring — passed straight to `BottomSheet`. See its `anchor` doc. */
  anchor?: DOMRect | null;
  placement?: "left" | "below";
}

export function SaveToCollectionSheet({
  open,
  onClose,
  itemId,
  currentCollectionId,
  topicId,
  onSaved,
  onError,
  anchor,
  placement,
}: SaveToCollectionSheetProps) {
  const utils = api.useUtils();
  // `enabled: open` — the sheet's data is worthless until it's on screen, and every screen in the
  // app mounts one of these.
  const collections = api.saves.collections.useQuery(undefined, {
    enabled: open,
  });
  const saveToCollection = api.saves.saveToCollection.useMutation({
    onSuccess: async (result, variables) => {
      // Every save moves the feed's hover strips to this collection (last-collection.ts).
      writeLastCollectionId(variables.collectionId);
      // Counts on every row just changed, and so did whatever list the caller is showing.
      await Promise.all([
        utils.saves.collections.invalidate(),
        utils.saves.list.invalidate(),
        utils.saves.count.invalidate(),
      ]);
      onSaved(
        { id: variables.collectionId, name: result.collectionName },
        result.drift,
      );
    },
    onError: (error) => {
      onError(
        error.data?.code === "UNAUTHORIZED"
          ? "Your session expired — sign in and try again."
          : "Couldn't save that. Try again.",
      );
    },
  });

  const pick = (collectionId: string) => {
    if (saveToCollection.isPending) return; // double-tap guard
    onClose(); // close first: the design's sheet dismisses immediately, the write settles behind it
    saveToCollection.mutate({
      itemId,
      collectionId,
      topicId: topicId ?? undefined,
    });
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      anchor={anchor}
      placement={placement}
      title="Save to collection"
      maxHeightPct={72}
    >
      {collections.isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : (
        <CollectionRowList>
          {collections.data?.map((c) => {
            const isCurrent = c.id === currentCollectionId;
            return (
              <CollectionRow
                key={c.id}
                label={c.name}
                sub={
                  isCurrent ? "Already saved here" : itemCountLabel(c.itemCount)
                }
                tone={isCurrent ? "accent" : "normal"}
                onPick={() => pick(c.id)}
              />
            );
          })}
          {/* Made with an item in hand: file it there at once, exactly as picking a row does. */}
          <NewCollectionRow onCreate={(c) => pick(c.id)} />
        </CollectionRowList>
      )}
    </BottomSheet>
  );
}
