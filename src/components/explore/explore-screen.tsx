"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { FeedGrid } from "~/components/feed/feed-grid";
import {
  markExploreOrigin,
  markFeedOrigin,
} from "~/components/feed/feed-origin";
import { buildTiles } from "~/components/feed/masonry";
import { Overture } from "~/components/landing/overture";
import { useOverture } from "~/components/landing/use-overture";
import { BottomSheet } from "~/components/ui/bottom-sheet";
import { Button } from "~/components/ui/button";
import { Loader } from "~/components/ui/loader";
import { Toolbar } from "~/components/ui/toolbar";
import {
  EXPLORE_ABOUT,
  EXPLORE_DISSOLVE_MS,
  EXPLORE_FEED_IMAGE_CAP,
  type ExploreAction,
} from "~/config/explore";
import { api } from "~/trpc/react";
import { AuthSurface, useAuthSurface, type AuthMode } from "./auth-surface";
import { capTiles } from "./explore-tiles";
import { MessageTile } from "./message-tile";
import {
  markOverturePlayed,
  overturePlayedThisDocument,
} from "./once-per-document";

// `/explore` — a signed-out taste of the feed (09-26-26, docs/PLAN_explore-route.md). The real
// feed, readable without an account, with a calm message block on every page (what is this? · sign
// up · sign in) and an end card after ~200 pictures. A second front door beside the landing at
// `/`, so the two can be compared; still invite-only — the sign-up it offers is the landing's own
// card, which turns an uninvited email away exactly as it does there.
//
// **What it is not: FeedScreen with a flag.** FeedScreen acks every page it receives, carries the
// reader's saves and the item sheet, and all of that is per-user. This screen shares the grid
// (`FeedGrid`) and the toolbar (`Toolbar`); what it adds is the cap, the blocks and the two
// surfaces they open. Nothing here is stored per visitor: `feed.explore` composes for nobody and
// there is no ack, so the cap is counted in the browser and a reload starts the taste over.
//
// **The toolbar is the app's own, not a header** (Ben, 09-26-26 — the wordmark-and-Sign-in bar
// went). Profile and Save both lead somewhere a stranger can't go, so on this screen each opens
// the sign-up sheet instead — the ask is the same either way ("Have an invite?"), and a visitor
// who already has an account switches to sign-in inside the card. Feed is the feed's own scroll-
// to-top, never the pill's default `/feed` push, which the proxy would bounce to the landing.
// No Share: a feed has no current item to refer to, same as `/feed`.

export interface ExploreScreenProps {
  /** topic id → chip label, for the Because tiles — same map `/feed` passes. */
  topicLabels: Record<string, string>;
  /** `?open=` — the item page's end card sends its actions here, so the page opens asking. */
  initialOpen?: ExploreAction;
}

export function ExploreScreen({
  topicLabels,
  initialOpen,
}: ExploreScreenProps) {
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

  // ── the two surfaces the blocks (and the toolbar) open ────────────────────────────────────────
  const auth = useAuthSurface(
    initialOpen === "signin" || initialOpen === "signup"
      ? initialOpen
      : undefined,
  );
  const [aboutOpen, setAboutOpen] = React.useState(initialOpen === "about");

  const { openAuth: openAuthSheet } = auth;
  // The about dialog closes under the card: the two never stack.
  const openAuth = React.useCallback(
    (mode: AuthMode) => {
      setAboutOpen(false);
      openAuthSheet(mode);
    },
    [openAuthSheet],
  );
  const onAction = React.useCallback(
    (action: ExploreAction) => {
      if (action === "about") setAboutOpen(true);
      else openAuth(action);
    },
    [openAuth],
  );

  // The same pop-back marker the feed writes, so the item page's Back returns here intact — plus
  // the explore marker, which gives the item page its capped rail and its way back here.
  const openItem = (id: string) => {
    markFeedOrigin(id);
    markExploreOrigin();
    router.push(`/i/${id}`);
  };

  // ── the overture (09-26-26) ───────────────────────────────────────────────────────────────────
  // The landing's opening line, on black, in place of a loading screen: the first page hydrates
  // underneath while it plays, and when its clock runs out the curtain — black and the collapsed
  // wordmark together — dissolves into the feed over `EXPLORE_DISSOLVE_MS` (Ben, 09-26-26: a
  // dissolve, not the landing's hard cut). Once per *document* (once-per-document.ts): a reload
  // replays it, Back from an item page does not. And never under a raised sheet — the landing's
  // rule for its own `static` mode — which is what `initialOpen` is.
  //
  // Decided in a lazy initializer, not an effect: on the server and on the hydration render the
  // flag is `false`, so the two agree, and a client-side remount reads the truth at once — no
  // render in which a skipped overture paints.
  const [overtureWanted] = React.useState(
    () => initialOpen === undefined && !overturePlayedThisDocument(),
  );
  const { phase } = useOverture(overtureWanted);
  React.useEffect(() => {
    if (overtureWanted) markOverturePlayed();
  }, [overtureWanted]);
  // `done` starts the dissolve; the curtain unmounts when the fade has run, and not on
  // `transitionend` — a background tab fires none, and the curtain would stay up.
  const dissolving = phase === "done";
  const [dissolved, setDissolved] = React.useState(false);
  React.useEffect(() => {
    if (!overtureWanted || !dissolving) return;
    const t = setTimeout(() => setDissolved(true), EXPLORE_DISSOLVE_MS);
    return () => clearTimeout(t);
  }, [overtureWanted, dissolving]);
  const curtainUp = overtureWanted && !dissolved;

  // If the feed is somehow still pending when the curtain lifts, the loader below is the fallback.
  const showLoader = isPending || isFetchingNextPage;

  return (
    <main className="bg-bg text-ink min-h-dvh">
      {/* Above the grid, below the sheets (z-35), which can't open while it's up anyway — and
          below the toolbar, which is why the toolbar hides itself until the dissolve: the
          curtain takes every pointer until it starts to fade. The Overture sits
          *inside* it so the two dissolve as one — its `difference` blend now composes against the
          curtain's own black (opacity makes the curtain a stacking context), which is white text,
          exactly as on the landing. Held at `collapse` through the fade: the line unmounts itself
          at `done`, and here it should stay and go with the black. `.motion-gentle`: an
          opacity-only fade is what reduced motion gets on the landing too, and globals.css would
          otherwise collapse it to a cut. */}
      {curtainUp ? (
        <div
          data-testid="explore-curtain"
          data-dissolving={dissolving}
          aria-hidden
          className="motion-gentle fixed inset-0 z-[10]"
          style={{
            background: "#000",
            opacity: dissolving ? 0 : 1,
            transition: dissolving
              ? `opacity ${EXPLORE_DISSOLVE_MS}ms ease`
              : "none",
            pointerEvents: dissolving ? "none" : "auto",
          }}
        >
          <Overture phase={dissolving ? "collapse" : phase} />
        </div>
      ) : null}

      {/* The toolbar sits *above* the curtain (z-30 over z-10), so it is hidden until the
          dissolve starts and fades in with the feed on its own 600 ms. */}
      <Toolbar
        visible={!curtainUp || dissolving}
        bookmark="idle"
        onProfile={() => openAuth("signup")}
        onBookmark={() => openAuth("signup")}
        onHome={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      />

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
        <div className="flex items-center justify-center pt-5 pb-[26px]">
          <Loader label="finding something interesting…" />
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

      <AuthSurface {...auth} collapseLabel="Back to exploring" />
    </main>
  );
}
