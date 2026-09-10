"use client";

import * as React from "react";
import { keepPreviousData } from "@tanstack/react-query";

import { HeroRail } from "~/components/item/hero-rail";
import { ItemFacts } from "~/components/item/item-facts";
import { JoinCta } from "~/components/item/join-cta";
import { SharedByRow } from "~/components/item/shared-by-row";
import { WanderNext } from "~/components/item/wander-next";
import { SaveToCollectionSheet } from "~/components/sheets/save-to-collection-sheet";
import { ShareSheet } from "~/components/sheets/share-sheet";
import { Column } from "~/components/ui/column";
import { PillToolbar } from "~/components/ui/pill-toolbar";
import { Rise } from "~/components/ui/rise";
import { Toast } from "~/components/ui/toast";
import { useChromeCycle } from "~/hooks/use-chrome-cycle";
import { useLeaveToFeed } from "~/hooks/use-leave-to-feed";
import { DESKTOP_QUERY, useMediaQuery } from "~/hooks/use-media-query";
import { useRailGestures } from "~/hooks/use-rail-gestures";
import { imageFileName } from "~/lib/image-filename";
import { saveToastText } from "~/lib/save-toast";
import { sourceLabel } from "~/lib/source-label";
import type { RailItem } from "~/server/services/gallery-rail";
import type { WanderRow } from "~/server/services/wander";
import { api } from "~/trpc/react";

// `/i/[itemId]` for a picture — the signature screen, and since 09-10-26 the *only* picture screen
// (docs/DESIGN_screen-structure.md §1). The immersive gallery (`/g/`, 5.8) and the item page were
// two rooms for one work; this is the one room.
//
//   - **The picture first, edge to edge, as big as it can be.** `HeroRail` at the very top of a
//     page you scroll: swipe sideways and the rail advances; scroll down and the facts are there.
//     No details sheet, no "tap for more" — "the location of a tap makes too much difference in
//     the response" (Ben's desktop review).
//   - **The chrome starts hidden** and comes back on a ten-second loop (`useChromeCycle`). A tap
//     brings it up, another puts it away; on desktop a mouse moving over the picture brings it up.
//   - **Swiping goes somewhere, and the page follows.** The rail is `services/gallery-rail.ts`'s
//     endless wander — the topic graph chooses where, a curated-weighted draw chooses what — and
//     it **never marks anything seen**: swiping spends none of the reader's corpus, which is the
//     whole reason it isn't `feed.page` (log.md 08-20-26). On advance the URL is `replaceState`d
//     to the new item so the address bar, a reload and the share sheet all name what is on
//     screen — no navigation, no server round trip, the track animates.
//   - **Every way out is `useLeaveToFeed(entryItem)`**: Escape, the down-flick, the pill's Feed.
//     Keyed on the *entry* item, whose feed-origin marker decides pop-vs-push, so ten swipes later
//     Back still lands on the intact feed.
//   - **Signed-out visitors get the picture, the facts and the way out.** The pill, the sheets and
//     every protected query sit behind `authed`. Leaving is not a privilege, and neither is looking.
//
// Articles don't come here: they keep the reader layout inside `ItemShell` (see the page).

export interface ItemScreenProps {
  /** The work the page was opened on. Its id anchors the exits and the origin marker. */
  entryItem: RailItem;
  /** Server-drawn first stretch of rail, entry item first. */
  initialRail: RailItem[];
  /** `items.wanderNext` for the entry item, resolved on the server so a cold link pays no client request. */
  initialWander: WanderRow[];
  authed: boolean;
  /** The app's own origin (`env.BETTER_AUTH_URL`), for building an absolute share URL. */
  appUrl: string;
  /** The signed-in reader's first name, if any — becomes `?from=` on the link they share. */
  viewerName?: string;
  /** `?from=` on the link that brought this reader here, already validated by the page. */
  sharedBy: string | null;
}

/** How many cells per fetch, and how close to an end the reader gets before the next one starts. */
const BATCH = 8;
const PREFETCH_MARGIN = 3;

/** Mirrors the router's `exclude` cap. Past this the rail accepts a rare repeat far behind. */
const EXCLUDE_CAP = 200;

/** A mouse that jitters fires pointer moves at 60Hz; the chrome needs one call per quarter second. */
const MOUSEMOVE_THROTTLE_MS = 250;

export function ItemScreen({
  entryItem,
  initialRail,
  initialWander,
  authed,
  appUrl,
  viewerName,
  sharedBy,
}: ItemScreenProps) {
  const [items, setItems] = React.useState<RailItem[]>(initialRail);
  const [index, setIndex] = React.useState(0);
  // Each end stops asking once a batch comes back short — the corpus has nothing more that way. The
  // tail starts exhausted when the server's own first draw came back short, which is the thin-corpus
  // case (and every e2e run).
  const [exhausted, setExhausted] = React.useState({
    head: false,
    tail: initialRail.length <= BATCH,
  });

  const [saveOpen, setSaveOpen] = React.useState(false);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);

  const chrome = useChromeCycle();
  const leave = useLeaveToFeed(entryItem.id);
  const desktop = useMediaQuery(DESKTOP_QUERY);

  const current = items[index] ?? entryItem;

  const utils = api.useUtils();
  // `enabled: authed` is the auth boundary in client form — an anonymous visitor must not fire a
  // protected procedure and collect an UNAUTHORIZED in their console. Same rule as `item-shell`.
  const saved = api.saves.forItem.useQuery(
    { itemId: current.id },
    { enabled: authed },
  );
  // Keyed on whatever is on screen, so the teaser under a swiped-to picture is *its* teaser. The
  // entry item's answer is `initialData` from the server, and the query client's 30s `staleTime`
  // (trpc/query-client.ts) means it is not refetched on mount — which is what keeps a cold share
  // link at zero client requests. `keepPreviousData` holds the old rows through the one fetch a
  // swipe costs, so the block doesn't blank and re-rise.
  const wander = api.items.wanderNext.useQuery(
    { itemId: current.id },
    {
      placeholderData: keepPreviousData,
      initialData: current.id === entryItem.id ? initialWander : undefined,
    },
  );

  // ── fetching more rail ────────────────────────────────────────────────────────────────────────
  // One fetch per end at a time. A ref rather than state: this guards an async call, and a
  // re-render's worth of latency is exactly long enough for a fast swiper to start a second one.
  const inFlight = React.useRef({ head: false, tail: false });

  const extend = React.useCallback(
    async (end: "head" | "tail") => {
      if (inFlight.current[end]) return;
      inFlight.current[end] = true;
      try {
        // Anchored on the outermost cell at that end, so the walk continues from where the rail
        // actually stops rather than restarting at the entry item.
        const anchor = end === "tail" ? items[items.length - 1] : items[0];
        if (!anchor) return;

        const batch = await utils.items.galleryRail.fetch({
          itemId: anchor.id,
          count: BATCH,
          // The most recent ids, which are the ones a repeat would actually be noticed against.
          exclude: items.slice(-EXCLUDE_CAP).map((i) => i.id),
        });

        if (batch.length < BATCH) {
          setExhausted((prev) => ({ ...prev, [end]: true }));
        }
        if (batch.length === 0) return;

        if (end === "tail") {
          setItems((prev) => [...prev, ...batch]);
        } else {
          // Reversed: the draw walks *away* from the anchor, so the cell drawn first belongs
          // nearest to it — which, at the head, means last in the prepended run.
          setItems((prev) => [...batch].reverse().concat(prev));
          // Everything shifted right by a batch, including where the reader is standing.
          setIndex((i) => i + batch.length);
        }
      } finally {
        inFlight.current[end] = false;
      }
    },
    [items, utils],
  );

  React.useEffect(() => {
    if (!exhausted.tail && index >= items.length - 1 - PREFETCH_MARGIN) {
      void extend("tail");
    }
    if (!exhausted.head && index <= PREFETCH_MARGIN) {
      void extend("head");
    }
  }, [index, items.length, exhausted, extend]);

  // ── advancing ─────────────────────────────────────────────────────────────────────────────────
  const advance = React.useCallback(
    (dir: 1 | -1) => {
      setIndex((i) => {
        const next = i + dir;
        // Past a loaded end: stay put. The transform snaps back on its own, which reads as a
        // rubber-band — the corpus-thin degradation, and deliberately not a wrap.
        if (next < 0 || next >= items.length) return i;
        return next;
      });
      chrome.reset();
    },
    [items.length, chrome],
  );

  // The address bar follows the rail. `replaceState`, not `router.replace`: this is the same page
  // showing a different cell, not a navigation, and a navigation would re-run the server component
  // and blank the track mid-animation. The feed-origin marker is keyed on the entry item and is
  // untouched, so `leave()` still pops. Skipped while the entry item is on screen, so a fresh load
  // rewrites nothing — except after a swipe *back* to it, where the bar has to come home too.
  const rewritten = React.useRef(false);
  React.useEffect(() => {
    if (current.id === entryItem.id && !rewritten.current) return;
    rewritten.current = true;
    window.history.replaceState(null, "", `/i/${current.id}`);
    document.title = `${current.title} · Ambit`;
  }, [current.id, current.title, entryItem.id]);

  // ── keyboard ──────────────────────────────────────────────────────────────────────────────────
  // (docs/DESIGN_desktop-polish.md §4, and Ben's 09-10 review: Escape did nothing on the old item
  // page at all.) On `window`, because nothing here holds focus — the rail is a gesture surface,
  // not a control. While a sheet is up it owns Escape (BottomSheet's own listener closes it), and
  // an arrow that changed the picture under an open sheet would be a surprise, so all three are
  // ignored until it's gone.
  const sheetOpen = saveOpen || shareOpen;
  React.useEffect(() => {
    if (sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") advance(1);
      else if (e.key === "ArrowLeft") advance(-1);
      else if (e.key === "Escape") leave();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen, advance, leave]);

  // ── gestures ──────────────────────────────────────────────────────────────────────────────────
  const { ref, dragPx, dragging } = useRailGestures({
    // A tap only ever toggles the chrome now. The gallery's tap-again-for-details went with the
    // details sheet: the details are on the page, under the picture.
    onTap: chrome.toggle,
    onAdvance: advance,
    onExit: leave,
  });

  // Desktop: a mouse moving over the page is a request for the caption, and unlike a tap it never
  // hides it. Throttled — pointer moves fire continuously. `-Infinity` so the very first one counts.
  //
  // **A pointer event filtered to `pointerType === "mouse"`, never `onMouseMove`.** After a tap on
  // a touch screen the browser fires *compatibility* mouse events — `mousemove` among them — so a
  // `mousemove` summon would re-show the chrome the instant a second tap had put it away, and
  // tap-to-hide would simply never work on a phone. Compatibility events are mouse events, not
  // pointer events; a finger's own `pointermove` says `touch`. So this hears a real mouse only.
  const lastMove = React.useRef(Number.NEGATIVE_INFINITY);
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    if (e.timeStamp - lastMove.current < MOUSEMOVE_THROTTLE_MS) return;
    lastMove.current = e.timeStamp;
    chrome.show();
  };

  // ── share + save ──────────────────────────────────────────────────────────────────────────────
  // Always `/i/{current}` — the picture on screen, which since the URL follows the rail is also
  // what the address bar says.
  const shareUrl = `${appUrl}/i/${current.id}${
    viewerName ? `?from=${encodeURIComponent(viewerName)}` : ""
  }`;

  /**
   * Hand the full-resolution image to the OS, keyed to whatever is on screen.
   * `navigator.share({ files })` is the path that actually reaches an iOS camera roll; the
   * `<a download>` fallback is for desktop and browsers that can't share files.
   */
  const saveImage = React.useCallback(async () => {
    const itemId = current.id;
    try {
      const res = await fetch(`/api/img/${itemId}`);
      if (!res.ok) throw new Error(`image ${res.status}`);
      const blob = await res.blob();
      // The extension follows what the proxy actually served (WebP since 7.3) rather than a
      // hardcoded `.jpg` — see lib/image-filename.ts for why that matters to the OS.
      const name = imageFileName(itemId, blob.type);
      const file = new File([blob], name, { type: blob.type });

      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
        } catch (err) {
          // Dismissing the OS sheet rejects with AbortError — a normal outcome, not a failure.
          if ((err as Error)?.name !== "AbortError") throw err;
        }
        return;
      }

      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = name;
      a.click();
      URL.revokeObjectURL(href);
      setToast("Image saved");
    } catch {
      setToast("Couldn't save that image");
    }
  }, [current.id]);

  // ── render ────────────────────────────────────────────────────────────────────────────────────

  // The three cells on screen: the one before, the one you're looking at, and the one after. An
  // absent neighbour (either end of a loaded rail) renders as an empty cell, which is what makes
  // the rubber-band look like an edge rather than a missing image.
  const cells = [items[index - 1], current, items[index + 1]] as const;

  const caption = (
    <>
      {/* An `<h2>`, not the gallery's old `<h1>`: the page's one `<h1>` is `ItemFacts`'s, and e2e's
          `getByRole("heading", { level: 1 })` must find exactly one. */}
      <div className="pointer-events-auto">
        <h2 className="text-ink-hi text-[22px] leading-[1.24] font-semibold">
          {current.title}
        </h2>
        <p className="text-ink/52 mt-[7px] text-[12.5px] tracking-[0.15px]">
          {current.attribution ?? sourceLabel(current.source)}
        </p>
      </div>
      {authed ? (
        // `static`, so the pill rides inside the fading chrome block instead of floating
        // independently of it — this is the one screen where it belongs to something.
        <PillToolbar
          className="static bottom-auto mt-[20px]"
          bookmark={saved.data?.saved ? "saved" : "idle"}
          onBookmark={() => setSaveOpen(true)}
          onShare={() => setShareOpen(true)}
          // NOT the pill's default `/feed` push: that re-runs the dynamic route and draws a fresh
          // page of cards. See `useLeaveToFeed`.
          onHome={leave}
        />
      ) : null}
    </>
  );

  return (
    // `overscroll-behavior-y: contain`: the down-flick exit must never also be a pull-to-refresh.
    <main
      className="bg-bg text-ink min-h-dvh pb-[110px]"
      style={{ overscrollBehaviorY: "contain" }}
      onPointerMove={onPointerMove}
    >
      <HeroRail
        cells={cells}
        trackRef={ref}
        dragPx={dragPx}
        dragging={dragging}
        chrome={caption}
        chromeVisible={chrome.visible}
        desktop={desktop}
      />

      {/* A book-width measure above `md` (docs/DESIGN_desktop-polish.md §1, §4) — the picture is
          edge to edge, the words are not. */}
      <Column width="reader" className="px-[22px]">
        {sharedBy ? (
          <Rise>
            <SharedByRow name={sharedBy} />
          </Rise>
        ) : null}

        <Rise delayMs={50}>
          <ItemFacts item={current} />
        </Rise>

        <Rise delayMs={120}>
          <WanderNext rows={wander.data ?? []} />
        </Rise>

        {authed ? null : (
          <Rise delayMs={160}>
            <JoinCta variant="image" />
          </Rise>
        )}
      </Column>

      {authed ? (
        <>
          <SaveToCollectionSheet
            open={saveOpen}
            onClose={() => setSaveOpen(false)}
            itemId={current.id}
            currentCollectionId={saved.data?.collectionId ?? undefined}
            onSaved={async (collection, drift) => {
              setToast(saveToastText(collection.name, drift));
              await utils.saves.forItem.invalidate({ itemId: current.id });
            }}
            onError={setToast}
          />

          <ShareSheet
            open={shareOpen}
            onClose={() => setShareOpen(false)}
            url={shareUrl}
            title={current.title}
            // Always true here: this screen is only ever a picture.
            imageContext
            onSaveImage={() => void saveImage()}
            onCopied={() => setToast("Link copied")}
            onShareUnavailable={() => setToast("Sharing isn't available here")}
          />

          {/* `raised` — this screen mounts the pill, and an unraised toast would sit behind it. */}
          <Toast
            text={toast ?? ""}
            open={toast !== null}
            onDone={() => setToast(null)}
            raised
          />
        </>
      ) : null}
    </main>
  );
}
