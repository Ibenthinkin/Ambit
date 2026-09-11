"use client";

import * as React from "react";

import type { RailItem } from "~/server/services/gallery-rail";

// The picture strip at the top of the merged item screen (09-10-26,
// docs/DESIGN_screen-structure.md §1) — the gallery's rail, moved out of a full-screen room and
// onto the top of a page you scroll.
//
// Three things it owns, and nothing else:
//
//   - **The track.** Three cells, one screen wide each, translated so the middle one is under the
//     reader; the drag rides on top in raw px. Lifted from the old `GalleryScreen` unchanged, except
//     that the track declares `touch-action: pan-y` — vertical panning is the browser's now,
//     because there is a page below the picture to pan to.
//   - **Its own height, which follows the picture.** `item` stores no dimensions, so each cell's
//     `<img onLoad>` records its natural ratio and the strip is `heroHeight()` of the current one:
//     a square plate is as tall as the screen is wide and the details start right under it; a
//     tall one fills the viewport. Transitioned on advance so the page slides rather than jumps.
//   - **Where the chrome goes.** Under a short picture the caption and pill are an ordinary block
//     *below* it; under a full-height one they overlay the bottom with the gallery's gradient.
//     `data-overlay` says which, for the tests and for anyone debugging why the pill moved.
//     **Below the picture, a hidden caption takes no space** (Ben, 09-10-26). `visibility: hidden`
//     alone keeps an element's box, and the first visual pass found that box as a ~170px dead band
//     between a landscape plate and its title. So the below-placement sits in a grid row that
//     animates `0fr → 1fr`: hidden, it is nothing; brought up, it slides the facts down under it.
//
// **The image is a plain `<img>`, in no anchor, with no `-webkit-touch-callout: none`.** The
// feed tiles set the callout (load-bearing there — iOS raises its own image menu partway through
// the long-press that opens the item sheet), so copying that block over is the obvious move and it
// would be a regression: leaving the callout alone is what gives the hero iOS's native "Add to
// Photos" on long-press (verified on device 08-20-26), and an anchor changes the callout iOS
// offers on the image inside it. `next/image` is out for the reason `image-tile.tsx` gives — the
// image hosts are an open, growing set.

export interface HeroRailProps {
  /** The cell before, the cell under the reader, the cell after. An absent neighbour is an empty cell. */
  cells: readonly [RailItem | undefined, RailItem, RailItem | undefined];
  /** From `useRailGestures` — spread onto the track. */
  trackRef: React.RefObject<HTMLDivElement | null>;
  dragPx: number;
  dragging: boolean;
  /** The caption + pill, rendered by the screen; the strip decides where it goes and fades it. */
  chrome: React.ReactNode;
  chromeVisible: boolean;
  /** Desktop or not — passed in so the strip has no media query of its own to mock. */
  desktop: boolean;
}

/** The rail is three screens wide and holds three cells; one screen is a third of it. */
const CELL = "33.3333%";

/** The strip's own slide between heights, and the track's between cells — one curve for both. */
const EASE = "cubic-bezier(.22,.61,.36,1)";

/**
 * How tall the strip is for a picture of `ratio` (natural height ÷ natural width). Pure, so the
 * rule is testable without a DOM: desktop is always the viewport height (decision 2 — full height,
 * edge to edge); the phone is the picture's own height at full width, capped at the viewport; an
 * unknown ratio is the viewport height, which is the safe placeholder for the one frame before the
 * entry picture (preloaded by the page) reports in.
 */
export function heroHeight(
  ratio: number | undefined,
  vw: number,
  vh: number,
  desktop: boolean,
): number {
  if (desktop || ratio === undefined) return vh;
  return Math.min(vh, Math.round(vw * ratio));
}

/**
 * The viewport, re-read on resize. `innerHeight` rather than `100dvh` because the strip's height
 * has to be a number the placement rule can compare against.
 *
 * **Null until mounted.** The server renders this component too and has no `window`, and the
 * first client render must match the server's or hydration fails — so neither side measures
 * anything, the strip renders `100dvh` with the chrome overlaid (exactly the unknown-ratio
 * placeholder), and the real numbers arrive one effect later.
 */
function useViewport(): { vw: number; vh: number } | null {
  const [size, setSize] = React.useState<{ vw: number; vh: number } | null>(
    null,
  );
  React.useEffect(() => {
    const read = () =>
      setSize({ vw: window.innerWidth, vh: window.innerHeight });
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);
  return size;
}

export function HeroRail({
  cells,
  trackRef,
  dragPx,
  dragging,
  chrome,
  chromeVisible,
  desktop,
}: HeroRailProps) {
  const viewport = useViewport();
  // One ratio per cell id, learned from `onLoad`. A Map in state rather than a ref because the
  // strip's height is derived from it and must re-render when it changes.
  const [ratios, setRatios] = React.useState<ReadonlyMap<string, number>>(
    () => new Map(),
  );
  const learn = React.useCallback((id: string, ratio: number) => {
    setRatios((prev) => {
      if (prev.get(id) === ratio) return prev;
      const next = new Map(prev);
      next.set(id, ratio);
      return next;
    });
  }, []);

  const current = cells[1];
  const height = viewport
    ? heroHeight(ratios.get(current.id), viewport.vw, viewport.vh, desktop)
    : null;
  // Full-height picture → the caption overlays its foot. Anything shorter → the caption is a
  // block under it. `vh - 1` absorbs a rounding pixel. Before the first measurement the strip is
  // full height, so the chrome overlays.
  const overlay =
    viewport === null || height === null || height >= viewport.vh - 1;

  const chromeBlock = (
    <div
      data-testid="gallery-chrome"
      aria-hidden={!chromeVisible}
      className={
        overlay ? "pointer-events-none absolute inset-x-0 bottom-0" : ""
      }
      // **`visibility`, not `pointer-events`, is what makes it untappable while hidden.** An
      // ancestor's `pointer-events: none` can be overridden by any descendant that sets `auto` —
      // and `PillToolbar` does exactly that, on purpose, so its wrapper can span the screen
      // without eating scrolls. `visibility: hidden` cannot be overridden that way, and it
      // transitions discretely: flipping to visible takes effect at once, and back to hidden only
      // after the fade has finished. An invisible control that still takes taps is worse than no
      // control at all.
      style={{
        opacity: chromeVisible ? 1 : 0,
        transform: chromeVisible ? "none" : "translateY(10px)",
        visibility: chromeVisible ? "visible" : "hidden",
        transition: "opacity .6s ease, transform .6s ease, visibility .6s",
        ...(overlay
          ? {
              background:
                "linear-gradient(to top, rgba(11,10,8,0.94) 42%, transparent)",
              padding: "26px 24px 42px",
            }
          : { padding: "18px 24px 22px" }),
      }}
    >
      {/* Only the real targets inside take pointer events back (the screen sets
          `pointer-events-auto` on them) — the gradient stays inert, so a horizontal swipe low on
          the picture still reaches the track underneath rather than dying on a decoration. */}
      {chrome}
    </div>
  );

  return (
    <section
      data-testid="hero-rail"
      data-overlay={overlay}
      className="bg-immersive relative overflow-hidden"
    >
      <div
        data-testid="hero-frame"
        className="relative overflow-hidden"
        style={{
          height: height ?? "100dvh",
          // Slides rather than jumps between a square plate and a tall one on advance. Off while
          // dragging, like the track's own transform.
          transition: dragging ? "none" : `height .4s ${EASE}`,
        }}
      >
        <div
          ref={trackRef}
          data-testid="gallery-track"
          // `pan-y` declares that vertical panning belongs to the browser and horizontal to the
          // gesture hook — see `use-rail-gestures.ts` for why it never calls `preventDefault`.
          style={{
            touchAction: "pan-y",
            width: "300%",
            height: "100%",
            // -33.3333% of a 3-screen-wide rail is exactly one screen, which centres the middle
            // cell. The drag rides on top in raw px: the rail moves with the finger 1:1.
            transform: `translateX(calc(-${CELL} + ${dragPx}px))`,
            transition: dragging ? "none" : `transform .4s ${EASE}`,
            willChange: "transform",
          }}
          className="flex"
        >
          {cells.map((c, i) => (
            <div
              key={c?.id ?? `empty-${i}`}
              // Top-aligned (decision 2: no centring); the only inset is the notch.
              className="flex items-start justify-center"
              style={{
                flex: `0 0 ${CELL}`,
                height: "100%",
                paddingTop: "env(safe-area-inset-top, 0px)",
              }}
            >
              {c ? (
                <RailImage
                  item={c}
                  priority={i === 1}
                  onRatio={(r) => learn(c.id, r)}
                />
              ) : null}
            </div>
          ))}
        </div>

        {overlay ? chromeBlock : null}
      </div>

      {overlay ? null : (
        // The collapsing row (see the header). `grid-template-rows` is the one property that can
        // transition an element between zero and its own content height; the child's `min-h-0` +
        // `overflow-hidden` is what lets the `0fr` row actually shrink below that content.
        <div
          data-testid="hero-chrome-below"
          data-collapsed={!chromeVisible}
          className="grid"
          style={{
            gridTemplateRows: chromeVisible ? "1fr" : "0fr",
            transition: `grid-template-rows .4s ${EASE}`,
          }}
        >
          <div className="min-h-0 overflow-hidden">{chromeBlock}</div>
        </div>
      )}
    </section>
  );
}

/** One rail cell's picture. `pointer-events: none` — the track owns every pointer on the strip. */
function RailImage({
  item,
  priority,
  onRatio,
}: {
  item: RailItem;
  /** The cell under the reader: fetched ahead of everything else, like the old hero. */
  priority: boolean;
  onRatio: (ratio: number) => void;
}) {
  // Through the proxy, except for the inline `data:` pixels the e2e corpus seeds — same branch as
  // the feed's tiles. See `src/app/api/img/[itemId]/route.ts` for why the proxy exists at all.
  const src = item.imageUrl?.startsWith("data:")
    ? item.imageUrl
    : `/api/img/${item.id}`;

  // **A picture that finished before hydration fires its `load` into the void** — React wasn't
  // listening yet — and the entry picture is preloaded precisely so that it finishes early. So on
  // mount (and harmlessly after: `learn` ignores a ratio it already has) read the size straight off
  // an image that is already complete.
  const ref = React.useRef<HTMLImageElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (el?.complete && el.naturalWidth > 0) {
      onRatio(el.naturalHeight / el.naturalWidth);
    }
  }, [onRatio]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src}
      alt={item.title}
      decoding="async"
      fetchPriority={priority ? "high" : "auto"}
      onLoad={(e) => {
        const el = e.currentTarget;
        if (el.naturalWidth > 0) onRatio(el.naturalHeight / el.naturalWidth);
      }}
      // Phone: full width, its own height, whole, capped at the viewport, top-aligned inside the
      // cap. Desktop (`md:`): full viewport height, its own width, centred, edge to edge for a
      // landscape. **No radius** — decision 2. `object-top` keeps a capped tall plate against the
      // top of its box rather than floating in it.
      className="pointer-events-none block h-auto max-h-[100dvh] w-full object-contain object-top md:mx-auto md:h-[100dvh] md:w-auto md:max-w-full"
    />
  );
}
