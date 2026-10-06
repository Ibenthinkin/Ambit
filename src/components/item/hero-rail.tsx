"use client";

import * as React from "react";

import { cn } from "~/lib/utils";
import { SNAP_MS } from "~/lib/zoom-math";
import type { RailItem } from "~/server/services/gallery-rail";
import type { HeroCells, HeroPage } from "./rail-cells";
import {
  FOLIO_FADE_MS,
  PERSPECTIVE_PX,
  SINGLE_ENTER_MS,
  TURN_EASE,
  angleAt,
  lightAt,
  motionMs,
  swingFrames,
  turnLayers,
  type Half,
  type LeafLayers,
  type Motion,
} from "./spread-motion";

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
//   - **The magazine's motion** (09-27-26, docs/PLAN_magazine-turn.md). In a spread the track stops
//     sliding: a turn is a **leaf** swinging 180° around the spine, drawn over the cell under the
//     reader. The screen says *what* turns (`motion`, built by `spread-motion.ts`); this file draws
//     it, runs it, lifts the leaf with a drag, lets a short drag fall back, lays the spine over the
//     seam, and fades the folios while a page is in the air.
//   - **The chrome's fade.** The caption — **`md` and up only; a phone has none** (DESIGN_redesign
//     §6.2: the pill and share disc are its whole chrome, and the title lives below the fold) —
//     overlays the foot of the strip on the gallery's gradient and fades
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
  /** Draw the spread's spine over the seam. The screen turns it off over the end card. */
  spine?: boolean;
  /** A page turn, or the book opening or closing — the screen's, until `onMotionEnd`. */
  motion?: Motion | null;
  /** The leaf has landed and the spread under it is final. */
  onMotionEnd?: (ended: Motion) => void;
  /**
   * The current page's zoom (docs/DESIGN_hero-zoom.md D1, D4): a transform on the picture under
   * the reader, and the track's `touch-action` flipped to `none` so a one-finger drag reaches the
   * picture rather than scrolling the page. `snapping` plays the 250ms settle; a live pinch or
   * pan has no transition at all. Single mode only — a spread never zooms.
   */
  zoom?: HeroZoom | null;
}

/** What `HeroRail` draws for a zoomed picture — `lib/zoom-math.ts`'s state plus the settle flag. */
export type HeroZoom = {
  scale: number;
  x: number;
  y: number;
  snapping: boolean;
};

/** The rail is three screens wide and holds three cells; one screen is a third of it. */
const CELL = "33.3333%";

/** The track's slide between cells. */
const EASE = "cubic-bezier(.22,.61,.36,1)";

/** A settle is the rail's own motion, so it numbers itself apart from the screen's. */
let settleSeq = 0;

export function HeroRail({
  cells,
  pages,
  trackRef,
  dragPx,
  dragging,
  chrome,
  chromeVisible,
  endCell,
  spine = false,
  motion = null,
  onMotionEnd,
  zoom = null,
}: HeroRailProps) {
  const spread = pages === 2;

  // ── the leaf lifted by a drag (plan D4) ───────────────────────────────────────────────────────
  // In a spread a horizontal drag no longer slides the track; it lifts the page on the side you
  // are pulling from and swings it with the pointer — half a screen of travel is a full turn.
  // Nothing lifts past a loaded end (no spread to turn to): the drag just does nothing there.
  const [settle, setSettle] = React.useState<Motion | null>(null);
  let lift: { layers: LeafLayers; p: number } | null = null;
  if (spread && dragging && dragPx !== 0 && !motion && !settle) {
    const dir = dragPx < 0 ? 1 : -1;
    const layers = turnLayers(dir, cells[1], dir === 1 ? cells[2] : cells[0]);
    if (layers) {
      lift = {
        layers,
        p: Math.min(1, Math.abs(dragPx) / (window.innerWidth / 2)),
      };
    }
  }
  // Where the drag let go, so a turn the release commits starts from there rather than flat, and
  // a release short of the threshold can fall back from there. Written after each render that
  // lifts; never cleared by a render that doesn't — the release render is exactly the one that
  // needs it.
  const lastLift = React.useRef<{ layers: LeafLayers; p: number } | null>(null);
  React.useLayoutEffect(() => {
    if (lift) lastLift.current = lift;
  });

  // A release that did not turn: the lifted page falls back flat (a settle, `p` → 0).
  const wasDragging = React.useRef(false);
  React.useLayoutEffect(() => {
    const released = wasDragging.current && !dragging;
    wasDragging.current = dragging;
    if (!released || motion) return;
    const l = lastLift.current;
    lastLift.current = null;
    if (!l || l.p === 0) return;
    setSettle({
      ...l.layers,
      key: --settleSeq,
      kind: "turn",
      from: l.p,
      to: 0,
    });
  }, [dragging, motion]);

  // ── running a motion (plan D1, D2) ────────────────────────────────────────────────────────────
  const active = spread ? (motion ?? settle) : null;
  /**
   * The leaf has finished swinging but is still drawn, for one frame, over the spread's *final*
   * pages — so the one picture that changes underneath (A → C on the left, for a forward turn)
   * changes beneath the leaf's back face, never in view. Then the leaf goes.
   */
  const [landed, setLanded] = React.useState(false);
  const leafRef = React.useRef<HTMLDivElement>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const endRef = React.useRef(onMotionEnd);
  // A layout effect, declared before the one that runs a motion: in a browser without
  // `animate` the motion lands inside that effect, in the same commit that started it, and must
  // reach this render's callback, not the last one's.
  React.useLayoutEffect(() => {
    endRef.current = onMotionEnd;
  });

  const finish = React.useCallback((m: Motion) => {
    setLanded(false);
    if (m.key < 0) setSettle(null);
    else endRef.current?.(m);
  }, []);

  React.useLayoutEffect(() => {
    if (!active) return;
    // A turn released mid-drag carries on from where the drag let go.
    let from = active.from;
    const l = lastLift.current;
    if (
      active.key > 0 &&
      active.kind === "turn" &&
      l?.layers.half === active.half
    ) {
      from = l.p;
    }
    if (active.key > 0) lastLift.current = null;

    const leaf = leafRef.current;
    // **The Web Animations API, not a CSS transition** (plan D2): it can start from any angle,
    // `finished` is a promise that can't be missed the way `transitionend` can — and it is *not*
    // collapsed by `globals.css`'s reduced-motion rule, which only reaches CSS animations and
    // transitions. That is deliberate and the one exemption in the app: Ben chose to have the turn
    // play under Reduce Motion (09-27-26). jsdom has no `animate`, so there — and in any browser
    // that lacks it — the motion simply lands at once.
    if (!leaf || typeof leaf.animate !== "function") {
      finish(active);
      return;
    }
    const frames = swingFrames(active.half, from, active.to);
    const timing: KeyframeAnimationOptions = {
      duration: motionMs(from, active.to),
      // A page let go short falls back on its own weight; everything else is the tokens' curve.
      easing: active.key < 0 ? "cubic-bezier(.3,.7,.4,1)" : TURN_EASE,
      fill: "forwards",
    };
    const anims = [
      leaf.animate(frames.leaf, timing),
      ...[...leaf.querySelectorAll<HTMLElement>("[data-shade]")].map((el) =>
        el.animate(frames.shade, timing),
      ),
      ...[
        ...(stageRef.current?.querySelectorAll<HTMLElement>("[data-cast]") ??
          []),
      ].map((el) => el.animate(frames.cast, timing)),
    ];
    let live = true;
    void Promise.all(anims.map((a) => a.finished)).then(
      () => {
        if (!live) return;
        setLanded(true);
        requestAnimationFrame(() => {
          if (live) finish(active);
        });
      },
      // Cancelled by the cleanup below — a newer motion, or the spread switched off.
      () => undefined,
    );
    return () => {
      live = false;
      for (const a of anims) a.cancel();
    };
  }, [active, finish]);

  // ── the folios step aside while a page is in the air (plan D7) ────────────────────────────────
  // Hidden the instant a turn starts — the screen has already moved to the new pages, so the
  // captions would otherwise change mid-air — and faded back in when it lands. WAAPI again, so
  // the fade plays under Reduce Motion like the turn it belongs to.
  const chromeInner = React.useRef<HTMLDivElement>(null);
  const hadMotion = React.useRef(false);
  React.useLayoutEffect(() => {
    const had = hadMotion.current;
    hadMotion.current = !!motion;
    if (had && !motion) {
      chromeInner.current?.animate?.([{ opacity: 0 }, { opacity: 1 }], {
        duration: FOLIO_FADE_MS,
        easing: "ease",
      });
    }
  }, [motion]);

  // ── single view fades in after the book folds shut (plan Task 6) ──────────────────────────────
  const currentCell = React.useRef<HTMLDivElement>(null);
  const prevPages = React.useRef(pages);
  React.useLayoutEffect(() => {
    if (prevPages.current === 2 && pages === 1) {
      currentCell.current?.animate?.([{ opacity: 0 }, { opacity: 1 }], {
        duration: SINGLE_ENTER_MS,
        easing: "ease",
      });
    }
    prevPages.current = pages;
  }, [pages]);

  // What the leaf shows, and what lies under it. A landed turn draws the spread's real pages
  // under the leaf; a landed close keeps its own (the single view comes next, not the spread).
  const shown: { layers: LeafLayers; p: number; key: number } | null = active
    ? { layers: active, p: landed ? active.to : active.from, key: active.key }
    : lift
      ? { layers: lift.layers, p: lift.p, key: 0 }
      : null;
  const under =
    active && !(landed && active.kind !== "close")
      ? active.under
      : !active && lift
        ? lift.layers.under
        : null;

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
          // gesture hook — see `use-rail-gestures.ts` for why it never calls `preventDefault` on
          // one finger. While zoomed it is `none`: the picture takes every axis
          // (docs/DESIGN_hero-zoom.md D2). The browser reads it at touchstart, so the flip lands
          // between gestures — which is exactly when it should.
          style={{
            touchAction: zoom ? "none" : "pan-y",
            width: "300%",
            height: "100%",
            // -33.3333% of a 3-screen-wide rail is exactly one screen, which centres the middle
            // cell. The drag rides on top in raw px: the rail moves with the finger 1:1.
            // In a spread the drag lifts the leaf instead, so the track holds still.
            transform: `translateX(calc(-${CELL} + ${spread ? 0 : dragPx}px))`,
            transition: dragging ? "none" : `transform .4s ${EASE}`,
            willChange: "transform",
          }}
          className="flex"
        >
          {cells.map((cellPages, i) => {
            // Under a moving leaf the current cell shows the leaf's under-pages instead: a blank
            // page is an empty half.
            const c = i === 1 && under ? under : cellPages;
            return (
              <div
                key={
                  c
                    ? c.map((p) => (p ? pageKey(p) : "blank")).join("+")
                    : `empty-${i}`
                }
                ref={i === 1 ? currentCell : undefined}
                className="flex"
                style={{ flex: `0 0 ${CELL}`, height: "100%" }}
              >
                {c?.map((page, side) =>
                  !page ? (
                    <div key={`blank-${side}`} className="min-w-0 flex-1" />
                  ) : (
                    <Page
                      key={pageKey(page)}
                      page={page}
                      // In a spread each page knows which side of the spine it is on, and leans its
                      // picture towards it. A lone last page is a left page too.
                      side={
                        pages === 2
                          ? side === 0
                            ? "left"
                            : "right"
                          : undefined
                      }
                      endCell={endCell}
                      // Every page of the cell under the reader — both halves of a spread.
                      priority={i === 1}
                      // Only the page under the reader zooms, and only in single mode (D1).
                      // `undefined` = not that page; `null` = that page, not zoomed.
                      zoom={i === 1 && pages === 1 ? zoom : undefined}
                    />
                  ),
                )}
                {/* A spread's lone last page stays on the left half, a magazine's blank verso
                  beside it, rather than drifting to the centre. */}
                {c && pages === 2 && c.length === 1 ? (
                  <div className="min-w-0 flex-1" />
                ) : null}
              </div>
            );
          })}
        </div>

        {/* The binding (plan D6): the tokens' 90px gradient over the seam — shadow into the
            gutter, a hairline of light, shadow out. The pictures touch at the spine, and this is
            what makes two butted pictures read as one bound spread. Under the leaf, which lifts
            off it. */}
        {spread && spine ? (
          <div
            data-testid="spread-spine"
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-1/2 w-[90px] -translate-x-1/2"
            style={{ background: SPINE_GRADIENT }}
          />
        ) : null}

        {spread && shown ? (
          <div
            ref={stageRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{ perspective: `${PERSPECTIVE_PX}px` }}
          >
            <CastShadow side="left" p={shown.p} />
            <CastShadow side="right" p={shown.p} />
            <Leaf
              key={shown.key}
              ref={leafRef}
              layers={shown.layers}
              p={shown.p}
              endCell={endCell}
            />
          </div>
        ) : null}

        <div
          data-testid="gallery-chrome"
          data-chrome
          aria-hidden={!chromeVisible}
          // `hidden md:block`: no caption over the hero on a phone. Above `md` the rail is at the
          // right edge, so the caption keeps the gallery's 42.
          className="pointer-events-none absolute inset-x-0 bottom-0 hidden min-h-[180px] flex-col justify-end px-10 pb-[34px] md:flex"
          // **`visibility`, not `pointer-events`, is what makes it untappable while hidden.** An
          // ancestor's `pointer-events: none` can be overridden by any descendant that sets
          // `auto` — and the caption's own targets do exactly that. `visibility: hidden` cannot be
          // overridden that way, and it transitions discretely: flipping to visible takes effect
          // at once, and back to hidden only after the fade has finished. An invisible control
          // that still takes taps is worse than no control at all.
          style={{
            // The desktop caption's fade (docs/DESIGN_redesign.md §6.3): 450ms, opacity only,
            // with the rail.
            opacity: chromeVisible ? 1 : 0,
            visibility: chromeVisible ? "visible" : "hidden",
            transition: "opacity .45s ease, visibility .45s",
            background:
              "linear-gradient(to top, rgba(0,0,0,0.75), transparent)",
          }}
        >
          {/* Only the real targets inside take pointer events back (the screen sets
              `pointer-events-auto` on them) — the gradient stays inert, so a horizontal swipe low
              on the picture still reaches the track underneath rather than dying on a decoration. */}
          <div
            ref={chromeInner}
            // Hidden while the screen's motion is in flight; faded back in by the effect above.
            style={motion && spread ? { opacity: 0 } : undefined}
          >
            {chrome}
          </div>
        </div>
      </div>
    </section>
  );
}

const pageKey = (p: HeroPage) => (p === "end" ? "end" : p.id);

/** `view-toggle.tokens.json` `spread.spine.gradient`, verbatim. */
const SPINE_GRADIENT =
  "linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,0.16) 34%, rgba(0,0,0,0.42) 49%, rgba(255,255,255,0.06) 50.5%, rgba(0,0,0,0.2) 56%, rgba(0,0,0,0) 100%)";

/**
 * The page in the air: one half of the spread, hinged at the spine, a picture on each face.
 *
 * The faces are opaque (`bg-immersive`) — paper is not glass, and a letterboxed picture on a
 * transparent face would show the page underneath through its margins. Each face is laid out as
 * the page it *is* at that moment: the front as a page on the leaf's own half, the back as a page
 * on the half it lands on (it is pre-rotated 180°, so once the leaf has swung over it reads the
 * right way round and hugs the spine from the other side).
 *
 * Each face carries a shade (`data-shade`), darkest at the hinge, whose opacity is the light at
 * this angle (plan D5). The screen animates it alongside the rotation; a drag sets it per render.
 */
function Leaf({
  ref,
  layers,
  p,
  endCell,
}: {
  ref: React.Ref<HTMLDivElement>;
  layers: LeafLayers;
  p: number;
  endCell: React.ReactNode;
}) {
  const { half, front, back } = layers;
  const other: Half = half === "right" ? "left" : "right";
  const shade = lightAt(p).leaf;
  // The hinge is the leaf's spine edge: its left edge on the right half, and the reverse. The back
  // face is mirrored, so its gradient runs the other way.
  const towardsHinge = half === "right" ? "to right" : "to left";
  const backTowardsHinge = half === "right" ? "to left" : "to right";

  return (
    <div
      ref={ref}
      data-testid="spread-leaf"
      data-half={half}
      className="absolute inset-y-0 w-1/2"
      style={{
        left: half === "right" ? "50%" : 0,
        transformOrigin: half === "right" ? "left center" : "right center",
        transformStyle: "preserve-3d",
        transform: `rotateY(${angleAt(half, p)}deg)`,
      }}
    >
      <Face
        page={front}
        side={half}
        gradient={towardsHinge}
        shade={shade}
        endCell={endCell}
      />
      <Face
        page={back}
        side={other}
        gradient={backTowardsHinge}
        shade={shade}
        endCell={endCell}
        back
      />
    </div>
  );
}

function Face({
  page,
  side,
  gradient,
  shade,
  endCell,
  back = false,
}: {
  page: RailItem | undefined;
  side: Half;
  gradient: string;
  shade: number;
  endCell: React.ReactNode;
  back?: boolean;
}) {
  return (
    <div
      data-face={back ? "back" : "front"}
      className="bg-immersive absolute inset-0 flex"
      style={{
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        transform: back ? "rotateY(180deg)" : undefined,
      }}
    >
      {page ? (
        <Page page={page} side={side} endCell={endCell} priority={false} />
      ) : null}
      <div
        data-shade=""
        className="absolute inset-0"
        style={{
          opacity: shade,
          background: `linear-gradient(${gradient}, rgba(0,0,0,1), rgba(0,0,0,0.35) 55%, rgba(0,0,0,0.1))`,
        }}
      />
    </div>
  );
}

/**
 * The shadow a standing leaf throws into the gutter (plan D5): a band on each page, darkest at the
 * spine, as strong as the leaf is upright. `data-cast` is how the screen's animation finds it.
 */
function CastShadow({ side, p }: { side: Half; p: number }) {
  return (
    <div
      data-cast=""
      className={cn(
        "absolute inset-y-0 w-[18%]",
        side === "left" ? "right-1/2" : "left-1/2",
      )}
      style={{
        opacity: lightAt(p).cast,
        background: `linear-gradient(${side === "left" ? "to left" : "to right"}, rgba(0,0,0,0.9), rgba(0,0,0,0))`,
      }}
    />
  );
}

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
 *
 * **They touch** — Ben's second note the same afternoon, "can we have them touch in the middle".
 * The spine inset went 3px → 0, so the two pictures meet edge to edge with no gutter at all. Kept
 * as a named constant rather than deleted, because it is the one number to change if a hairline
 * gutter comes back.
 */
const SPINE_PX = 0;

function Page({
  page,
  endCell,
  priority,
  side,
  zoom,
}: {
  page: HeroPage;
  endCell: React.ReactNode;
  priority: boolean;
  /** Which side of a spread's spine the page is on; absent in single mode. */
  side?: "left" | "right";
  /**
   * `undefined` for every page but the current single one; `null` or a zoom for that one, which
   * also marks its box for the screen to measure (docs/DESIGN_hero-zoom.md D3).
   */
  zoom?: HeroZoom | null;
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
        <PageBox zoom={zoom}>
          <RailImage item={page} priority={priority} side={side} zoom={zoom} />
        </PageBox>
      )}
    </div>
  );
}

/**
 * The box the screen measures at each gesture start (docs/DESIGN_hero-zoom.md D3): the zoom's
 * transform sits on the `<img>` inside, so this rect is the untransformed inset box however far
 * the picture is already zoomed.
 *
 * **Every page has one; only the current single-mode page is marked.** The wrapper is the same
 * element type on every page so that a page becoming current — every advance — changes an
 * attribute, never the tree. Wrapping only the current page made React swap `<img>` for
 * `<div><img/></div>` at the same position and remount the incoming and outgoing pictures at the
 * start of every slide (the final review, 10-04-26).
 */
function PageBox({
  zoom,
  children,
}: {
  zoom: HeroZoom | null | undefined;
  children: React.ReactNode;
}) {
  return (
    <div
      data-page-box={zoom !== undefined ? "" : undefined}
      className="h-full w-full min-w-0"
    >
      {children}
    </div>
  );
}

/** One rail cell's picture. `pointer-events: none` — the track owns every pointer on the strip. */
function RailImage({
  item,
  priority,
  side,
  zoom,
}: {
  item: RailItem;
  /** The cell under the reader: fetched ahead of everything else, like the old hero. */
  priority: boolean;
  /** In a spread, the side of the spine — the picture is pushed against it. */
  side?: "left" | "right";
  /**
   * `undefined` for every picture but the current single-mode one; for that one, its zoom or
   * `null` when unzoomed (docs/DESIGN_hero-zoom.md D4).
   */
  zoom?: HeroZoom | null;
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
      style={
        zoom
          ? {
              transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`,
              transformOrigin: "0 0",
              willChange: "transform",
              // A CSS transition, not WAAPI, on purpose: `globals.css`'s reduced-motion rule
              // collapses it, and zoom gets no exemption — only the magazine turn has one (D4).
              transition: zoom.snapping
                ? `transform ${SNAP_MS}ms ease`
                : "none",
            }
          : zoom === null
            ? {
                // The current picture, unzoomed: identity, with the settle armed. A zoom ending
                // (a release under the snap, a double-tap out) needs a transform to transition
                // *to* — with no style at all it would pop back to 1. Going the other way, the
                // zoomed style's own `transition: none` wins, so a live pinch never lags.
                transform: "translate(0px, 0px) scale(1)",
                transformOrigin: "0 0",
                transition: `transform ${SNAP_MS}ms ease`,
              }
            : undefined
      }
    />
  );
}
