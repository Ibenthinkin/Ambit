"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

import type { FeedCard } from "~/server/services/feed";
import { buildTiles, packColumns } from "~/components/feed/masonry";
import { cameToSavedFromApp } from "~/components/saved/saved-origin";
import { CollectionsSheet } from "~/components/sheets/collections-sheet";
import { Bookmark, ChevronLeft } from "~/components/icons";
import { Button } from "~/components/ui/button";
import { GlassHeader } from "~/components/ui/glass-header";
import { IconButton } from "~/components/ui/icon-button";
import { PillToolbar } from "~/components/ui/pill-toolbar";
import { Rise } from "~/components/ui/rise";
import { Spinner } from "~/components/ui/spinner";
import { Toast } from "~/components/ui/toast";
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
  const list = api.saves.list.useQuery(
    activeId ? { collectionId: activeId } : {},
  );
  const collections = api.saves.collections.useQuery();
  const count = api.saves.count.useQuery();

  const utils = api.useUtils();
  const [toast, setToast] = React.useState<string | null>(null);
  const [collectionsOpen, setCollectionsOpen] = React.useState(false);

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

  // Pop when an in-app surface brought us here, push when /saved was opened cold (a bookmark, a
  // reload) and there is nothing behind it. Pushing unconditionally would rebuild a dynamic feed
  // and burn two pages of corpus per trip — see `saved-origin.ts` for the whole account.
  const leaveSaved = React.useCallback(() => {
    if (cameToSavedFromApp()) router.back();
    else router.push("/feed");
  }, [router]);

  const total = count.data ?? 0;

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
    return packColumns(buildTiles([{ cards }], {}));
  }, [list.data]);

  // Empty means *confirmed* empty — while the count or list is still on its way, the spinner
  // below holds the space rather than flashing the empty state at a user with plenty kept.
  const showEmpty = count.data === 0 && !list.isPending && !list.isError;
  const showFilteredEmpty =
    total > 0 &&
    !list.isPending &&
    !list.isError &&
    (list.data?.length ?? 0) === 0;

  return (
    <main className="bg-bg text-ink min-h-dvh">
      <GlassHeader className="flex-col items-stretch">
        <div className="flex items-center gap-3">
          <IconButton size={34} aria-label="Back to feed" onClick={leaveSaved}>
            <ChevronLeft size={16} />
          </IconButton>
          <div>
            <h1 className="text-ink-hi text-[26px] leading-none font-semibold">
              Saved
            </h1>
            <p className="text-ink/45 mt-[5px] text-[12px] tracking-[0.15px]">
              {countLine(total)}
            </p>
          </div>
        </div>
        {/* The chips only exist once there is something to filter — the empty state below owns
            the whole zero-saves screen, chips included. */}
        {total > 0 ? (
          <div className="mt-4">
            <CollectionChips
              collections={collections.data ?? []}
              total={total}
              activeId={activeId}
            />
          </div>
        ) : null}
      </GlassHeader>

      {list.isPending ? (
        <div className="flex justify-center py-24">
          <Spinner />
        </div>
      ) : null}

      {/* A failed load must never read as an empty collection — same rule as the feed. */}
      {list.isError ? (
        <div className="flex flex-col items-center gap-4 px-8 py-24">
          <span className="text-ink/40 text-center text-[14px]">
            Couldn&apos;t load your saved things.
          </span>
          <Button
            variant="ghost"
            shape="pill"
            onClick={() => void list.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : null}

      {showEmpty ? (
        <Rise>
          <div className="flex flex-col items-center px-10 py-[90px]">
            <div className="border-hairline bg-ink/5 border-ink/10 flex size-[66px] items-center justify-center rounded-full">
              {/* Outline, not filled — nothing is kept yet, so the glyph shows the affordance
                  rather than a state. */}
              <Bookmark size={28} className="text-accent" />
            </div>
            <h2 className="text-ink-hi mt-[22px] text-[23px] font-semibold">
              Nothing kept yet
            </h2>
            <p className="text-ink/55 mt-[9px] max-w-[250px] text-center text-[15px] leading-[1.5]">
              Tap the bookmark on anything that catches you. It&apos;ll wait for
              you here — no rush, no expiry.
            </p>
            <Button className="mt-[26px]" onClick={leaveSaved}>
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

      {/* The feed's own masonry geometry, verbatim: two independent stacks, `items-start` so a
          short column doesn't stretch. `pt-2` tucks the first row right under the sticky header. */}
      <div className="grid grid-cols-2 items-start gap-1 px-1 pt-2">
        {columns.map((column, columnIndex) => (
          <div key={columnIndex} className="flex flex-col gap-1">
            {column.map((tile) =>
              // CORE-only input makes this branch unreachable (see the cards memo) — the check is
              // here to narrow the type, not to handle a real case.
              tile.kind === "because" ? null : (
                <SavedTile
                  key={tile.card.item.id}
                  tile={tile}
                  onUnsave={() => unsave.mutate({ itemId: tile.card.item.id })}
                />
              ),
            )}
          </div>
        ))}
      </div>

      {/* Clears the floating pill, so the last row of tiles isn't parked underneath it. */}
      <div className="h-24" />

      <PillToolbar
        bookmark="on-saved"
        onBookmark={() => setCollectionsOpen(true)}
        onHome={leaveSaved}
        // No `onShare`, same rationale as the feed: a list has no single referent to share — and
        // public share-collection is out of 5.9's scope entirely.
      />

      <CollectionsSheet
        open={collectionsOpen}
        onClose={() => setCollectionsOpen(false)}
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
