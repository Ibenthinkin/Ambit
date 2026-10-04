// The hero's zoom, as arithmetic (docs/DESIGN_hero-zoom.md D3). No React, no DOM: every function
// takes sizes and points and returns a `Zoom`, so the whole thing is pinned by `zoom-math.test.ts`
// and the screen that uses it stays thin.
//
// **Coordinates.** Everything here is in the *picture box's* space — the 12px-inset box the
// `<img>` fills on the item screen — with its top-left at (0, 0), in CSS px. `fit` is the
// letterboxed picture inside that box (what `object-contain` draws at scale 1); `x`/`y` are the
// translation applied to the box's content with `transform-origin: 0 0`; `box` is the box's size,
// and the bounds are its edges. The screen converts a client point into this space once per
// gesture by subtracting the box's `getBoundingClientRect()` left/top.

export type Size = { width: number; height: number };
export type Rect = { x: number; y: number; width: number; height: number };
export type Point = { x: number; y: number };
/** The current picture's transform: `translate(x, y) scale(scale)` about the box's top-left. */
export type ZoomState = { scale: number; x: number; y: number };
/** `null` is the hero exactly as today — not zoomed. */
export type Zoom = ZoomState | null;

export const IDENTITY: ZoomState = { scale: 1, x: 0, y: 0 };

/** A small picture may still be looked at closer than its pixels honestly go: soft beats none. */
export const MIN_CEILING = 2.5;
/** …but no picture is zoomed into mush. */
export const MAX_SCALE = 4;
/** Where a double-tap lands (or the ceiling, if lower). iOS Photos' own jump is about this. */
export const DOUBLE_TAP_SCALE = 2.5;
/** A live pinch may shrink the picture to this before the release snaps it back to 1. */
export const LIVE_MIN = 0.6;
/** …and may overshoot the ceiling by this much, for the same rubber-band feel. */
export const LIVE_OVER = 1.25;
/** Past a bound, the picture follows the finger at this fraction of its travel. */
export const RESISTANCE = 0.35;
/** The settle's transition. A CSS transition, so Reduce Motion collapses it (D4). */
export const SNAP_MS = 250;

const clampN = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

/** The letterboxed picture inside the box — `object-contain`'s arithmetic, done once per gesture. */
export function fitRect(box: Size, natural: Size): Rect {
  if (
    natural.width <= 0 ||
    natural.height <= 0 ||
    box.width <= 0 ||
    box.height <= 0
  ) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const s = Math.min(box.width / natural.width, box.height / natural.height);
  const width = natural.width * s;
  const height = natural.height * s;
  return {
    x: (box.width - width) / 2,
    y: (box.height - height) / 2,
    width,
    height,
  };
}

/**
 * Scale about a point so the content under it stays under it. A content point `c` is drawn at
 * `x + c·scale`; for the point under `origin` to stay put after scaling by `factor`, the new
 * translation is `origin − (origin − x)·factor`.
 */
export function zoomAbout(
  z: ZoomState,
  factor: number,
  origin: Point,
): ZoomState {
  return {
    scale: z.scale * factor,
    x: origin.x - (origin.x - z.x) * factor,
    y: origin.y - (origin.y - z.y) * factor,
  };
}

/**
 * One frame of a live pinch, from where it *started*: scale about the starting midpoint by the
 * fingers' distance ratio, then follow the midpoint's drift so two fingers moving together pan as
 * they zoom. Computed from `start` every frame — never from the last frame — so a long pinch
 * accumulates no rounding.
 */
export function pinchUpdate(
  start: ZoomState,
  startMid: Point,
  now: { ratio: number; cx: number; cy: number },
): ZoomState {
  const z = zoomAbout(start, now.ratio, startMid);
  return {
    ...z,
    x: z.x + (now.cx - startMid.x),
    y: z.y + (now.cy - startMid.y),
  };
}

/**
 * How far a zoom may honestly go. The image cache serves ≤1600px masters (Phase 7.3) and there is
 * no larger rendition to ask for, so past `natural.width / (fit.width · dpr)` — one source pixel
 * per device pixel — the picture is interpolation. Floored at {@link MIN_CEILING}, capped at
 * {@link MAX_SCALE}.
 */
export function ceiling(natural: Size, fit: Rect, dpr: number): number {
  if (fit.width <= 0) return MIN_CEILING;
  const honest = natural.width / (fit.width * dpr);
  return clampN(honest, MIN_CEILING, MAX_SCALE);
}

/**
 * The translation bounds on one axis. A picture longer than the box must cover it (its near edge
 * at or before 0, its far edge at or past the box's length); one shorter than the box sits
 * centred, so the bounds collapse to a point. `fitOff` is the letterbox offset on this axis.
 */
function axisBounds(
  boxLen: number,
  fitOff: number,
  fitLen: number,
  scale: number,
): { min: number; max: number } {
  const len = fitLen * scale;
  if (len >= boxLen) {
    // `0 - …`, not `-…`: a picture with no letterbox on this axis has `fitOff` 0, and `-0` is a
    // real value in JS that leaks into the transform and fails `Object.is` comparisons.
    return { min: boxLen - len - fitOff * scale, max: 0 - fitOff * scale };
  }
  const centred = (boxLen - len) / 2 - fitOff * scale;
  return { min: centred, max: centred };
}

/** Pull an overshot scale back to `scale`, about the box's centre, so the picture doesn't jump. */
function rescale(z: ZoomState, scale: number, box: Size): ZoomState {
  if (scale === z.scale) return z;
  return zoomAbout(z, scale / z.scale, { x: box.width / 2, y: box.height / 2 });
}

/**
 * Where a release lands. At or under 1 the zoom is over (`null`). Otherwise the scale is clamped
 * to the ceiling and the translation to the bounds — covering the box on any axis the picture
 * exceeds, centred on any it doesn't, per axis.
 */
export function settle(z: ZoomState, fit: Rect, box: Size, ceil: number): Zoom {
  if (z.scale <= 1) return null;
  const scale = Math.min(z.scale, ceil);
  const s = rescale(z, scale, box);
  const bx = axisBounds(box.width, fit.x, fit.width, scale);
  const by = axisBounds(box.height, fit.y, fit.height, scale);
  return {
    scale,
    x: clampN(s.x, bx.min, bx.max),
    y: clampN(s.y, by.min, by.max),
  };
}

function resist(v: number, b: { min: number; max: number }): number {
  if (v > b.max) return b.max + (v - b.max) * RESISTANCE;
  if (v < b.min) return b.min - (b.min - v) * RESISTANCE;
  return v;
}

/**
 * A gesture in flight: the scale may run from {@link LIVE_MIN} to the ceiling × {@link LIVE_OVER},
 * and the translation past a bound follows the finger at {@link RESISTANCE} — the rubber-band
 * that tells the hand it has reached an edge before `settle` snaps it back.
 */
export function live(
  z: ZoomState,
  fit: Rect,
  box: Size,
  ceil: number,
): ZoomState {
  const scale = clampN(z.scale, LIVE_MIN, ceil * LIVE_OVER);
  const s = rescale(z, scale, box);
  const bx = axisBounds(box.width, fit.x, fit.width, scale);
  const by = axisBounds(box.height, fit.y, fit.height, scale);
  return { scale, x: resist(s.x, bx), y: resist(s.y, by) };
}

/** A double-tap: in to {@link DOUBLE_TAP_SCALE} about the tapped point, or out to the hero. */
export function doubleTapTarget(
  z: Zoom,
  point: Point,
  fit: Rect,
  box: Size,
  ceil: number,
): Zoom {
  if (z) return null;
  const target = Math.min(DOUBLE_TAP_SCALE, ceil);
  return settle(zoomAbout(IDENTITY, target, point), fit, box, ceil);
}
