"use client";

import * as React from "react";

import { cn } from "~/lib/utils";
import type { RailItem } from "~/server/services/gallery-rail";
import type { HeroCells, HeroPage } from "./rail-cells";

// The picture strip at the top of the merged item screen (09-10-26,
// docs/DESIGN_screen-structure.md §1) — the gallery's rail, moved out of a full-screen room and
// onto the top of a page you scroll.
//
// Two things it owns, and nothing else:
//
//   - **The track.** Three cells, one screen wide each, translated so the middle one is under the
//     reader; the drag rides on top in raw px. Lifted from the old `GalleryScreen` unchanged, except
//     that the track declares `touch-action: pan-y` — vertical panning is the browser's now,
//     because there is a page below the picture to pan to. **A cell holds pages** (09-27-26,
//     docs/DESIGN_spread-mode.md D3): one in single mode, which is the cell as it always was, or
//     up to two side by side in a desktop spread. The track still slides one cell per turn, so a
//     spread turns two pictures at a time. The cells themselves are built by `rail-cells.ts`.
//   - **The chrome's fade.** The caption (and, below `md`, nothing else — the pill is the screen's
//     own, fixed at the bottom) overlays the foot of the strip on the gallery's gradient and fades
//     with `visibility`, so it is untappable while hidden.
//
// **The strip is the viewport, on every width (09-11-26).** Until Ben's review of the chrome
// redesign it followed the picture's height on the phone — a square plate was as tall as the
// screen is wide, the caption and pill sat *below* it, and a `<img onLoad>` ratio map, a viewport
// measurement and a collapsing grid row existed to make that work. His verdict was that there
// was no gallery view on the phone at all, and the pill, riding wherever the picture ended, was
// "all over the place". So: `h-dvh`, the picture centred in it, the details below the fold. That
// deleted all three mechanisms and the `desktop` prop with them — the same rule on every width
// needs no measurement.
//
// **The picture sits in a 12px inset, centred both ways, whole** — "a little padding around the
// images, like the Photos app on iOS" (the same review, reversing "none at all" from the desktop
// pass; docs/DESIGN_screen-structure.md §1 has the amendment). `object-contain` at the full cell
// size is what makes a landscape plate and a tall one both as big as they can be without a crop.
//
// **The image is a plain `<img>`, in no anchor, with no `-webkit-touch-callout: none`.** The
// feed tiles set the callout (load-bearing there — iOS raises its own image menu partway through
// the long-press that opens the item sheet), so copying that block over is the obvious move and it
// would be a regression: leaving the callout alone is what gives the hero iOS's native "Add to
// Photos" on long-press (verified on device 08-20-26), and an anchor changes the callout iOS
// offers on the image inside it. `next/image` is out for the reason `image-tile.tsx` gives — the
// image hosts are an open, growing set.

export interface HeroRailProps {
  /**
   * The cell before, the cell under the reader, the cell after — each one or two pages (a page is
   * a picture, or `"end"`, `/explore`'s end card drawn from `endCell`). An absent neighbour is an
   * empty cell.
   */
  cells: HeroCells;
  /** 1 for single, 2 for a desktop spread. Decides where a lone page sits: centred, or left. */
  pages: 1 | 2;
  /** What an `"end"` cell shows. Only `/explore`'s capped rail has one. */
  endCell?: React.ReactNode;
  /** From `useRailGestures` — spread onto the track. */
  trackRef: React.RefObject<HTMLDivElement | null>;
  dragPx: number;
  dragging: boolean;
  /** The caption, rendered by the screen; the strip overlays it on the picture's foot and fades it. */
  chrome: React.ReactNode;
  chromeVisible: boolean;
}

/** The rail is three screens wide and holds three cells; one screen is a third of it. */
const CELL = "33.3333%";

/** The track's slide between cells. */
const EASE = "cubic-bezier(.22,.61,.36,1)";

export function HeroRail({
  cells,
  pages,
  trackRef,
  dragPx,
  dragging,
  chrome,
  chromeVisible,
  endCell,
}: HeroRailProps) {
  return (
    <section
      data-testid="hero-rail"
      className="bg-immersive relative overflow-hidden"
    >
      <div data-testid="hero-frame" className="relative h-dvh overflow-hidden">
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
              key={c ? c.map(pageKey).join("+") : `empty-${i}`}
              className="flex"
              style={{ flex: `0 0 ${CELL}`, height: "100%" }}
            >
              {c?.map((page, side) => (
                <Page
                  key={pageKey(page)}
                  page={page}
                  // In a spread each page knows which side of the spine it is on, and leans its
                  // picture towards it. A lone last page is a left page too.
                  side={
                    pages === 2 ? (side === 0 ? "left" : "right") : undefined
                  }
                  endCell={endCell}
                  // Every page of the cell under the reader — both halves of a spread.
                  priority={i === 1}
                />
              ))}
              {/* A spread's lone last page stays on the left half, a magazine's blank verso
                  beside it, rather than drifting to the centre. */}
              {c && pages === 2 && c.length === 1 ? (
                <div className="min-w-0 flex-1" />
              ) : null}
            </div>
          ))}
        </div>

        <div
          data-testid="gallery-chrome"
          aria-hidden={!chromeVisible}
          // Bottom padding clears the fixed pill below `md` (56px + its 26px margin, plus room);
          // above `md` the rail is at the right edge and the caption keeps the gallery's 42.
          className="pointer-events-none absolute inset-x-0 bottom-0 px-6 pt-[26px] pb-[108px] md:pb-[42px]"
          // **`visibility`, not `pointer-events`, is what makes it untappable while hidden.** An
          // ancestor's `pointer-events: none` can be overridden by any descendant that sets
          // `auto` — and the caption's own targets do exactly that. `visibility: hidden` cannot be
          // overridden that way, and it transitions discretely: flipping to visible takes effect
          // at once, and back to hidden only after the fade has finished. An invisible control
          // that still takes taps is worse than no control at all.
          style={{
            opacity: chromeVisible ? 1 : 0,
            transform: chromeVisible ? "none" : "translateY(10px)",
            visibility: chromeVisible ? "visible" : "hidden",
            transition: "opacity .6s ease, transform .6s ease, visibility .6s",
            background:
              "linear-gradient(to top, rgba(11,10,8,0.94) 42%, transparent)",
          }}
        >
          {/* Only the real targets inside take pointer events back (the screen sets
              `pointer-events-auto` on them) — the gradient stays inert, so a horizontal swipe low
              on the picture still reaches the track underneath rather than dying on a decoration. */}
          {chrome}
        </div>
      </div>
    </section>
  );
}

const pageKey = (p: HeroPage) => (p === "end" ? "end" : p.id);

/**
 * One page of a cell: the 12px inset around a picture or the end card. In single mode a cell is
 * one page, so this box *is* the old cell, the picture centred in it. In a spread two of them
 * share the cell half and half (`flex-1 min-w-0` — `min-w-0` lets a wide picture shrink below its
 * natural width instead of pushing its neighbour off the screen).
 *
 * **A spread's pictures meet at the spine** (Ben's first look, 09-27-26: "narrow the gap between
 * the images in the middle, fill as much space as possible"). Centred in their halves, two
 * portrait plates sat with a wide dark band between them — each picture is height-limited, so its
 * half had slack on both sides. Now each page keeps the 12px inset on its outer edge but only
 * {@link SPINE_PX} on the spine side, and pushes its picture against that side with
 * `object-position`, so all the slack goes to the outer margins and the two pictures read as one
 * open magazine. A picture wide enough to be width-limited fills its half either way.
 */
const SPINE_PX = 3;

function Page({
  page,
  endCell,
  priority,
  side,
}: {
  page: HeroPage;
  endCell: React.ReactNode;
  priority: boolean;
  /** Which side of a spread's spine the page is on; absent in single mode. */
  side?: "left" | "right";
}) {
  return (
    <div
      // The notch adds to the top inset on the phone rather than replacing it, so the picture never
      // sits under the status bar.
      className={cn(
        "flex min-w-0 flex-1 items-center py-[12px]",
        side === "left"
          ? "justify-end pl-[12px]"
          : side === "right"
            ? "justify-start pr-[12px]"
            : "justify-center px-[12px]",
      )}
      style={{
        height: "100%",
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)",
        ...(side === "left" && { paddingRight: SPINE_PX }),
        ...(side === "right" && { paddingLeft: SPINE_PX }),
      }}
    >
      {page === "end" ? (
        <div className="w-full max-w-[360px]">{endCell}</div>
      ) : (
        <RailImage item={page} priority={priority} side={side} />
      )}
    </div>
  );
}

/** One rail cell's picture. `pointer-events: none` — the track owns every pointer on the strip. */
function RailImage({
  item,
  priority,
  side,
}: {
  item: RailItem;
  /** The cell under the reader: fetched ahead of everything else, like the old hero. */
  priority: boolean;
  /** In a spread, the side of the spine — the picture is pushed against it. */
  side?: "left" | "right";
}) {
  // Through the proxy, except for the inline `data:` pixels the e2e corpus seeds — same branch as
  // the feed's tiles. See `src/app/api/img/[itemId]/route.ts` for why the proxy exists at all.
  const src = item.imageUrl?.startsWith("data:")
    ? item.imageUrl
    : `/api/img/${item.id}`;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={item.title}
      decoding="async"
      fetchPriority={priority ? "high" : "auto"}
      // The whole inset box, with the picture letterboxed inside it: as big as it can be in
      // either direction, never cropped, centred by `object-fit` itself. **No radius** —
      // decision 2 of docs/DESIGN_screen-structure.md.
      // In a spread, `object-right` / `object-left` push the letterboxed picture against the spine
      // rather than centring it in its half — see `Page`.
      className={cn(
        "pointer-events-none block h-full w-full object-contain",
        side === "left" && "object-right",
        side === "right" && "object-left",
      )}
    />
  );
}
