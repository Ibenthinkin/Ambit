"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Magnifier } from "~/components/icons";
import { BottomSheet } from "~/components/ui/bottom-sheet";
import { Spinner } from "~/components/ui/spinner";
import { api } from "~/trpc/react";

// The feed's **long-press sheet** (`Ambit - Feed Masonry 3.dc.html`) — the third member of the
// collection-sheet family, and the one with a job the other two don't have. Its siblings:
//
//   SaveToCollectionSheet  — item in context, picking a row SAVES it there
//   CollectionsSheet       — no item in context, picking a row NAVIGATES to Saved
//   ItemSheet (this)       — item in context, and a peek action on top of saving
//
// It's a *contextual menu*, not an arriving surface: the finger that summoned it is already
// resting on the tile it acts on. Hence `animation="menu"` (a short lift-and-fade rather than the
// full slide) and the compact rows below — this is a smaller, denser thing than the save sheet.
//
// Deliberately no "Already saved here" state on the rows, unlike SaveToCollectionSheet. The
// prototype shows plain rows, and it's the right call for a menu you reach by long-pressing an
// arbitrary tile mid-scroll: fetching + rendering the item's current collection would mean a
// second query on a surface the user typically dismisses in under a second.

export interface ItemSheetProps {
  open: boolean;
  onClose: () => void;
  /**
   * The long-pressed item, or `null` when nothing is pressed. Nullable rather than conditionally
   * mounting the whole sheet, because unmounting it on close would cut the exit animation off
   * mid-flight — the sheet has to outlive the item selection by one animation.
   */
  item: { id: string; title: string } | null;
  onSaved: (collection: { id: string; name: string }) => void;
  /**
   * Required, for the same reason `SaveToCollectionSheet.onError` is: the sheet dismisses the
   * instant a row is picked, so a failed write is otherwise indistinguishable from a successful
   * one and the user walks away believing the item was filed.
   */
  onError: (message: string) => void;
}

export function ItemSheet({
  open,
  onClose,
  item,
  onSaved,
  onError,
}: ItemSheetProps) {
  const router = useRouter();
  const utils = api.useUtils();

  // `enabled: open` — the feed mounts this sheet on every render; its data is worthless until a
  // long press actually opens it.
  const collections = api.saves.collections.useQuery(undefined, {
    enabled: open,
  });

  const saveToCollection = api.saves.saveToCollection.useMutation({
    onSuccess: async (result, variables) => {
      await Promise.all([
        utils.saves.collections.invalidate(),
        utils.saves.list.invalidate(),
        utils.saves.count.invalidate(),
      ]);
      onSaved({ id: variables.collectionId, name: result.collectionName });
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
    saveToCollection.mutate({ itemId: item.id, collectionId });
  };

  const closerLook = () => {
    if (!item) return;
    onClose();
    router.push(`/i/${item.id}`);
  };

  return (
    <BottomSheet open={open} onClose={onClose} animation="menu">
      {/* The shell carries no horizontal padding (so the save sheets can scroll rows edge to
          edge), so this menu supplies its own — the prototype's `10px 18px 30px`. */}
      <div className="px-[18px] pt-[10px] pb-[30px]">
        <p className="text-ink-hi px-1 pb-1 text-center text-[15px] font-semibold">
          {item?.title ?? ""}
        </p>

        <button
          type="button"
          onClick={closerLook}
          // Same rule as every other row/control in the design: a thumb resting here mid-gesture
          // must not fire it.
          onPointerDown={(e) => e.stopPropagation()}
          className="flex w-full items-center gap-[11px] rounded-[12px] px-[10px] py-[14px] text-left transition-transform duration-150 active:scale-[0.99]"
        >
          <Magnifier size={18} className="text-accent flex-none" />
          <span className="text-ink text-[15px]">Closer Look</span>
        </button>

        <div className="bg-ink/8 mx-1 my-[6px] h-[0.5px]" />

        <p className="text-ink/40 px-[10px] pt-[10px] pb-0.5 text-[11.5px] font-semibold tracking-[1px] uppercase">
          Save to collection
        </p>

        {collections.isLoading ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : (
          collections.data?.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => pick(c.id)}
              onPointerDown={(e) => e.stopPropagation()}
              className="flex w-full items-center gap-[11px] rounded-[12px] px-[10px] py-3 text-left transition-transform duration-150 active:scale-[0.99]"
            >
              <span className="bg-accent size-2 flex-none rounded-full" />
              <span className="text-ink min-w-0 flex-1 truncate text-[15px]">
                {c.name}
              </span>
            </button>
          ))
        )}
      </div>
    </BottomSheet>
  );
}
