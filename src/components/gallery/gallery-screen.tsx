"use client";

import * as React from "react";

import { GalleryDetailsSheet } from "~/components/gallery/gallery-details-sheet";
import { useExitGallery } from "~/components/gallery/use-exit-gallery";
import { Info } from "~/components/icons";
import { SaveToCollectionSheet } from "~/components/sheets/save-to-collection-sheet";
import { ShareSheet } from "~/components/sheets/share-sheet";
import { PillToolbar } from "~/components/ui/pill-toolbar";
import { Toast } from "~/components/ui/toast";
import { useChromeCycle } from "~/hooks/use-chrome-cycle";
import { useRailGestures } from "~/hooks/use-rail-gestures";
import { sourceLabel } from "~/lib/source-label";
import type { RailItem } from "~/server/services/gallery-rail";
import { api } from "~/trpc/react";

// `/g/[itemId]` — the signature screen. A picture, edge to edge, on the darkest ground the app has,
// with nothing on top of it until you ask.
//
// Everything here follows from that one sentence:
//
//   - **The chrome starts hidden** and comes back on a ten-second loop (`useChromeCycle`). A tap
//     brings it up; a tap while it's up opens the details sheet. (The handoff README's gesture
//     matrix says double-tap; the prototype codes tap-again, and prototypes win — a double-tap on a
//     screen whose only other gesture is a swipe is a race nobody asked to run.)
//   - **Swiping goes somewhere.** The rail is `services/gallery-rail.ts`'s endless wander: the topic
//     graph chooses where, a curated-weighted draw chooses what, and it never repeats or ends. It
//     also **never marks anything seen** — swiping here spends none of the reader's corpus, which is
//     the whole reason it isn't `feed.page` (log.md 08-20-26).
//   - **Signed-out visitors get the picture and the way out, and nothing else.** `/g/` is public
//     like `/i/` — a stranger can fall in through a shared link — so the pill, the sheets, and every
//     protected query sit behind `authed`. Leaving is not a privilege, and neither is looking.

export interface GalleryScreenProps {
  /** The work the gallery opened on. Its id anchors the exits and the origin marker. */
  entryItem: RailItem;
  /** Server-drawn first stretch of rail, entry item first. */
  initialRail: RailItem[];
  authed: boolean;
  /** The app's own origin (`env.BETTER_AUTH_URL`), for building an absolute share URL. */
  appUrl: string;
  /** The signed-in reader's first name, if any — becomes `?from=` on the link they share. */
  viewerName?: string;
}

/** How many cells per fetch, and how close to an end the reader gets before the next one starts. */
const BATCH = 8;
const PREFETCH_MARGIN = 3;

/** Mirrors the router's `exclude` cap. Past this the rail accepts a rare repeat far behind. */
const EXCLUDE_CAP = 200;

/** The rail is three screens wide and holds three cells; one screen is a third of it. */
const CELL = "33.3333%";

export function GalleryScreen({
  entryItem,
  initialRail,
  appUrl,
  authed,
  viewerName,
}: GalleryScreenProps) {
  const [items, setItems] = React.useState<RailItem[]>(initialRail);
  const [index, setIndex] = React.useState(0);
  // Each end stops asking once a batch comes back short — the corpus has nothing more that way. The
  // tail starts exhausted when the server's own first draw came back short, which is the thin-corpus
  // case (and every e2e run).
  const [exhausted, setExhausted] = React.useState({
    head: false,
    tail: initialRail.length <= BATCH,
  });

  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);

  const chrome = useChromeCycle();
  const { exit, toFeed } = useExitGallery(entryItem.id);

  const current = items[index] ?? entryItem;

  const utils = api.useUtils();
  // `enabled: authed` is the auth boundary in client form — an anonymous visitor must not fire a
  // protected procedure and collect an UNAUTHORIZED in their console. Same rule as `item-shell`.
  const saved = api.saves.forItem.useQuery(
    { itemId: current.id },
    { enabled: authed },
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

  // ── gestures ──────────────────────────────────────────────────────────────────────────────────

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

  const openDetails = React.useCallback(() => {
    setDetailsOpen(true);
    try {
      // Android-only, absent on iOS Safari, and known to throw on a few others — never let a
      // decoration break the gesture it decorates.
      navigator.vibrate?.(10);
    } catch {
      // no haptics available; the sheet opens regardless
    }
  }, []);

  const { ref, dragPx, dragging } = useRailGestures({
    // Decision 8: tap-again, not double-tap. Chrome down → bring it up. Chrome up → you've already
    // seen the title, so the second tap is asking for the rest.
    onTap: () => (chrome.visible ? openDetails() : chrome.toggle()),
    onAdvance: advance,
    onOpenDetails: openDetails,
    onExit: exit,
  });

  // ── share + save ──────────────────────────────────────────────────────────────────────────────

  // Decision 4: sharing from the gallery shares `/i/{current}`, never `/g/`. The item page is the
  // canonical surface, it carries the OG metadata, and a `/g/` link would drop a stranger into a
  // gestural screen with no explanation.
  const shareUrl = `${appUrl}/i/${current.id}${
    viewerName ? `?from=${encodeURIComponent(viewerName)}` : ""
  }`;

  /**
   * Hand the full-resolution image to the OS — the same handler as `item-shell.tsx`, keyed to
   * whatever is on screen. `navigator.share({ files })` is the path that actually reaches an iOS
   * camera roll; the `<a download>` fallback is for desktop and browsers that can't share files.
   */
  const saveImage = React.useCallback(async () => {
    const itemId = current.id;
    try {
      const res = await fetch(`/api/img/${itemId}`);
      if (!res.ok) throw new Error(`image ${res.status}`);
      const blob = await res.blob();
      const file = new File([blob], `${itemId}.jpg`, { type: blob.type });

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
      a.download = `${itemId}.jpg`;
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
  const cells = [items[index - 1], items[index], items[index + 1]];

  return (
    <main
      className="bg-immersive relative overflow-hidden"
      style={{ height: "100dvh" }}
    >
      <div
        ref={ref}
        data-testid="gallery-track"
        // `touch-action: none` declares up front that this element owns its gestures, which is what
        // lets the hook avoid ever calling `preventDefault` on a move (see `use-rail-gestures`).
        style={{
          touchAction: "none",
          width: "300%",
          height: "100%",
          // -33.3333% of a 3-screen-wide rail is exactly one screen, which centres the middle cell.
          // The drag rides on top in raw px: the rail moves with the finger 1:1, no measurement of
          // anything required.
          transform: `translateX(calc(-${CELL} + ${dragPx}px))`,
          transition: dragging
            ? "none"
            : "transform .4s cubic-bezier(.22,.61,.36,1)",
          willChange: "transform",
        }}
        className="flex"
      >
        {cells.map((cell, i) => (
          <div
            key={cell?.id ?? `empty-${i}`}
            className="flex items-center justify-center"
            style={{
              flex: `0 0 ${CELL}`,
              // Inset from the top so the picture sits under the status bar rather than behind it,
              // and off the bottom edge so the chrome has somewhere to live.
              height: "66.6667%",
              padding: "56px 16px 0",
            }}
          >
            {cell ? <RailImage item={cell} /> : null}
          </div>
        ))}
      </div>

      {/* All the chrome fades as one unit.
          **`visibility`, not `pointer-events`, is what makes it untappable while hidden.** An
          ancestor's `pointer-events: none` can be overridden by any descendant that sets `auto` —
          and `PillToolbar` does exactly that, on purpose, so its wrapper can span the screen
          without eating scrolls. `visibility: hidden` cannot be overridden that way, and it
          transitions discretely: flipping to visible takes effect at once, and back to hidden only
          after the fade has finished. An invisible control that still takes taps is worse than no
          control at all. */}
      <div
        data-testid="gallery-chrome"
        aria-hidden={!chrome.visible}
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: chrome.visible ? 1 : 0,
          transform: chrome.visible ? "none" : "translateY(10px)",
          visibility: chrome.visible ? "visible" : "hidden",
          transition: "opacity .6s ease, transform .6s ease, visibility .6s",
        }}
      >
        <div
          className="absolute inset-x-0 top-0 h-[120px]"
          style={{
            background:
              "linear-gradient(to bottom, rgba(11,10,8,0.55), transparent)",
          }}
        />

        <div
          className="absolute inset-x-0 bottom-0"
          style={{
            background:
              "linear-gradient(to top, rgba(11,10,8,0.94) 42%, transparent)",
            padding: "26px 24px 42px",
          }}
        >
          {/* Only the two real targets take pointer events back — the gradients above stay inert,
              so a horizontal swipe low on the screen still reaches the track underneath rather
              than dying on a decoration. */}
          <div
            data-testid="gallery-title-block"
            className="pointer-events-auto"
            onClick={openDetails}
          >
            <h1 className="text-ink-hi text-[22px] leading-[1.24] font-semibold">
              {current.title}
            </h1>
            <p className="text-ink/52 mt-[7px] text-[12.5px] tracking-[0.15px]">
              {current.attribution ?? sourceLabel(current.source)}
            </p>
            <p className="text-ink/34 mt-[14px] flex items-center gap-[6px] text-[11px]">
              <Info size={12} />
              Tap again, or the title, for details
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
              // NOT the pill's default `/feed` push, and not the item page's `leave()` either: from
              // here the feed is two entries down. See `useExitGallery`.
              onHome={toFeed}
            />
          ) : null}
        </div>
      </div>

      <GalleryDetailsSheet
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        item={current}
        onCycle={advance}
      />

      {authed ? (
        <>
          <SaveToCollectionSheet
            open={saveOpen}
            onClose={() => setSaveOpen(false)}
            itemId={current.id}
            currentCollectionId={saved.data?.collectionId ?? undefined}
            onSaved={async (collection) => {
              setToast(`Saved to ${collection.name}`);
              await utils.saves.forItem.invalidate({ itemId: current.id });
            }}
            onError={setToast}
          />

          <ShareSheet
            open={shareOpen}
            onClose={() => setShareOpen(false)}
            url={shareUrl}
            title={current.title}
            // Always true here: this screen has nothing but images on it.
            imageContext
            onSaveImage={() => void saveImage()}
            onCopied={() => setToast("Link copied")}
            onShareUnavailable={() => setToast("Sharing isn't available here")}
          />

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

/** One rail cell's picture. `pointer-events: none` — the track owns every pointer on this screen. */
function RailImage({ item }: { item: RailItem }) {
  // Through the proxy, except for the inline `data:` pixels the e2e corpus seeds — same branch as
  // the feed's tiles and the item hero. See `src/app/api/img/[itemId]/route.ts` for why the proxy
  // exists at all.
  const src = item.imageUrl?.startsWith("data:")
    ? item.imageUrl
    : `/api/img/${item.id}`;

  return (
    // Plain `<img>`, never `next/image` — the image hosts are an open, growing set; see
    // `components/feed/image-tile.tsx` for the full account.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={item.title}
      className="pointer-events-none max-h-full max-w-full rounded-[12px] object-contain"
    />
  );
}
