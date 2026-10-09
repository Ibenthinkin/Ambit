"use client";

import * as React from "react";

import { Column } from "~/components/ui/column";
import { Rise } from "~/components/ui/rise";
import { useColumnCount } from "~/hooks/use-media-query";
import { cn } from "~/lib/utils";
import { ArticleCard } from "./article-card";
import { BecauseTile } from "./because-tile";
import { ImageTile } from "./image-tile";
import {
  GRID_COLS,
  isCardTile,
  packColumns,
  type CardTile,
  type FeedTile,
} from "./masonry";
import { TILE_LIFT } from "./tile-lift";
import { WritingTile } from "./writing-tile";

/** `/explore`'s message block tile (09-26-26). */
export type MessageTileData = Extract<FeedTile, { kind: "message" }>;

// The feed's masonry and its infinite scroll, shared by `/feed` (FeedScreen) and `/explore`
// (ExploreScreen) since 09-26-26 (docs/PLAN_explore-route.md). Extracted rather than forked:
// FeedScreen is authed through and through — `feed.page`, the receipt ack, the item sheet, the
// hover strip, the dev knobs — and a screen's hooks can't be switched on and off by a prop. What
// the two screens share is everything below the query: packing tiles into columns, rising page
// one in, and asking for the next page when the reader nears the bottom. The authed extras come
// in through the render hooks.
//
// **The scroll container is the window.** The prototype scrolls an inner `<div>` because it's
// rendered inside an iOS-frame mockup; the real app's equivalent of that frame is the viewport.
// Getting this wrong is the same class of bug 5.5 hit three separate times with
// `absolute`-vs-`fixed`, and here it has a second face: the IntersectionObserver's root must be
// the viewport (its default), never a ref'd element.

export type { CardTile };

/** What a long-press (or a fine-pointer right-click) hands the screen: enough for the item sheet. */
export interface PressedItem {
  id: string;
  title: string;
  /** The slot the card was served under — a save bumps it (docs/DESIGN_chrome-redesign.md §5). */
  topicId: string | null;
}

export interface FeedGridProps {
  /** Every tile, in order — `buildTiles`' output, after whatever the screen does to it. */
  tiles: FeedTile[];
  /** How many of `tiles` belong to the first page. Only those rise in. */
  firstPageCount: number;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  fetchNextPage: () => Promise<unknown>;
  /** A tap on a card. */
  onOpen: (id: string) => void;
  /** A long-press on a card. Absent → cards have no item menu. */
  onLongPress?: (item: PressedItem) => void;
  /** Drawn over a card as a sibling of it (the hover strip; the Less veil). */
  renderTileExtras?: (tile: CardTile) => React.ReactNode;
  /** `/explore`'s message blocks. Only a screen that asks `buildTiles` for them gets any. */
  renderMessage?: (tile: MessageTileData) => React.ReactNode;
}

/**
 * How far below the fold the sentinel may sit and still count as "near the bottom" — the observer's
 * `rootMargin` and the re-check's measurement, one number so the two can never disagree about it.
 * Half a phone screen: the next page is on its way before the reader reaches the end of this one.
 */
const TRIP_MARGIN_PX = 500;

export function FeedGrid({
  tiles,
  firstPageCount,
  hasNextPage,
  isFetchingNextPage,
  isFetchNextPageError,
  fetchNextPage,
  onOpen,
  onLongPress,
  renderTileExtras,
  renderMessage,
}: FeedGridProps) {
  // 2 / 3 / 4 by viewport, hydration-safe — see `useMediaQuery` on why it isn't an effect.
  const columnCount = useColumnCount();

  const { columns, firstPageTiles } = React.useMemo(
    () => ({
      columns: packColumns(tiles, columnCount),
      // Only the first page gets an entrance animation, so the set of tiles that belong to it has
      // to be identifiable after packing has interleaved them into its columns.
      firstPageTiles: new Set(tiles.slice(0, firstPageCount)),
    }),
    [tiles, firstPageCount, columnCount],
  );

  // ── infinite scroll ───────────────────────────────────────────────────────────────────────────
  // Two things ask for the next page, and both go through `requestNextPage`:
  //
  //   - **The observer**, for the reader scrolling: it fires when the sentinel *crosses* into the
  //     500px margin below the fold.
  //   - **The re-check** (09-10-26), for everything that moves the answer *without* a crossing —
  //     a page landing, the query learning there is a next page. See the effect below for the bug
  //     that made it necessary.
  //
  // The observer is created ONCE and never rebuilt, because tearing it down and re-observing on
  // every render is how an observer starts missing intersections. The moving parts (`hasNextPage`,
  // the fetch itself) reach it through a ref instead — the same lesson as `BottomSheet`'s
  // `onCloseRef`, where an inline arrow in the deps rebuilt the effect on every parent render.
  const sentinelRef = React.useRef<HTMLDivElement>(null);
  const loadMoreRef = React.useRef<() => void>(() => undefined);

  // Synchronous, where `isFetchingNextPage` is a render behind: with two askers, the observer and
  // the re-check can both fire in the frame before React has re-rendered with the fetch in flight,
  // and a second `fetchNextPage` would cancel the first and start it again.
  const requesting = React.useRef(false);
  const requestNextPage = React.useCallback(() => {
    if (requesting.current) return;
    requesting.current = true;
    void Promise.resolve(fetchNextPage()).finally(() => {
      requesting.current = false;
    });
  }, [fetchNextPage]);

  React.useEffect(() => {
    loadMoreRef.current = () => {
      if (hasNextPage && !isFetchingNextPage) requestNextPage();
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
      { rootMargin: `${TRIP_MARGIN_PX}px` },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // **The re-check — decided from where the sentinel *is*, not from a crossing (09-10-26).**
  //
  // An `IntersectionObserver` calls back only when a target crosses its threshold. On a first
  // load its one callback lands while the feed is still empty — the sentinel right under the
  // header, "intersecting", with nothing to load yet — and then page one arrives. If that page is
  // short enough to leave the sentinel inside the margin, nothing ever crosses again, and three
  // things follow from one missing callback: page 2 never loads, a scroll to the bottom never
  // appends (the sentinel was in range all along), and the next remount — the reader popping back
  // from an item — loads it instead, which is the one moment the feed promises to draw nothing.
  // A twelve-card first page at the phone viewport is ~1,450px: measured in a production build,
  // the sentinel sat 505–533px below the fold on the runs that got lucky.
  //
  // So whenever the answer can change without a crossing — a page lands, a fetch settles, the
  // query learns there's a next page — measure the sentinel and ask if it's in range. Measured
  // (`getBoundingClientRect` forces layout, so it is the committed truth), never read back from
  // the observer: its update for the new layout may not have been delivered yet, and a stale
  // "intersecting" would pull a page the reader is nowhere near — on `/feed` every page received
  // is acked, so that would be corpus spent on nothing.
  //
  // Skipped after a failed next page: the re-check must never become a retry loop. The reader's
  // own scroll — a real crossing, through the observer — still asks again, exactly as before.
  React.useEffect(() => {
    if (!hasNextPage || isFetchingNextPage || isFetchNextPageError) return;
    const el = sentinelRef.current;
    if (!el) return;
    if (el.getBoundingClientRect().top < window.innerHeight + TRIP_MARGIN_PX) {
      requestNextPage();
    }
  }, [
    tiles.length,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    requestNextPage,
  ]);

  const renderTile = (tile: FeedTile) => {
    if (tile.kind === "because") {
      return <BecauseTile from={tile.from} to={tile.to} />;
    }
    if (tile.kind === "message") return renderMessage?.(tile) ?? null;
    const { item } = tile.card;
    const gestures = {
      onTap: () => onOpen(item.id),
      onLongPress: onLongPress
        ? () =>
            onLongPress({
              id: item.id,
              title: item.title,
              topicId: tile.card.topicId,
            })
        : undefined,
    };
    switch (tile.kind) {
      case "image":
        return (
          <ImageTile
            card={tile.card}
            aspectClass={tile.aspectClass}
            {...gestures}
          />
        );
      case "writing-picture":
        return (
          <WritingTile
            card={tile.card}
            aspectClass={tile.aspectClass}
            {...gestures}
          />
        );
      case "article":
        return <ArticleCard card={tile.card} {...gestures} />;
    }
  };

  return (
    <>
      {/* `items-start` so a short column doesn't stretch to match a tall one — the columns are
          independent stacks that happen to sit side by side, which is the whole idea of a masonry.
          The `Column` is the desktop cap (docs/DESIGN_desktop-polish.md §2): 1120px, centered in
          whatever the dev drawer leaves. */}
      <Column width="wide">
        <div
          data-testid="feed-columns"
          className={cn(
            "grid items-start gap-1 px-1 pt-[58px]",
            GRID_COLS[columnCount],
          )}
        >
          {columns.map((column, columnIndex) => (
            <div key={columnIndex} className="flex flex-col gap-1">
              {column.map((tile, tileIndex) => {
                // Because and message tiles carry no `data-feed-id`: they're not items, and
                // `?focus=` resolves an *item*, so giving them an id would only create a second
                // thing to scroll to.
                const isCard = isCardTile(tile);
                const key = isCard ? tile.card.item.id : tile.key;
                const body = (
                  <div
                    data-feed-id={isCard ? key : undefined}
                    // `group/tile` + `TILE_LIFT`: the hover strip below is a sibling overlay
                    // keyed on this wrapper's hover (docs/DESIGN_chrome-redesign.md §3), and the
                    // Lift (tile-lift.ts) scales the whole wrapper so tile and strip rise as one.
                    // Second child on purpose — e2e reaches the tile as `[data-feed-id] > *`
                    // `.first()`.
                    className={isCard ? cn("group/tile", TILE_LIFT) : undefined}
                  >
                    {renderTile(tile)}
                    {renderTileExtras && isCard ? renderTileExtras(tile) : null}
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
      </Column>

      {/* The infinite-scroll trip wire. Always rendered — an observer with nothing to observe is
          an observer that never fires again once the list grows. */}
      <div ref={sentinelRef} data-testid="feed-sentinel" className="h-px" />
    </>
  );
}
