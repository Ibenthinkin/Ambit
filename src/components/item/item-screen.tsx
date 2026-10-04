"use client";

import * as React from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { AuthSurface, useAuthSurface } from "~/components/explore/auth-surface";
import { MessageTile } from "~/components/explore/message-tile";
import { cameFromExplore } from "~/components/feed/feed-origin";
import { HeroRail } from "~/components/item/hero-rail";
import { ItemFacts } from "~/components/item/item-facts";
import { JoinCta } from "~/components/item/join-cta";
import { buildCells } from "~/components/item/rail-cells";
import { SharedByRow } from "~/components/item/shared-by-row";
import { SpreadToggle } from "~/components/item/spread-toggle";
import {
  bookLayers,
  folioNumber,
  turnLayers,
  type Motion,
} from "~/components/item/spread-motion";
import { WanderNext } from "~/components/item/wander-next";
import { SaveToCollectionSheet } from "~/components/sheets/save-to-collection-sheet";
import { ShareSheet } from "~/components/sheets/share-sheet";
import { Column } from "~/components/ui/column";
import { PillToolbar } from "~/components/ui/pill-toolbar";
import { RailToolbar } from "~/components/ui/rail-toolbar";
import { Rise } from "~/components/ui/rise";
import { Toast } from "~/components/ui/toast";
import { EXPLORE_RAIL_CAP } from "~/config/explore";
import { useChromeCycle } from "~/hooks/use-chrome-cycle";
import { useLeaveToFeed } from "~/hooks/use-leave-to-feed";
import { DESKTOP_QUERY, useMediaQuery } from "~/hooks/use-media-query";
import { useRailGestures } from "~/hooks/use-rail-gestures";
import {
  IDENTITY,
  ceiling,
  doubleTapTarget,
  fitRect,
  live,
  pinchUpdate,
  settle,
  type Point,
  type Rect,
  type Size,
  type Zoom,
  type ZoomState,
} from "~/lib/zoom-math";
import { useHeroLayout, writeHeroLayout } from "~/lib/hero-layout";
import { imageFileName } from "~/lib/image-filename";
import { saveToastText } from "~/lib/save-toast";
import { sourceLabel } from "~/lib/source-label";
import { cn } from "~/lib/utils";
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
//     The chrome is the caption over the picture's foot *and* the toolbar — the phone's pill fixed
//     at the bottom, the desktop's rail at the right — both fading on the same 600ms.
//   - **Swiping goes somewhere, and the page follows.** The rail is `services/gallery-rail.ts`'s
//     endless wander — the topic graph chooses where, a curated-weighted draw chooses what — and
//     it **never marks anything seen**: swiping spends none of the reader's corpus, which is the
//     whole reason it isn't `feed.page` (log.md 08-20-26). On advance the URL is `replaceState`d
//     to the new item so the address bar, a reload and the share sheet all name what is on
//     screen — no navigation, no server round trip, the track animates.
//   - **On a computer the strip can be a two-page spread** (09-27-26, docs/DESIGN_spread-mode.md):
//     the rail's toggle puts two consecutive pictures side by side, like an open magazine, and a
//     turn moves the rail by two. The left page is *the item* — the URL, Save, Share, caption and
//     facts all follow it — until a click on the right page focuses that one instead. Everything
//     below reads `current`, so the spread is invisible to it.
//   - **Every way out is `useLeaveToFeed(entryItem)`**: Escape, the down-flick, the pill's Feed.
//     Keyed on the *entry* item, whose feed-origin marker decides pop-vs-push, so ten swipes later
//     Back still lands on the intact feed.
//   - **Signed-out visitors get the picture, the facts, the way out — and, since 09-26-26, the
//     toolbar.** Share works as it does for anyone (a link is a link); Profile and Save lead
//     somewhere a stranger can't go, so each raises the sign-up sheet in place (`AuthSurface`)
//     instead — the picture stays under it. The save sheet and every protected query still sit
//     behind `authed`. Leaving is not a privilege, and neither is looking.
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

/**
 * `/explore`'s rail count (09-26-26): every step an explore visitor takes along the rail, across
 * every item page in the tab, so the cap is per visit rather than per picture. sessionStorage, so
 * a new tab — or a new visit — starts over; the cap is a shape for the taste, not a lock.
 */
const RAIL_COUNT_KEY = "ambit.explore.railCount";
function readRailCount(): number {
  try {
    const n = Number(sessionStorage.getItem(RAIL_COUNT_KEY));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}
// A `useSyncExternalStore` store over that key — the hydration-safe way to read browser storage
// (the server snapshot is 0, the client's is the real count, and React reconciles the two without a
// mismatch), and the same shape as `lib/last-collection.ts`.
const railListeners = new Set<() => void>();
function writeRailCount(n: number): void {
  try {
    sessionStorage.setItem(RAIL_COUNT_KEY, String(n));
  } catch {
    // Private mode: nothing is counted, so the rail never caps. Degraded, not broken.
  }
  for (const cb of railListeners) cb();
}
function subscribeRailCount(cb: () => void) {
  railListeners.add(cb);
  return () => {
    railListeners.delete(cb);
  };
}
/** The explore marker never changes while an item page is up, so there is nothing to hear. */
function subscribeNever() {
  return () => undefined;
}

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
  // The rects of the controls that opened each sheet — above `md` the sheet floats beside its
  // button (docs/DESIGN_chrome-redesign.md §2); the phone pill's rects are ignored there.
  const [saveAnchor, setSaveAnchor] = React.useState<DOMRect | null>(null);
  const [shareAnchor, setShareAnchor] = React.useState<DOMRect | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);

  const router = useRouter();
  const chrome = useChromeCycle();

  // ── the explore taste (09-26-26, docs/PLAN_explore-route.md) ──────────────────────────────────
  // A signed-out visitor who came from `/explore` gets a rail that ends, after `EXPLORE_RAIL_CAP`
  // steps, on the taste's end card. A stranger from a shared link keeps the endless rail — they
  // are outside the experiment. Read through `useSyncExternalStore`, never plainly in render: the
  // server has no sessionStorage, so its snapshot is "not exploring" and React swaps in the real
  // answer after hydration without a mismatch.
  const fromExplore = React.useSyncExternalStore(
    subscribeNever,
    cameFromExplore,
    () => false,
  );
  const exploring = !authed && fromExplore;
  // Every signed-out exit goes to `/` — the shared-link stranger's too, since the toolbar gave
  // them a Feed button (09-26-26) and `/feed` would only bounce them there anyway.
  const leave = useLeaveToFeed(entryItem.id, { signedOut: !authed });
  // The sign-up sheet Profile and Save raise for a stranger, and the end card's sign-in / sign-up
  // open too (its "what is this?" still goes to `/`, which owns that dialog).
  const auth = useAuthSurface();
  const railCount = React.useSyncExternalStore(
    subscribeRailCount,
    readRailCount,
    () => 0,
  );
  // On the end card: the rail's middle cell is the card, and the picture before it is `current`.
  const [atEnd, setAtEnd] = React.useState(false);
  const capped = exploring && railCount >= EXPLORE_RAIL_CAP;
  const desktop = useMediaQuery(DESKTOP_QUERY);

  // ── the spread (docs/DESIGN_spread-mode.md) ───────────────────────────────────────────────────
  // Desktop only, whatever the device remembers: below `md` a spread would be two postage stamps.
  const layout = useHeroLayout();
  const spread = desktop && layout === "spread";
  /** Pictures per cell, and so how far one turn moves the rail. */
  const pages = spread ? 2 : 1;
  // Which page of the spread is *the item* (D2). Left unless the reader clicked the right one.
  const [focusSide, setFocusSide] = React.useState<0 | 1>(0);

  // ── zoom (docs/DESIGN_hero-zoom.md D1) ────────────────────────────────────────────────────────
  // The current picture's transform, or null for the hero as it was. One piece of state; every
  // index change clears it (advance below, and the spread turning on). `snapping` is whether the
  // next transform plays the 250ms settle (a release, a double-tap) or lands at once (a live
  // pinch or pan).
  const [zoom, setZoom] = React.useState<Zoom>(null);
  const [snapping, setSnapping] = React.useState(false);
  /**
   * The latest zoom, readable mid-event. A gesture's callbacks can fire back to back inside one
   * pointer event — a pinch ending *and* the finger left down starting a pan — before React has
   * re-rendered, so state read from the closure would be the render before the settle. Every
   * write goes through {@link putZoom}, which updates this at once; the layout effect below keeps
   * it honest for the resets that go through `setZoom` directly (advance, the spread turning on).
   */
  const zoomRef = React.useRef<Zoom>(null);
  React.useLayoutEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  const putZoom = (z: Zoom) => {
    zoomRef.current = z;
    setZoom(z);
  };
  /**
   * What a gesture in flight was measured against (D3): the inset box and the letterboxed picture
   * in it, the ceiling for this picture on this screen, the box's client offset for converting
   * pointer coordinates, and the zoom the gesture started from. Measured once at each gesture
   * start, never per frame.
   */
  const gesture = React.useRef<{
    box: Size;
    fit: Rect;
    ceil: number;
    left: number;
    top: number;
    start: ZoomState;
    startMid: Point;
  } | null>(null);

  /**
   * The current page's box and picture, or null if the picture has not decoded (review focus 1).
   * `document`-wide on purpose: `HeroRail` marks exactly one box — the current page's, single
   * mode only — and reading it here keeps `measure` free of the gesture hook's own ref, which is
   * declared below it.
   */
  const measure = React.useCallback(() => {
    const box = document.querySelector<HTMLElement>("[data-page-box]");
    const img = box?.querySelector("img");
    if (!box || !img || img.naturalWidth === 0) return null;
    const r = box.getBoundingClientRect();
    const size = { width: r.width, height: r.height };
    const natural = { width: img.naturalWidth, height: img.naturalHeight };
    const fit = fitRect(size, natural);
    return {
      box: size,
      fit,
      ceil: ceiling(natural, fit, window.devicePixelRatio || 1),
      left: r.left,
      top: r.top,
    };
  }, []);

  // ── the magazine's motion (docs/PLAN_magazine-turn.md) ────────────────────────────────────────
  // A page turning, or the book opening or closing. **The index moves at once** (D1): the URL,
  // Save, Share and the facts follow the keypress, and the turn is drawn over the new spread by
  // `HeroRail`. While one is in flight every other input — a turn, the toggle, `M` — is ignored
  // (D3), which is what makes a held → turn a page every 800ms rather than skipping through.
  const [motion, setMotion] = React.useState<Motion | null>(null);
  const motionSeq = React.useRef(0);

  // When the spread turns off — the toggle, or the window narrowing past `md` — land on the page
  // that was focused, so the picture the reader was looking at stays under them. Done *during
  // render* rather than in an effect: React's "adjust state when a value changes" pattern
  // (react.dev, "You Might Not Need an Effect"), so there is never a frame showing the wrong
  // picture and never a stray `replaceState` to it.
  const [prevSpread, setPrevSpread] = React.useState(spread);
  if (spread !== prevSpread) {
    setPrevSpread(spread);
    if (!spread && focusSide === 1) setIndex(index + 1);
    setFocusSide(0);
    // A spread never zooms (docs/DESIGN_hero-zoom.md D5).
    setZoom(null);
    // A window narrowed past `md` mid-turn: there is no spread left to turn.
    if (!spread) setMotion(null);
  }

  const cells = buildCells({ items, index, pages, capped, atEnd });
  /** The cell under the reader: one page, or the two of a spread. */
  const pair = cells[1];
  const focused = spread && !atEnd ? pair[focusSide] : undefined;
  const current =
    focused && focused !== "end" ? focused : (items[index] ?? entryItem);

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
    // A capped rail ends on the end card; there is nothing more to fetch towards it.
    if (
      !exhausted.tail &&
      !capped &&
      // A spread turn eats two pictures, so it starts fetching twice as far out.
      index >= items.length - 1 - PREFETCH_MARGIN * pages
    ) {
      void extend("tail");
    }
    if (!exhausted.head && index <= PREFETCH_MARGIN * pages) {
      void extend("head");
    }
  }, [index, items.length, exhausted, capped, extend, pages]);

  // ── advancing ─────────────────────────────────────────────────────────────────────────────────
  const advance = React.useCallback(
    (dir: 1 | -1) => {
      if (motion) return;
      chrome.reset();
      // A new picture is the hero as it was (docs/DESIGN_hero-zoom.md D1). The hook already
      // refuses to advance while zoomed; this covers ←/→ and the explore cap.
      setZoom(null);
      setSnapping(false);
      // The explore end card: forward from it is nowhere, back from it is the last picture.
      if (atEnd) {
        if (dir === -1) setAtEnd(false);
        return;
      }
      if (dir === 1 && capped) {
        setAtEnd(true);
        return;
      }
      // A spread turns two pages at a time. Going back from index 1 (an odd head batch, or the
      // spread turned on one picture in) lands on 0 rather than refusing.
      const next = dir === 1 ? index + pages : Math.max(0, index - pages);
      // Past a loaded end: stay put. The transform snaps back on its own, which reads as a
      // rubber-band — the corpus-thin degradation, and deliberately not a wrap.
      if (next === index || next >= items.length) return;
      if (spread) {
        const layers = turnLayers(dir, pair, items.slice(next, next + 2));
        if (layers) {
          setMotion({
            ...layers,
            key: ++motionSeq.current,
            kind: "turn",
            from: 0,
            to: 1,
          });
        }
      }
      setIndex(next);
      // Every turn starts on the left page (D2).
      setFocusSide(0);
      // The explore cap counts pictures, not turns, so a spread reader sees the same number.
      if (exploring) writeRailCount(railCount + pages);
    },
    [
      atEnd,
      capped,
      index,
      items,
      exploring,
      railCount,
      chrome,
      pages,
      motion,
      spread,
      pair,
    ],
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

  // ── the toggle: the book opens and closes (plan Task 6) ───────────────────────────────────────
  // Opening: the spread appears with its right page folded over the left one — whose picture is
  // the single picture the reader was looking at — and swings it open. Closing: the page folds
  // shut towards the focused picture first, and only then does the mode flip to single (in
  // `onMotionEnd`), which is what lands the single view on that picture. A spread with no second
  // page has nothing to fold, so it just switches.
  const toggleSpread = React.useCallback(() => {
    if (motion) return;
    if (!spread) {
      writeHeroLayout("spread");
      const layers = bookLayers("open", items.slice(index, index + 2), 0);
      if (layers) {
        setMotion({
          ...layers,
          key: ++motionSeq.current,
          kind: "open",
          from: 1,
          to: 0,
        });
      }
      return;
    }
    const layers = atEnd ? null : bookLayers("close", pair, focusSide);
    if (!layers) return writeHeroLayout("single");
    setMotion({
      ...layers,
      key: ++motionSeq.current,
      kind: "close",
      from: 0,
      to: 1,
    });
  }, [motion, spread, items, index, atEnd, pair, focusSide]);

  // Not a `setMotion(m => …)` updater: an updater runs during render, and `writeHeroLayout`
  // notifies the layout store's subscribers — a store write mid-render is a React error.
  const onMotionEnd = React.useCallback((ended: Motion) => {
    if (ended.kind === "close") writeHeroLayout("single");
    setMotion(null);
  }, []);

  // ── keyboard ──────────────────────────────────────────────────────────────────────────────────
  // (docs/DESIGN_desktop-polish.md §4, and Ben's 09-10 review: Escape did nothing on the old item
  // page at all.) On `window`, because nothing here holds focus — the rail is a gesture surface,
  // not a control. While a sheet is up it owns Escape (BottomSheet's own listener closes it), and
  // an arrow that changed the picture under an open sheet would be a surprise, so all three are
  // ignored until it's gone.
  const sheetOpen = saveOpen || shareOpen || auth.open;
  React.useEffect(() => {
    if (sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      // A modifier chord is the browser's (Alt/⌘+← is Back) — paging the rail as well would be a
      // second, surprising thing happening on the way out.
      if (e.altKey || e.metaKey || e.ctrlKey) return;
      if (e.key === "ArrowRight") advance(1);
      else if (e.key === "ArrowLeft") advance(-1);
      else if (e.key === "Escape") leave();
      // `M` for magazine, the view toggle's hotkey in Ben's design — desktop only, like the
      // toggle itself. Nothing on this screen takes text, so no typing guard is needed.
      else if (desktop && e.key.toLowerCase() === "m") toggleSpread();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen, advance, leave, desktop, toggleSpread]);

  // ── gestures ──────────────────────────────────────────────────────────────────────────────────
  const { ref, dragPx, dragging } = useRailGestures({
    // A tap only ever toggles the chrome now. The gallery's tap-again-for-details went with the
    // details sheet: the details are on the page, under the picture.
    // In a spread, a tap on the page that isn't the item makes it the item; any other tap is the
    // chrome toggle it always was. The current cell fills the viewport, so its halves are the
    // window's halves.
    onTap: ({ clientX }) => {
      const side = clientX < window.innerWidth / 2 ? 0 : 1;
      const page = pair[side];
      if (spread && !atEnd && side !== focusSide && page && page !== "end") {
        setFocusSide(side);
      } else {
        chrome.toggle();
      }
    },
    onAdvance: advance,
    onExit: leave,
    // ── zoom (docs/DESIGN_hero-zoom.md D2) ──────────────────────────────────────────────────────
    zoomable: !spread && !atEnd,
    zoomed: zoom !== null,
    onPinchStart: ({ cx, cy }) => {
      const m = measure();
      if (!m) {
        // Not decoded yet: no gesture. Clearing it matters — the hook is already pinching, and
        // `onPinch`/`onPinchEnd` would otherwise run on the *last* picture's measurements.
        gesture.current = null;
        return;
      }
      gesture.current = {
        ...m,
        start: zoomRef.current ?? IDENTITY,
        startMid: { x: cx - m.left, y: cy - m.top },
      };
      setSnapping(false);
      // A picture being inspected has no caption on it (D1).
      chrome.reset();
    },
    onPinch: ({ ratio, cx, cy }) => {
      const g = gesture.current;
      if (!g) return;
      const next = pinchUpdate(g.start, g.startMid, {
        ratio,
        cx: cx - g.left,
        cy: cy - g.top,
      });
      putZoom(live(next, g.fit, g.box, g.ceil));
    },
    onPinchEnd: () => {
      const g = gesture.current;
      if (!g) return;
      const z = zoomRef.current;
      setSnapping(true);
      putZoom(z ? settle(z, g.fit, g.box, g.ceil) : null);
    },
    // A pan reads the zoom from `zoomRef`, never from this render's `zoom`: when a pinch ends
    // with one finger still down, `onPinchEnd` settles and `onPanStart` fires in the same event,
    // before any re-render — so `zoom` here would still be the unsettled, live value.
    onPanStart: () => {
      // The finger left down after a pinch that settled back to 1 arrives here with no zoom:
      // nothing to pan (D2), and the pinch's measurements must not leak into it.
      const z = zoomRef.current;
      const m = measure();
      if (!m || !z) {
        gesture.current = null;
        return;
      }
      gesture.current = { ...m, start: z, startMid: { x: 0, y: 0 } };
      // `snapping` is left alone here: a settle that just started must still play. The first
      // real move clears it, below.
    },
    onPan: ({ dx, dy }) => {
      const g = gesture.current;
      if (!g || !zoomRef.current) return;
      setSnapping(false);
      putZoom(
        live(
          { ...g.start, x: g.start.x + dx, y: g.start.y + dy },
          g.fit,
          g.box,
          g.ceil,
        ),
      );
    },
    onPanEnd: () => {
      const g = gesture.current;
      if (!g) return;
      const z = zoomRef.current;
      setSnapping(true);
      putZoom(z ? settle(z, g.fit, g.box, g.ceil) : null);
    },
    onDoubleTap: ({ clientX, clientY }) => {
      const m = measure();
      if (!m) return;
      setSnapping(true);
      chrome.reset();
      putZoom(
        doubleTapTarget(
          zoomRef.current,
          { x: clientX - m.left, y: clientY - m.top },
          m.fit,
          m.box,
          m.ceil,
        ),
      );
    },
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
  // Keyed on the id string, not `current`: since spreads, `current` is read out of a cell array
  // built fresh each render, and the React Compiler can't prove such an object unchanged, so it
  // refused to keep this memo. A string is a value, and the memo holds.
  const currentId = current.id;
  const saveImage = React.useCallback(async () => {
    const itemId = currentId;
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
  }, [currentId]);

  // ── render ────────────────────────────────────────────────────────────────────────────────────

  // The three cells on screen: the one before, the one you're looking at, and the one after. An
  // absent neighbour (either end of a loaded rail) renders as an empty cell, which is what makes
  // the rubber-band look like an edge rather than a missing image.
  //
  // `/explore`'s capped rail puts its end card where the next picture would be, and standing on it
  // shifts the three cells one along.
  // One caption per picture on screen. An `<h2>`, not the gallery's old `<h1>`: the page's one
  // `<h1>` is `ItemFacts`'s, and e2e's `getByRole("heading", { level: 1 })` must find exactly one.
  const captionFor = (item: RailItem) => (
    <>
      <h2 className="text-ink-hi text-[22px] leading-[1.24] font-semibold">
        {item.title}
      </h2>
      <p className="text-ink/52 mt-[7px] text-[12.5px] tracking-[0.15px]">
        {item.attribution ?? sourceLabel(item.source)}
      </p>
    </>
  );

  // Where the entry picture sits in the rail now — a head prepend shifts it, and the reader's
  // index with it, so the difference below is stable.
  const entryIndex = items.findIndex((i) => i.id === entryItem.id);

  const caption =
    spread && !atEnd ? (
      // **Folios** (plan D7): a magazine's page footer under each page — the page number, then
      // the title and maker, pushed to the page's *outer* edge. The page that isn't the item is
      // dimmed, which is the only on-screen sign of which one Save and Share will act on.
      <div className="grid grid-cols-2 gap-12">
        {pair.map((page, side) =>
          page === "end" ? null : (
            <Folio
              key={page.id}
              item={page}
              number={folioNumber(index + side - entryIndex + 1)}
              side={side === 0 ? "left" : "right"}
              dimmed={side !== focusSide}
            />
          ),
        )}
      </div>
    ) : (
      <div className="pointer-events-auto">{captionFor(current)}</div>
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
        pages={pages}
        trackRef={ref}
        dragPx={dragPx}
        dragging={dragging}
        chrome={caption}
        // The caption belongs to a picture; over the end card it would name the one before it.
        chromeVisible={chrome.visible && !atEnd}
        spine={spread && !atEnd}
        motion={motion}
        onMotionEnd={onMotionEnd}
        zoom={zoom ? { ...zoom, snapping } : null}
        endCell={
          exploring ? (
            <MessageTile
              message="end"
              onAction={(action) =>
                action === "about"
                  ? router.push("/?open=about")
                  : auth.openAuth(action)
              }
            />
          ) : undefined
        }
      />

      {/* One set of handlers for both toolbars. A stranger's Profile and Save are the sign-up
          sheet; Share is Share. */}
      {!desktop ? (
        // Fixed at the bottom like every other screen's pill, and — decision 3's phone half since
        // Ben's review (09-11-26) — part of the chrome: it fades with the caption. Until then it
        // rode *inside* the caption, whose position followed the picture's height, which is how it
        // came to be "all over the place" on the phone.
        <PillToolbar
          visible={chrome.visible}
          bookmark={saved.data?.saved ? "saved" : "idle"}
          onProfile={authed ? undefined : () => auth.openAuth("signup")}
          onBookmark={(anchor) => {
            if (!authed) return auth.openAuth("signup");
            setSaveAnchor(anchor);
            setSaveOpen(true);
          }}
          onShare={(anchor) => {
            setShareAnchor(anchor);
            setShareOpen(true);
          }}
          // NOT the pill's default `/feed` push: that re-runs the dynamic route and draws a fresh
          // page of cards. See `useLeaveToFeed`.
          onHome={leave}
        />
      ) : (
        // Decision 3 (docs/DESIGN_chrome-redesign.md): the rail is part of the chrome here — it
        // fades with the caption, on the same 600ms, and a mouse moving over the picture summons
        // both.
        <RailToolbar
          visible={chrome.visible}
          bookmark={saved.data?.saved ? "saved" : "idle"}
          onProfile={authed ? undefined : () => auth.openAuth("signup")}
          onBookmark={(anchor) => {
            if (!authed) return auth.openAuth("signup");
            setSaveAnchor(anchor);
            setSaveOpen(true);
          }}
          onShare={(anchor) => {
            setShareAnchor(anchor);
            setShareOpen(true);
          }}
          onHome={leave}
          extra={<SpreadToggle spread={spread} onToggle={toggleSpread} />}
        />
      )}

      {/* A book-width measure above `md` (docs/DESIGN_desktop-polish.md §1, §4) — the picture is
          the whole viewport, the words are not. `pt-[28px]`: a clear gap between the strip and
          the title on every width (Ben's review, 09-11-26). */}
      <Column width="reader" className="px-[22px] pt-[28px]">
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
            <JoinCta variant="image" exploring={exploring} />
          </Rise>
        )}
      </Column>

      {authed ? (
        <SaveToCollectionSheet
          open={saveOpen}
          onClose={() => setSaveOpen(false)}
          anchor={saveAnchor}
          itemId={current.id}
          currentCollectionId={saved.data?.collectionId ?? undefined}
          onSaved={async (collection, drift) => {
            setToast(saveToastText(collection.name, drift));
            await utils.saves.forItem.invalidate({ itemId: current.id });
          }}
          onError={setToast}
        />
      ) : (
        <AuthSurface {...auth} collapseLabel="Back to the picture" />
      )}

      <ShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        anchor={shareAnchor}
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
    </main>
  );
}

/**
 * One page's folio (docs/PLAN_magazine-turn.md D7), sized from `view-toggle.tokens.json`
 * `spread.folio`: the number small, tracked and muted in tabular figures, the title at 14px, the
 * maker beneath it. On the right page the number sits on the outside, so the pair reads
 * outward from the spine like a printed spread. The title stays an `<h2>` — the page's one `<h1>`
 * is `ItemFacts`'s.
 */
function Folio({
  item,
  number,
  side,
  dimmed,
}: {
  item: RailItem;
  number: string;
  side: "left" | "right";
  dimmed: boolean;
}) {
  const num = (
    <span
      data-testid="folio-number"
      className="text-ink/40 flex-none text-[11px] font-semibold tracking-[1.2px] tabular-nums"
    >
      {number}
    </span>
  );
  const words = (
    <div className="min-w-0">
      <h2 className="text-ink-hi truncate text-[14px]">{item.title}</h2>
      <p className="text-ink/46 mt-[3px] truncate text-[11.5px]">
        {item.attribution ?? sourceLabel(item.source)}
      </p>
    </div>
  );
  return (
    <div
      className={cn(
        "pointer-events-auto flex min-w-0 items-baseline gap-3.5 transition-opacity duration-300",
        side === "right" && "justify-end text-right",
        dimmed && "opacity-55",
      )}
    >
      {side === "left" ? (
        <>
          {num}
          {words}
        </>
      ) : (
        <>
          {words}
          {num}
        </>
      )}
    </div>
  );
}
