"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { FeedGrid } from "~/components/feed/feed-grid";
import { markFeedOrigin } from "~/components/feed/feed-origin";
import { buildTiles } from "~/components/feed/masonry";
import { AuthCard } from "~/components/landing/auth-card";
import { AuthSheet } from "~/components/landing/auth-sheet";
import { BottomSheet } from "~/components/ui/bottom-sheet";
import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import {
  EXPLORE_ABOUT,
  EXPLORE_FEED_IMAGE_CAP,
  type ExploreAction,
} from "~/config/explore";
import { api } from "~/trpc/react";
import { capTiles } from "./explore-tiles";
import { MessageTile } from "./message-tile";

// `/explore` — a signed-out taste of the feed (09-26-26, docs/PLAN_explore-route.md). The real
// feed, readable without an account, with a calm message block on every page (what is this? · sign
// up · sign in) and an end card after ~200 pictures. A second front door beside the landing at
// `/`, so the two can be compared; still invite-only — the sign-up it offers is the landing's own
// card, which turns an uninvited email away exactly as it does there.
//
// **What it is not: FeedScreen with a flag.** FeedScreen acks every page it receives, carries the
// reader's saves, the item sheet and the pill, and all of that is per-user. This screen shares
// only the grid (`FeedGrid`); what it adds is the cap, the blocks and the two surfaces they open.
// Nothing here is stored per visitor: `feed.explore` composes for nobody and there is no ack, so
// the cap is counted in the browser and a reload starts the taste over.

type AuthMode = "signin" | "signup";

export interface ExploreScreenProps {
  /** topic id → chip label, for the Because tiles — same map `/feed` passes. */
  topicLabels: Record<string, string>;
}

export function ExploreScreen({ topicLabels }: ExploreScreenProps) {
  const router = useRouter();

  const feed = api.feed.explore.useInfiniteQuery(
    // **`{}` — byte-identical to /explore/page.tsx's prefetch**, the same hydration contract as
    // `/feed` (see FeedScreen): a different input is a different query key, and the server's
    // first page would sit unused while the client fetched another.
    {},
    {
      getNextPageParam: (last) => last.nextCursor,
      // Nothing is acked here, so a stray refetch costs no corpus — but it would still reshuffle
      // the pictures under a reader's thumb, which is reason enough to hold the line /feed holds.
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  );
  const { data, hasNextPage, isFetchingNextPage, isPending, fetchNextPage } =
    feed;

  const pages = React.useMemo(() => data?.pages ?? [], [data]);

  const { tiles, firstPageCount, capped } = React.useMemo(() => {
    const opts = { messages: true };
    const built = buildTiles(pages, topicLabels, opts);
    const firstPage =
      pages.length > 0 ? buildTiles([pages[0]!], topicLabels, opts) : [];
    // `ended`: the server has no next page — its backstop, or nothing left to offer. Either way
    // the taste closes on the end card, same as at the cap.
    const ended = !isPending && !feed.isError && !hasNextPage;
    const out = capTiles(built, {
      imageCap: EXPLORE_FEED_IMAGE_CAP,
      ended,
    });
    return {
      tiles: out.tiles,
      firstPageCount: firstPage.length,
      capped: out.capped,
    };
  }, [pages, topicLabels, isPending, feed.isError, hasNextPage]);

  // ── the two surfaces the blocks open ──────────────────────────────────────────────────────────
  // `authKey` remounts the card on every open, so `initialMode` takes effect each time and a
  // half-typed form from the last opening doesn't linger under a different heading.
  const [auth, setAuth] = React.useState<{ open: boolean; mode: AuthMode }>({
    open: false,
    mode: "signin",
  });
  const [authKey, setAuthKey] = React.useState(0);
  const [aboutOpen, setAboutOpen] = React.useState(false);

  const openAuth = React.useCallback((mode: AuthMode) => {
    setAboutOpen(false);
    setAuthKey((k) => k + 1);
    setAuth({ open: true, mode });
  }, []);
  const closeAuth = React.useCallback(
    () => setAuth((a) => ({ ...a, open: false })),
    [],
  );
  const onAction = React.useCallback(
    (action: ExploreAction) => {
      if (action === "about") setAboutOpen(true);
      else openAuth(action);
    },
    [openAuth],
  );

  // Escape leaves the auth sheet, as it does every other sheet in the app. (The landing's sheet
  // has no Escape because there it *is* the screen; here it sits over one.)
  React.useEffect(() => {
    if (!auth.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAuth();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [auth.open, closeAuth]);

  // The same pop-back marker the feed writes: the item page's Back returns here intact.
  const openItem = (id: string) => {
    markFeedOrigin(id);
    router.push(`/i/${id}`);
  };

  const showLoader = isPending || isFetchingNextPage;

  return (
    <main className="bg-bg text-ink min-h-dvh">
      {/* The header: the wordmark, and a way in for someone who already has an account. Not the
          pill — every control on it leads somewhere a stranger can't go. */}
      <header className="bg-bg/66 border-ink/8 fixed inset-x-0 top-0 z-[8] flex h-[50px] items-center justify-between border-b-[0.5px] px-4 backdrop-blur-[18px] backdrop-saturate-[160%]">
        <span className="text-ink-hi text-[15px] font-semibold tracking-[3px]">
          {/* The overture's wordmark, spelled out rather than imported: overture.tsx loads the
              landing's fonts at module scope, and this header needs none of them. */}
          AMBIT
        </span>
        <button
          type="button"
          onClick={() => openAuth("signin")}
          className="text-ink/82 text-[14px] font-medium"
        >
          Sign in
        </button>
      </header>

      <FeedGrid
        tiles={tiles}
        firstPageCount={firstPageCount}
        hasNextPage={hasNextPage && !capped}
        isFetchingNextPage={isFetchingNextPage}
        isFetchNextPageError={feed.isFetchNextPageError}
        fetchNextPage={fetchNextPage}
        onOpen={openItem}
        renderMessage={(tile) => (
          <MessageTile message={tile.message} onAction={onAction} />
        )}
      />

      {showLoader ? (
        <div className="flex items-center justify-center gap-[10px] pt-5 pb-[26px]">
          <Spinner size={15} />
          <span className="text-ink/40 text-[14px]">
            finding something interesting…
          </span>
        </div>
      ) : null}

      {/* A failure must never read as an ordinary outcome — same rule as the feed. */}
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

      <div className="h-16" />

      <BottomSheet
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        title={EXPLORE_ABOUT.title}
      >
        <div className="px-[22px] pb-[calc(22px+env(safe-area-inset-bottom))]">
          {EXPLORE_ABOUT.paragraphs.map((p) => (
            <p
              key={p}
              className="text-ink/72 mt-3 text-[14.5px] leading-[1.6] first:mt-1"
            >
              {p}
            </p>
          ))}
          <div className="mt-5 flex gap-2">
            <Button className="flex-1" onClick={() => openAuth("signup")}>
              Sign up
            </Button>
            <Button
              className="flex-1"
              variant="ghost"
              onClick={() => openAuth("signin")}
            >
              Sign in
            </Button>
          </div>
        </div>
      </BottomSheet>

      {/* The landing's scrim is inert (its reel is tap-to-skip underneath); over a feed, a tap
          outside the sheet should close it rather than open a picture through it. */}
      {auth.open ? (
        <div
          aria-hidden
          data-testid="auth-scrim"
          className="fixed inset-0 z-[35]"
          onClick={closeAuth}
        />
      ) : null}
      <AuthSheet
        open={auth.open}
        onCollapse={closeAuth}
        collapseLabel="Back to exploring"
      >
        <AuthCard key={authKey} initialMode={auth.mode} />
      </AuthSheet>
    </main>
  );
}
