"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { CollectionsSheet } from "~/components/sheets/collections-sheet";
import { InstallFlow } from "~/components/install/install-flow";
import { ItemSheet } from "~/components/sheets/item-sheet";
import { Button } from "~/components/ui/button";
import { PillToolbar } from "~/components/ui/pill-toolbar";
import { Rise } from "~/components/ui/rise";
import { Spinner } from "~/components/ui/spinner";
import { Toast } from "~/components/ui/toast";
import { saveToastText } from "~/lib/save-toast";
import { api } from "~/trpc/react";
import { ArticleCard } from "./article-card";
import { BecauseTile } from "./because-tile";
import { markFeedOrigin } from "./feed-origin";
import { ImageTile } from "./image-tile";
import { buildTiles, packColumns, type FeedTile } from "./masonry";
import { useFeedScroll } from "./use-feed-scroll";

// The screen the whole app is for (SPEC §9, `Ambit - Feed Masonry 3.dc.html`): an infinite
// two-column masonry of the feed engine's output. Tap a tile to open it, long-press for the item
// menu, and the floating pill for everything else.
//
// **The scroll container is the window.** The prototype scrolls an inner `<div>` because it's
// rendered inside an iOS-frame mockup; the real app's equivalent of that frame is the viewport.
// Getting this wrong is the same class of bug 5.5 hit three separate times with
// `absolute`-vs-`fixed`, and here it has a second face: the IntersectionObserver's root must be
// the viewport (its default), never a ref'd element.

export interface FeedScreenProps {
  /** topic id → chip label, passed from the RSC shell so the Because tiles can name their walk. */
  topicLabels: Record<string, string>;
}

export function FeedScreen({ topicLabels }: FeedScreenProps) {
  const router = useRouter();

  const feed = api.feed.page.useInfiniteQuery(
    // **`{}`, not `undefined`.** This object is half of a hydration contract: /feed's RSC shell
    // prefetches with the identical input, and React Query keys a query by (path, input). Any
    // asymmetry doesn't error — it just produces a different key, so the server's payload sits
    // unused in the cache and the client quietly refetches. Which is worse here than it sounds:
    // a refetched page is a page the reader receives, and receiving is what burns it (the ack
    // effect below) — so a broken key silently costs a page of this user's corpus every mount.
    // `knobs` stays absent because it's dev tooling (only honored under the server's FEED_DEBUG
    // flag) and sending it would be a second way to break the match.
    {},
    {
      getNextPageParam: (last) => last.nextCursor,
      // Load-bearing for the same reason, and the precedent /dev/tokens set: every page the
      // client receives gets acked, and an acked item never comes back. Any stray refetch — a tab
      // regaining focus, a laptop waking up — silently eats a page. Treat an unexplained
      // `feed.page` request in the Network tab as a bug, never as something to paper over with a
      // cache tweak.
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  );

  const { data, hasNextPage, isFetchingNextPage, isPending, fetchNextPage } =
    feed;

  const [toast, setToast] = React.useState<string | null>(null);
  const [collectionsOpen, setCollectionsOpen] = React.useState(false);
  const [itemSheetOpen, setItemSheetOpen] = React.useState(false);
  // Deliberately NOT cleared when the sheet closes: `ItemSheet` stays mounted through its exit
  // animation, and blanking the item would flash an empty title on the way out.
  const [pressedItem, setPressedItem] = React.useState<{
    id: string;
    title: string;
  } | null>(null);

  const pages = React.useMemo(() => data?.pages ?? [], [data]);

  // ── receipt ───────────────────────────────────────────────────────────────────────────────────
  // Marking an item seen is the client's job as of 5.7, not the server's. `feed.page` composes a
  // page and says nothing about who saw it; this effect acks the pages that actually arrived here.
  // The server used to write `seen_item` during its own render, which meant every discarded render
  // — a route prefetch, a back-pop re-running the dynamic `/feed` — spent a page of corpus on
  // nobody (1,116 items in six minutes, log.md 08-20-26).
  //
  // Keyed on each page's first card id, in a ref rather than state: the set must survive re-renders
  // without causing one. Re-acking after a genuine remount (the reader pops back from an item page,
  // React Query replays its cached pages) is deliberate and harmless — `markSeen` is
  // `onConflictDoNothing`, so the first write wins and the original `served_at` stands, which is
  // what keeps the cursor's anchor arithmetic stable.
  const { mutate: ackSeen } = api.feed.markSeen.useMutation();
  const ackedPages = React.useRef(new Set<string>());
  React.useEffect(() => {
    for (const page of pages) {
      const key = page.cards[0]?.item.id;
      if (!key || ackedPages.current.has(key)) continue;
      ackedPages.current.add(key);
      ackSeen({ itemIds: page.cards.map((c) => c.item.id) });
    }
  }, [pages, ackSeen]);

  const { columns, firstPageTiles, cardCount } = React.useMemo(() => {
    const tiles = buildTiles(pages, topicLabels);
    // Only the first page gets an entrance animation, so the set of tiles that belong to it has to
    // be identifiable after packing has interleaved them into two columns. Rebuilding page one on
    // its own is a dozen cards' worth of work and unambiguously correct, where re-deriving the
    // count from the tier rules would duplicate `buildTiles`' cadence logic in a second place.
    const firstPage =
      pages.length > 0 ? buildTiles([pages[0]!], topicLabels) : [];
    return {
      columns: packColumns(tiles),
      firstPageTiles: new Set(tiles.slice(0, firstPage.length)),
      cardCount: pages.reduce((n, p) => n + p.cards.length, 0),
    };
  }, [pages, topicLabels]);

  // ── infinite scroll ───────────────────────────────────────────────────────────────────────────
  // The observer is created ONCE and never rebuilt, because tearing it down and re-observing on
  // every render is how an observer starts missing intersections. The moving parts (`hasNextPage`,
  // the fetch itself) reach it through a ref instead — the same lesson as `BottomSheet`'s
  // `onCloseRef`, where an inline arrow in the deps rebuilt the effect on every parent render.
  const sentinelRef = React.useRef<HTMLDivElement>(null);
  const loadMoreRef = React.useRef<() => void>(() => undefined);
  React.useEffect(() => {
    loadMoreRef.current = () => {
      if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
    };
  });

  React.useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting))
          loadMoreRef.current();
      },
      // No `root` — the viewport is the scroller (see the header). 500px of margin starts the
      // next fetch while the reader is still half a screen away from the bottom, which is what
      // makes the scroll feel endless rather than paged. The prototype also wires a scroll
      // listener doing the same job; one mechanism is enough, and two racing each other is how
      // you end up fetching two pages for one bottom.
      { rootMargin: "500px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Puts the reader back where they were — on the tile they just came back from, when `?focus=`
  // says which one. Mounted after the columns are built so its first attempt has tiles to find.
  useFeedScroll();

  // ── gestures ──────────────────────────────────────────────────────────────────────────────────
  // The marker is what lets the item page's Back *pop* this feed off the history stack instead of
  // pushing a brand-new one. Without it every return trip rebuilds the feed from scratch — new
  // cards, lost scroll position, and two pages of the reader's corpus spent per tap (the RSC
  // render draws one and the client query draws another). See `feed-origin.ts`.
  const openItem = (id: string) => {
    markFeedOrigin(id);
    router.push(`/i/${id}`);
  };
  const openItemSheet = (item: { id: string; title: string }) => {
    setPressedItem(item);
    setItemSheetOpen(true);
  };

  const renderTile = (tile: FeedTile) => {
    if (tile.kind === "because") {
      return <BecauseTile from={tile.from} to={tile.to} />;
    }
    const { item } = tile.card;
    const gestures = {
      onTap: () => openItem(item.id),
      onLongPress: () => openItemSheet({ id: item.id, title: item.title }),
    };
    return tile.kind === "image" ? (
      <ImageTile
        card={tile.card}
        aspectClass={tile.aspectClass}
        {...gestures}
      />
    ) : (
      <ArticleCard card={tile.card} {...gestures} />
    );
  };

  const showLoader = isPending || isFetchingNextPage;
  const showEnd = !isPending && !feed.isError && !hasNextPage && cardCount > 0;
  const showEmpty =
    !isPending && !feed.isError && !hasNextPage && cardCount === 0;

  return (
    <main className="bg-bg text-ink min-h-dvh">
      {/* `items-start` so a short column doesn't stretch to match a tall one — the two columns are
          independent stacks that happen to sit side by side, which is the whole idea of a masonry. */}
      <div className="grid grid-cols-2 items-start gap-1 px-1 pt-[58px]">
        {columns.map((column, columnIndex) => (
          <div key={columnIndex} className="flex flex-col gap-1">
            {column.map((tile, tileIndex) => {
              // Because tiles carry no `data-feed-id`: they're inert, and `?focus=` resolves an
              // *item*, so giving them an id would only create a second thing to scroll to.
              const key =
                tile.kind === "because" ? tile.key : tile.card.item.id;
              const body = (
                <div data-feed-id={tile.kind === "because" ? undefined : key}>
                  {renderTile(tile)}
                </div>
              );
              // Only page one rises in. An appended page arriving mid-scroll with a staggered
              // fade cascade doesn't read as "arriving" — it reads as flicker.
              return firstPageTiles.has(tile) ? (
                <Rise key={key} delayMs={tileIndex * 40}>
                  {body}
                </Rise>
              ) : (
                <React.Fragment key={key}>{body}</React.Fragment>
              );
            })}
          </div>
        ))}
      </div>

      {/* The infinite-scroll trip wire. Always rendered — an observer with nothing to observe is
          an observer that never fires again once the list grows. */}
      <div ref={sentinelRef} className="h-px" />

      {showLoader ? (
        <div className="flex items-center justify-center gap-[10px] pt-5 pb-[26px]">
          <Spinner size={15} />
          <span className="text-ink/40 text-[14px]">
            finding something interesting…
          </span>
        </div>
      ) : null}

      {showEnd ? (
        <div className="flex items-center justify-center pt-5 pb-[26px]">
          <span className="text-ink/40 text-[14px]">
            You&apos;ve reached the edge, for now.
          </span>
        </div>
      ) : null}

      {showEmpty ? (
        <div className="flex flex-col items-center justify-center px-8 py-24">
          <span className="text-ink/40 text-center text-[14px]">
            Nothing here yet. Check back soon.
          </span>
        </div>
      ) : null}

      {/* Not in the plan's copy table, and deliberately added: without this branch a failed fetch
          falls through to "Nothing here yet", which tells the user their feed is empty when in
          fact the request died. Same house rule as `onError` on the sheets — a failure must never
          be indistinguishable from an ordinary outcome. */}
      {feed.isError ? (
        <div className="flex flex-col items-center gap-4 px-8 py-24">
          <span className="text-ink/40 text-center text-[14px]">
            Couldn&apos;t load the feed.
          </span>
          <Button
            variant="ghost"
            shape="pill"
            onClick={() => void feed.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : null}

      {/* Clears the floating pill, so the last row of tiles isn't parked underneath it. */}
      <div className="h-24" />

      <PillToolbar
        bookmark="idle"
        onBookmark={() => setCollectionsOpen(true)}
        onHome={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        // No `onProfile` override as of 5.10: the pill's own default navigates to the real
        // `/profile` (marking the origin on the way), so the toast placeholder that stood in for a
        // 404 is gone.
        // No `onShare` — there's no "current item" on a feed for a share to refer to, so the
        // pill renders three controls here (Decision 3).
      />

      <CollectionsSheet
        open={collectionsOpen}
        onClose={() => setCollectionsOpen(false)}
      />

      <ItemSheet
        open={itemSheetOpen}
        onClose={() => setItemSheetOpen(false)}
        item={pressedItem}
        onSaved={(collection, drift) =>
          setToast(saveToastText(collection.name, drift))
        }
        onError={setToast}
      />

      {/* The install ask lives here rather than in the layout: the feed is the only screen where
          a reader is plainly *using* the app rather than passing through it, and it is the one
          place a banner can sit without covering something they came for. It renders nothing at
          all until the visit count, the display mode and the dismissal history all say otherwise. */}
      <InstallFlow />

      {/* `raised` — this screen mounts the pill, and an unraised toast would sit behind it. */}
      <Toast
        text={toast ?? ""}
        open={toast !== null}
        onDone={() => setToast(null)}
        raised
      />
    </main>
  );
}
