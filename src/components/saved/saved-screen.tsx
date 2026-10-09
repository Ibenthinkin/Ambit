"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

import type { FeedCard } from "~/server/services/feed";
import { buildTiles, GRID_COLS, packColumns } from "~/components/feed/masonry";
import { cameToSavedFromApp } from "~/components/saved/saved-origin";
import { CollectionsSheet } from "~/components/sheets/collections-sheet";
import { Button } from "~/components/ui/button";
import { Column } from "~/components/ui/column";
import { Toolbar } from "~/components/ui/toolbar";
import { Rise } from "~/components/ui/rise";
import { LOADER_SIZES, Loader } from "~/components/ui/loader";
import { Toast } from "~/components/ui/toast";
import { useColumnCount } from "~/hooks/use-media-query";
import { UNDONE_TOAST } from "~/lib/feedback-toast";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";
import { CollectionChips } from "./collection-chips";
import { SavedTile } from "./saved-tile";

// The `/saved` screen (`Ambit - Saved.dc.html`) — where everything the pill's bookmark has been
// filing since 5.5 finally becomes visible. Pure UI over the existing `saves` router: title +
// count line, collection filter chips, the same two-column masonry as the feed, an unsave badge
// per tile, and the pill with its bookmark filled white (`on-saved`).
//
// Same window-scroll rule as `FeedScreen` — the viewport is the scroller, no inner scroll div.

/** The header's caption under "Saved" — the prototype's copy, keyed off the *total* kept. */
function countLine(total: number): string {
  if (total === 0) return "Your quiet collection";
  return total === 1 ? "1 thing kept" : `${total} things kept`;
}

export function SavedScreen() {
  const router = useRouter();

  // The raw `?collection=` value, used verbatim as the query input. A hand-edited or stale URL
  // (a collection deleted elsewhere, a typo'd id) simply yields an empty filtered list and no
  // highlighted chip — the "Nothing in this collection yet." branch below absorbs it, so there's
  // nothing to validate here.
  const activeId = useSearchParams().get("collection") ?? undefined;

  // **The input expression is byte-identical to the RSC shell's prefetch** (`app/saved/page.tsx`)
  // — same hydration contract as /feed, though missing it here costs a round trip, not corpus.
  //
  // `?shelf=more` swaps the wall for the "More of this" shelf: one query is live at a time
  // (`enabled`), so opening the shelf doesn't also pay for the saves list, and vice versa.
  const shelf = useSearchParams().get("shelf") === "more";
  const saved = api.saves.list.useQuery(
    activeId ? { collectionId: activeId } : {},
    { enabled: !shelf },
  );
  const marked = api.feedback.list.useQuery(undefined, { enabled: shelf });
  const list = shelf ? marked : saved;
  // How many items carry a "More of this" mark — decides whether the chip row shows for a reader
  // with no saves (they mark without ever saving; the shelf is for them too).
  const mine = api.feedback.mine.useQuery();
  const moreCount = mine.data?.more.length ?? 0;
  const collections = api.saves.collections.useQuery();
  const count = api.saves.count.useQuery();

  const utils = api.useUtils();
  const [toast, setToast] = React.useState<string | null>(null);
  const [collectionsOpen, setCollectionsOpen] = React.useState(false);
  // The rect of the toolbar control that opened the sheet — above `md` the sheet floats beside
  // it (docs/DESIGN_chrome-redesign.md §2); the phone ignores it.
  const [collectionsAnchor, setCollectionsAnchor] =
    React.useState<DOMRect | null>(null);

  // "Unsave is immediate" (prototype): the tile leaves the visible list optimistically, then the
  // settle invalidates the same trio every save path invalidates (`item-sheet.tsx`), which either
  // confirms the removal or — on a failed write — resurrects the tile with the truth.
  const unsave = api.saves.unsave.useMutation({
    onMutate: ({ itemId }) => {
      utils.saves.list.setData(
        activeId ? { collectionId: activeId } : {},
        (prev) => prev?.filter((item) => item.id !== itemId),
      );
      setToast("Removed from Saved");
    },
    // Same house rule as the sheets' `onError`: the optimistic removal already told the user it
    // worked, so a failed write must say so out loud — the invalidation below brings the tile
    // back, and this explains why.
    onError: () => setToast("Couldn't remove that — it's still here."),
    onSettled: () =>
      Promise.all([
        utils.saves.list.invalidate(),
        utils.saves.collections.invalidate(),
        utils.saves.count.invalidate(),
      ]),
  });

  // Undoing a "More of this" is the unsave path's twin: filter the shelf at once, say "Undone",
  // and let the settle either confirm it or bring the tile back if the write failed.
  const unmore = api.feedback.clear.useMutation({
    onMutate: ({ itemId }) => {
      utils.feedback.list.setData(undefined, (prev) =>
        prev?.filter((item) => item.id !== itemId),
      );
      setToast(UNDONE_TOAST);
    },
    onError: () => setToast("Couldn't undo that — it's still here."),
    onSettled: () => utils.feedback.list.invalidate(),
  });

  // Pop when an in-app surface brought us here, push when /saved was opened cold (a bookmark, a
  // reload) and there is nothing behind it. Pushing unconditionally would rebuild a dynamic feed
  // and burn two pages of corpus per trip — see `saved-origin.ts` for the whole account.
  const leaveSaved = React.useCallback(() => {
    if (cameToSavedFromApp()) router.back();
    else router.push("/feed");
  }, [router]);

  const total = count.data ?? 0;

  // The feed's column count (docs/DESIGN_list-screens.md §6): two on the phone, three from `md`,
  // four from `xl`.
  const columnCount = useColumnCount();

  const columns = React.useMemo(() => {
    // Each saved item dressed as a CORE card so the feed's masonry pipeline can be reused
    // verbatim: `buildTiles` only synthesizes a Because tile for a qualifying JUMP, so a CORE-only
    // page can never produce one, and the aspect rotation / column packing behave exactly as they
    // do on the feed. (The types line up for real — superjson preserves `Item` across tRPC.)
    const cards: FeedCard[] = (list.data ?? []).map((item) => ({
      item,
      tier: "CORE" as const,
      topicId: item.topicId,
    }));
    return packColumns(buildTiles([{ cards }], {}), columnCount);
  }, [list.data, columnCount]);

  // Empty means *confirmed* empty — while the count or list is still on its way, the loader
  // below holds the space rather than flashing the empty state at a user with plenty kept.
  const showEmpty =
    !shelf && count.data === 0 && !list.isPending && !list.isError;
  const showShelfEmpty =
    shelf && !list.isPending && !list.isError && (list.data?.length ?? 0) === 0;
  const showFilteredEmpty =
    !shelf &&
    total > 0 &&
    !list.isPending &&
    !list.isError &&
    (list.data?.length ?? 0) === 0;

  return (
    <main className="bg-bg text-ink min-h-dvh">
      {/* A title block that scrolls with the page (DESIGN §6.6, decision 15): no sticky bar, no
          back chevron — the toolbar's Feed is the way out. Same scale as the profile's name. */}
      <Column width="wide" className="px-5 pt-14">
        <h1 className="text-ink-hi text-[34px] leading-none tracking-[-0.025em] md:text-[64px]">
          Saved
        </h1>
        <p className="text-ink/55 mt-3 font-mono text-[12px] tracking-[0.4px] uppercase">
          {countLine(total)}
        </p>
        {/* The chips exist once there is something to filter: a save, or a "More of this" mark
            (a reader who never saves still reaches the shelf). With neither, the empty state below
            owns the whole screen, chips included; with marks but no saves, the row (All + the
            shelf) sits above that empty state. */}
        {total > 0 || moreCount > 0 || shelf ? (
          <div className="mt-5">
            <CollectionChips
              collections={collections.data ?? []}
              total={total}
              activeId={activeId}
              shelf={shelf}
            />
          </div>
        ) : null}
      </Column>

      {/* The desktop cap: the feed's column and column count (docs/DESIGN_list-screens.md §6).
          Until 09-12-26 this was `narrow` and two columns at every width, on the reasoning that four
          would make a modest collection look like a thin feed — but the stretched phone was the
          complaint, and a modest collection at 1440 is four short stacks rather than two long ones. */}
      <Column width="wide">
        {list.isPending ? (
          <div className="flex justify-center py-24">
            <Loader size={LOADER_SIZES.block} />
          </div>
        ) : null}

        {/* A failed load must never read as an empty collection — same rule as the feed. */}
        {list.isError ? (
          <div className="flex flex-col items-center gap-4 px-8 py-24">
            <span className="text-ink/40 text-center text-[14px]">
              Couldn&apos;t load your saved things.
            </span>
            <Button variant="outline" onClick={() => void list.refetch()}>
              Try again
            </Button>
          </div>
        ) : null}

        {showEmpty ? (
          <Rise>
            <div className="flex flex-col items-center px-10 py-[90px]">
              <h2 className="text-ink-hi text-[24px]">Nothing kept yet</h2>
              <p className="text-ink/55 mt-[9px] max-w-[250px] text-center text-[15px] leading-[1.5]">
                Tap the bookmark on anything that catches you. It&apos;ll wait
                for you here — no rush, no expiry.
              </p>
              <Button
                variant="outline"
                className="mt-[26px]"
                onClick={leaveSaved}
              >
                Back to exploring
              </Button>
            </div>
          </Rise>
        ) : null}

        {/* Reachable through a zero-count chip or a stale filtered URL — an addition over the
          prototype, whose type filters could never land on an empty subset. */}
        {showFilteredEmpty ? (
          <div className="flex justify-center py-24">
            <span className="text-ink/40 text-center text-[14px]">
              Nothing in this collection yet.
            </span>
          </div>
        ) : null}

        {showShelfEmpty ? (
          <div className="flex justify-center py-24">
            <span className="text-ink/40 text-center text-[14px]">
              Nothing marked More of this yet.
            </span>
          </div>
        ) : null}

        {/* The feed's own masonry geometry, verbatim: independent stacks, `items-start` so a short
          column doesn't stretch. `pt-6` sets the wall off from the title block. */}
        <div
          data-testid="saved-columns"
          className={cn(
            "grid items-start gap-1 px-1 pt-6",
            GRID_COLS[columnCount],
          )}
        >
          {columns.map((column, columnIndex) => (
            <div key={columnIndex} className="flex flex-col gap-1">
              {column.map((tile) =>
                // CORE-only input, and no `messages` option, make this branch unreachable (see the
                // cards memo) — the check is here to narrow the type, not to handle a real case.
                tile.kind === "because" || tile.kind === "message" ? null : (
                  <SavedTile
                    key={tile.card.item.id}
                    tile={tile}
                    badge={shelf ? "unmore" : "unsave"}
                    onUnsave={() =>
                      shelf
                        ? unmore.mutate({ itemId: tile.card.item.id })
                        : unsave.mutate({ itemId: tile.card.item.id })
                    }
                  />
                ),
              )}
            </div>
          ))}
        </div>

        {/* Clears the floating pill, so the last row of tiles isn't parked underneath it. */}
        <div className="h-24" />
      </Column>

      <Toolbar
        bookmark="on-saved"
        onBookmark={(anchor) => {
          setCollectionsAnchor(anchor);
          setCollectionsOpen(true);
        }}
        onHome={leaveSaved}
        // No `onShare`, same rationale as the feed: a list has no single referent to share — and
        // public share-collection is out of 5.9's scope entirely.
      />

      <CollectionsSheet
        open={collectionsOpen}
        onClose={() => setCollectionsOpen(false)}
        anchor={collectionsAnchor}
      />

      {/* `raised` — the pill is mounted here, and an unraised toast would sit behind it. 1700ms is
          the prototype's hold for the unsave confirmation. */}
      <Toast
        text={toast ?? ""}
        open={toast !== null}
        onDone={() => setToast(null)}
        durationMs={1700}
        raised
      />
    </main>
  );
}
