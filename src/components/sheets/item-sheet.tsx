"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Share } from "~/components/icons";
import { CoverMosaic } from "~/components/profile/cover-mosaic";
import { BottomSheet } from "~/components/ui/bottom-sheet";
import { Button } from "~/components/ui/button";
import { Eyebrow } from "~/components/ui/eyebrow";
import { writeLastCollectionId } from "~/lib/last-collection";
import type { SaveDrift } from "~/lib/save-toast";
import { LOADER_SIZES, Loader } from "~/components/ui/loader";
import { markArrival } from "~/lib/item-arrival";
import { api } from "~/trpc/react";
import { NewCollectionRow } from "./collection-rows";
import { ShareSheet } from "./share-sheet";

// The feed's **long-press sheet** (`Ambit - Feed Masonry 3.dc.html`) — the third member of the
// collection-sheet family, and the one with a job the other two don't have. Its siblings:
//
//   SaveToCollectionSheet  — item in context, picking a row SAVES it there
//   CollectionsSheet       — no item in context, picking a row NAVIGATES to Saved
//   ItemSheet (this)       — item in context, and a peek action on top of saving
//
// Three actions since 09-10-26 (Ben's desktop review): Closer Look, **Share**, and saving — with
// **"New collection…"** at the foot of the list, so a reader who wants a collection that doesn't
// exist yet can make it here and have the tile filed into it in one go.
//
// It's a *contextual menu*, not an arriving surface: the finger that summoned it is already
// resting on the tile it acts on. Hence `animation="menu"` (a short lift-and-fade rather than the
// full slide) and the compact rows below — this is a smaller, denser thing than the save sheet.
//
// Deliberately no "Already saved here" state on the rows, unlike SaveToCollectionSheet. The
// prototype shows plain rows, and it's the right call for a menu you reach by long-pressing an
// arbitrary tile mid-scroll: fetching + rendering the item's current collection would mean a
// second query on a surface the user typically dismisses in under a second. Each row does lead with
// its collection's face since 09-12-26 (a 28 px `CoverMosaic`, docs/DESIGN_list-screens.md §7) —
// that comes from the same `saves.collections` read the rows already make, so it costs nothing
// the old accent dot didn't.

export interface ItemSheetProps {
  open: boolean;
  onClose: () => void;
  /**
   * The long-pressed item, or `null` when nothing is pressed. Nullable rather than conditionally
   * mounting the whole sheet, because unmounting it on close would cut the exit animation off
   * mid-flight — the sheet has to outlive the item selection by one animation.
   *
   * `topicId` is the slot the card was served under, for the bump (docs/DESIGN_chrome-redesign.md
   * §5).
   */
  item: { id: string; title: string; topicId?: string | null } | null;
  /** Same contract as `SaveToCollectionSheet.onSaved` — see its comment for what `drift` is. */
  onSaved: (collection: { id: string; name: string }, drift: SaveDrift) => void;
  /**
   * Required, for the same reason `SaveToCollectionSheet.onError` is: the sheet dismisses the
   * instant a row is picked, so a failed write is otherwise indistinguishable from a successful
   * one and the user walks away believing the item was filed.
   */
  onError: (message: string) => void;
  /** The app's own origin (`env.BETTER_AUTH_URL`), for building an absolute share URL. */
  appUrl: string;
  /** The sheet has no toast of its own; the Share sheet's "Link copied" goes through the feed's. */
  onToast: (message: string) => void;
}

export function ItemSheet({
  open,
  onClose,
  item,
  onSaved,
  onError,
  appUrl,
  onToast,
}: ItemSheetProps) {
  const router = useRouter();
  const utils = api.useUtils();
  const [shareOpen, setShareOpen] = React.useState(false);

  // The item's own page, the same URL its item screen would share.
  const shareUrl = item ? `${appUrl}/i/${item.id}` : "";

  // `enabled: open` — the feed mounts this sheet on every render; its data is worthless until a
  // long press actually opens it.
  const collections = api.saves.collections.useQuery(undefined, {
    enabled: open,
  });

  const saveToCollection = api.saves.saveToCollection.useMutation({
    onSuccess: async (result, variables) => {
      // Every save moves the feed's hover strips to this collection (last-collection.ts).
      writeLastCollectionId(variables.collectionId);
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
    if (!item || saveToCollection.isPending) return; // double-tap guard
    onClose(); // close first: the write settles behind the dismissal, as everywhere else
    saveToCollection.mutate({
      itemId: item.id,
      collectionId,
      topicId: item.topicId ?? undefined,
    });
  };

  const closerLook = () => {
    if (!item) return;
    onClose();
    markArrival(item.id, "feed");
    router.push(`/i/${item.id}`);
  };

  // Close this menu first, then raise the share sheet — one sheet at a time, as everywhere else.
  const share = () => {
    if (!item) return;
    onClose();
    setShareOpen(true);
  };

  return (
    <>
      <BottomSheet open={open} onClose={onClose} animation="menu">
        {/* The shell carries no horizontal padding (so the save sheets can scroll rows edge to
          edge), so this menu supplies its own — the prototype's `10px 20px 32px`. */}
        <div className="px-5 pt-[10px] pb-8">
          {/* DESIGN §6.1: the item's title, left-aligned at 20 px, over an `ink/14` rule. */}
          <p className="text-ink-hi border-ink/14 border-b pb-3 text-[20px] leading-[1.2] tracking-[-0.01em]">
            {item?.title ?? ""}
          </p>

          {/* The one bright block: a 46 px white primary button. */}
          <Button
            onClick={closerLook}
            // Same rule as every other row/control in the design: a thumb resting here mid-gesture
            // must not fire it.
            onPointerDown={(e) => e.stopPropagation()}
            className="mt-[14px] w-full"
          >
            Closer Look
          </Button>

          <button
            type="button"
            onClick={share}
            onPointerDown={(e) => e.stopPropagation()}
            className="border-ink/8 mt-1 flex w-full items-center gap-[11px] border-b py-[13px] text-left transition-transform duration-150 active:scale-[0.99]"
          >
            <Share size={18} className="text-ink/78 flex-none" />
            <span className="text-ink text-[15px]">Share</span>
          </button>

          <Eyebrow
            as="p"
            className="border-ink/14 block border-b pt-5 pb-2 text-[10px]"
          >
            Save to collection
          </Eyebrow>

          {collections.isLoading ? (
            <div className="flex justify-center py-6">
              <Loader size={LOADER_SIZES.block} />
            </div>
          ) : (
            <>
              {collections.data?.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => pick(c.id)}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="border-ink/8 flex w-full items-center gap-3 border-b py-[11px] text-left transition-transform duration-150 active:scale-[0.99]"
                >
                  <CoverMosaic
                    covers={c.covers}
                    className="size-[38px] flex-none"
                    placeholderSize={14}
                  />
                  <span className="text-ink min-w-0 flex-1 truncate text-[16px]">
                    {c.name}
                  </span>
                  <span
                    aria-hidden
                    className="text-ink/55 font-mono text-[13px]"
                  >
                    +
                  </span>
                </button>
              ))}
              {/* Made with a tile in hand: file it there at once, exactly as picking a row does. */}
              <NewCollectionRow onCreate={(c) => pick(c.id)} />
            </>
          )}
        </div>
      </BottomSheet>

      {/* Opened by the Share row above. No `imageContext`/`onSaveImage`: the tile sheet doesn't
        know the item's type, and Save image stays on the item screen. */}
      <ShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        url={shareUrl}
        title={item?.title ?? ""}
        onCopied={() => onToast("Link copied")}
        onShareUnavailable={() => onToast("Sharing isn't available here")}
      />
    </>
  );
}
