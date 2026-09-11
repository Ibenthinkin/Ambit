"use client";

import * as React from "react";
import { createPortal } from "react-dom";

import { Bookmark, ChevronDown } from "~/components/icons";
import { SaveToCollectionSheet } from "~/components/sheets/save-to-collection-sheet";
import {
  useLastCollection,
  writeLastCollectionId,
} from "~/lib/last-collection";
import { saveToastText } from "~/lib/save-toast";
import { cn } from "~/lib/utils";
import type { FeedCard } from "~/server/services/feed";
import { api } from "~/trpc/react";

// The hover strip (docs/DESIGN_chrome-redesign.md §3, decision 2 — Cosmos's feed): two controls
// across the top of a tile that appear on hover. Left, a pill naming the collection a save will go
// into (the last one used on this device); right, a save glyph that files the item there in **one
// click**. The pill's chevron opens the ordinary picker, floating under it.
//
// Mounted by `FeedScreen` only under `HOVER_QUERY` — a real hover and a fine pointer. A strip that
// is merely invisible on a phone would still catch taps across the top of every tile, so on touch
// it does not exist. It is a *sibling* of the tile inside the `group/tile relative` wrapper, never
// a child: the tile's own press handlers, `pointer-events-none` image and e2e selectors all stay
// exactly as they were (the `SavedTile` badge set this pattern).
//
// Saved-state comes from `saves.ids`, one list for the whole feed, and the save is optimistic on
// it — the glyph lights the instant it is clicked and rolls back if the write fails.

/** The unsave badge's glass (saved-tile.tsx), which is what a control over a picture needs. */
const GLASS =
  "border-hairline border-ink/16 bg-bg-app/62 backdrop-blur-[8px] text-ink-hi";

export interface TileActionsProps {
  card: FeedCard;
  /** The feed's toast — the strip has none of its own. */
  onToast: (message: string) => void;
}

// The README's rule for every save/share control: a pointer resting here must not also press the
// tile underneath.
const stop = (e: React.PointerEvent) => e.stopPropagation();

export function TileActions({ card, onToast }: TileActionsProps) {
  const utils = api.useUtils();
  // Shared by every strip on the page: React Query dedupes by key, so this is one request.
  const collections = api.saves.collections.useQuery();
  const ids = api.saves.ids.useQuery();
  const target = useLastCollection(collections.data);
  const saved = ids.data?.includes(card.item.id) ?? false;

  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [anchor, setAnchor] = React.useState<DOMRect | null>(null);
  // Only asked when the picker opens — it tells the picker which row to mark "Already saved here".
  const forItem = api.saves.forItem.useQuery(
    { itemId: card.item.id },
    { enabled: pickerOpen },
  );

  const save = api.saves.saveToCollection.useMutation({
    // The topics-screen pattern: cancel, snapshot, patch, and let settle re-read the truth.
    onMutate: async ({ itemId }) => {
      await utils.saves.ids.cancel();
      const previous = utils.saves.ids.getData();
      utils.saves.ids.setData(undefined, [...(previous ?? []), itemId]);
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) utils.saves.ids.setData(undefined, ctx.previous);
      onToast("Couldn't save that. Try again.");
    },
    onSuccess: (result, variables) => {
      writeLastCollectionId(variables.collectionId);
      onToast(saveToastText(result.collectionName, result.drift));
    },
    onSettled: () =>
      Promise.all([
        utils.saves.ids.invalidate(),
        utils.saves.collections.invalidate(),
        utils.saves.list.invalidate(),
        utils.saves.count.invalidate(),
      ]),
  });

  // Nothing to offer until the collections are known — a strip with no target has no verb.
  if (!target) return null;

  const openPicker = (e: React.MouseEvent<HTMLButtonElement>) => {
    setAnchor(e.currentTarget.getBoundingClientRect());
    setPickerOpen(true);
  };
  const saveHere = () => {
    if (save.isPending) return;
    save.mutate({
      itemId: card.item.id,
      collectionId: target.id,
      // The slot the card was served under, for the bump (design §5); null for a WILD card.
      topicId: card.topicId ?? undefined,
    });
  };

  return (
    <>
      <div
        data-testid="tile-actions"
        // `pointer-events-none` on the strip, `auto` on its two buttons: the strip spans the
        // tile's top edge, and the space between the controls must stay the tile's to press.
        // `focus-within` reveals it for a keyboard — its buttons are tab stops even when unseen.
        className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-[10px] opacity-0 transition-opacity duration-200 group-hover/tile:opacity-100 focus-within:opacity-100"
      >
        <button
          type="button"
          aria-label="Choose collection"
          onClick={openPicker}
          onPointerDown={stop}
          className={cn(
            GLASS,
            "rounded-pill pointer-events-auto flex h-8 max-w-[70%] items-center gap-[6px] px-[12px]",
          )}
        >
          <span className="truncate text-[12.5px] font-medium">
            {target.name}
          </span>
          <ChevronDown size={12} className="text-ink/70 flex-none" />
        </button>

        <button
          type="button"
          aria-label={
            saved ? `Saved to ${target.name}` : `Save to ${target.name}`
          }
          // Lit means "already kept": a second click is a move, so it opens the picker — what
          // the item screen's lit bookmark does — rather than re-saving into the same place.
          onClick={saved ? openPicker : saveHere}
          onPointerDown={stop}
          className={cn(
            GLASS,
            "pointer-events-auto flex size-8 items-center justify-center rounded-full",
          )}
        >
          <Bookmark
            size={15}
            filled={saved}
            className={saved ? "text-accent" : "text-ink-hi"}
          />
        </button>
      </div>

      {/* **Portalled to `<body>`, not rendered in place.** This strip lives inside a feed tile, so
          a sheet rendered here inherits the tile's stacking context: its `fixed` + `z-[35]` only
          rank it among that tile's descendants, and the tiles after it painted over the popover
          and took its clicks (caught by e2e — "subtree intercepts pointer events" on the picker's
          New-collection row). The screen-level sheets never had this problem because they are
          mounted at the top of the screen. React still bubbles the picker's events through this
          component, not through `<body>`, which is harmless: no ancestor handles them. The guard
          is for form's sake — the feed only mounts strips on a client with a real hover. */}
      {typeof document === "undefined"
        ? null
        : createPortal(
            <SaveToCollectionSheet
              open={pickerOpen}
              onClose={() => setPickerOpen(false)}
              itemId={card.item.id}
              currentCollectionId={forItem.data?.collectionId ?? undefined}
              topicId={card.topicId}
              anchor={anchor}
              placement="below"
              onSaved={(collection, drift) => {
                onToast(saveToastText(collection.name, drift));
                void utils.saves.ids.invalidate();
              }}
              onError={onToast}
            />,
            document.body,
          )}
    </>
  );
}
