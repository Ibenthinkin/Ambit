# Hero zoom — pinch and double-tap on the item screen's picture — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Written:** 10-04-26 by Fable 5.1, from the design doc below and a read of every file named here
at `main` = `da5c4ad`. **For:** a cold session on a cheaper model, on a plain branch
`feat/hero-zoom` off `main` (Ben's convention — no worktree, unless another session holds the
checkout).

**Goal:** on a phone, the item screen's picture can be pinched to zoom, panned with one finger
while zoomed, and double-tapped in and out; the two-finger exit is gone; the desktop and the
magazine spread are unchanged.

**Architecture:** a pure `lib/zoom-math.ts` does every number (fit, scale about a point, the
ceiling, settle, rubber-band, double-tap target); `use-rail-gestures.ts` learns pinch, pan and
double-tap and forgets the two-finger exit; `HeroRail` takes a `zoom` prop and puts the transform
on the current image only, flipping the track's `touch-action`; `ItemScreen` holds the one piece
of zoom state, measures the picture once at each gesture start, and resets zoom on every index
change. No server change, no new dependency.

**Tech Stack:** Next.js 16.2 App Router, React 19, Tailwind v4, Vitest 4 (+ jsdom), Playwright
1.62, Bun 1.4. **No new dependencies** (decision 3 of the design).

**Spec:** `docs/DESIGN_hero-zoom.md` — read it first. D1–D6 there are the spec; this plan is how.

## Global constraints

- TDD: the test first, watched to fail, then the code. `bun run test` per task, `bun run check`
  (typecheck + lint + prettier + tests) before each commit. Commit per task.
- Comment generously: Ben is a returning webdev and the repo teaches. Cite the design's D-numbers
  in comments the way `hero-rail.tsx` cites `DESIGN_spread-mode.md`.
- Nothing on the desktop changes: a mouse never zooms (the hook skips `pointerType === "mouse"`
  for double-tap and can't see two mouse pointers), and `zoomable` is false in a spread.
- Every `<img>` of an item stays `/api/img/{id}` or a `data:` URL. This plan adds no image.
- The `<img>` keeps `pointer-events: none` and no `-webkit-touch-callout` (hero-rail.tsx's
  header says why: iOS's native long-press "Add to Photos").
- Prettier runs on commit: `bunx prettier --write <the files you touched>` before `bun run check`.
- Do not push or merge; Ben does the device pass (Task 7) first.
- Formatting of numbers in code: constants live in `zoom-math.ts` with a one-line reason each;
  nothing in the hook or the screen hard-codes a zoom number.

## Review focus

Inputs the design implies but no task's tests exercised until this list was written — each now
has a test in the task named:

1. **A picture that has not decoded yet** (`naturalWidth === 0`) — a pinch or double-tap must do
   nothing, not zoom a 0×0 fit into NaN. Task 5.
2. **A third finger** — must neither start a second pinch nor end the first. Task 2.
3. **A pinch that ends below scale 1 with one finger still down** — the picture settles to 1 and
   the remaining finger must not pan or advance anything. Task 3 (hook) and Task 5 (screen
   ignores a pan while `zoom` is null).
4. **A tall picture in a short box** — `settle` covers the box vertically and centres horizontally;
   the axis logic must be per axis, not whichever is bigger. Task 1.
5. **Two mouse clicks in quick succession on the desktop** — two taps, never a double-tap; the
   desktop's click-to-toggle chrome is unchanged. Task 3.

---

## Task 1 — The math (`src/lib/zoom-math.ts`)

**Files:**

- Create: `src/lib/zoom-math.ts`
- Test: `src/lib/zoom-math.test.ts`

**Interfaces — produces** (used verbatim by Task 5):

```ts
export type Size = { width: number; height: number };
export type Rect = { x: number; y: number; width: number; height: number };
export type Point = { x: number; y: number };
export type ZoomState = { scale: number; x: number; y: number };
export type Zoom = ZoomState | null;
export const IDENTITY: ZoomState;
export const MIN_CEILING, MAX_SCALE, DOUBLE_TAP_SCALE, LIVE_MIN, LIVE_OVER, RESISTANCE, SNAP_MS;
export function fitRect(box: Size, natural: Size): Rect;
export function zoomAbout(z: ZoomState, factor: number, origin: Point): ZoomState;
export function pinchUpdate(start: ZoomState, startMid: Point, now: { ratio: number; cx: number; cy: number }): ZoomState;
export function ceiling(natural: Size, fit: Rect, dpr: number): number;
export function settle(z: ZoomState, fit: Rect, box: Size, ceil: number): Zoom;
export function live(z: ZoomState, fit: Rect, box: Size, ceil: number): ZoomState;
export function doubleTapTarget(z: Zoom, point: Point, fit: Rect, box: Size, ceil: number): Zoom;
```

- [ ] **Step 1: Branch**

```bash
git checkout -b feat/hero-zoom main
```

- [ ] **Step 2: Write the failing tests**

`src/lib/zoom-math.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  DOUBLE_TAP_SCALE,
  IDENTITY,
  LIVE_MIN,
  LIVE_OVER,
  MAX_SCALE,
  MIN_CEILING,
  RESISTANCE,
  ceiling,
  doubleTapTarget,
  fitRect,
  live,
  pinchUpdate,
  settle,
  zoomAbout,
} from "./zoom-math";

// A phone-shaped box and three picture shapes. Everything is in the box's own space
// (docs/DESIGN_hero-zoom.md D3 "Coordinates").
const BOX = { width: 400, height: 800 };
const WIDE = { width: 1600, height: 800 }; // fits the width: 400×200, centred vertically
const TALL = { width: 800, height: 1600 }; // fits the height: 400×800, no letterbox
const SQUARE = { width: 1000, height: 1000 }; // 400×400, centred vertically

describe("fitRect", () => {
  it("letterboxes a wide picture on the width and centres it vertically", () => {
    expect(fitRect(BOX, WIDE)).toEqual({ x: 0, y: 300, width: 400, height: 200 });
  });
  it("fits a tall picture to the whole box", () => {
    expect(fitRect(BOX, TALL)).toEqual({ x: 0, y: 0, width: 400, height: 800 });
  });
  it("centres a square picture vertically", () => {
    expect(fitRect(BOX, SQUARE)).toEqual({ x: 0, y: 200, width: 400, height: 400 });
  });
  it("is empty for a picture with no size, rather than NaN", () => {
    expect(fitRect(BOX, { width: 0, height: 0 })).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
  });
});

describe("zoomAbout", () => {
  it("keeps the point under the fingers where it is", () => {
    // The content point under (100, 200) at identity is (100, 200). After scaling ×2 about it,
    // that same content point maps to z.x + 100 * 2 — which must still be 100.
    const z = zoomAbout(IDENTITY, 2, { x: 100, y: 200 });
    expect(z.scale).toBe(2);
    expect(z.x + 100 * z.scale).toBeCloseTo(100);
    expect(z.y + 200 * z.scale).toBeCloseTo(200);
  });
  it("composes: zooming about a point from an already-zoomed state keeps that point too", () => {
    const first = zoomAbout(IDENTITY, 2, { x: 100, y: 200 });
    // The content point under (300, 500) in the zoomed state is ((300 - first.x) / 2, …).
    const cx = (300 - first.x) / first.scale;
    const cy = (500 - first.y) / first.scale;
    const second = zoomAbout(first, 1.5, { x: 300, y: 500 });
    expect(second.scale).toBe(3);
    expect(second.x + cx * second.scale).toBeCloseTo(300);
    expect(second.y + cy * second.scale).toBeCloseTo(500);
  });
});

describe("pinchUpdate", () => {
  it("scales about the starting midpoint, then follows the midpoint's drift", () => {
    const start = IDENTITY;
    const mid = { x: 200, y: 400 };
    const stillThere = pinchUpdate(start, mid, { ratio: 2, cx: 200, cy: 400 });
    expect(stillThere).toEqual(zoomAbout(start, 2, mid));
    const drifted = pinchUpdate(start, mid, { ratio: 2, cx: 230, cy: 380 });
    expect(drifted.x).toBeCloseTo(stillThere.x + 30);
    expect(drifted.y).toBeCloseTo(stillThere.y - 20);
  });
  it("is computed from the start every frame, so it never accumulates", () => {
    const mid = { x: 200, y: 400 };
    const a = pinchUpdate(IDENTITY, mid, { ratio: 1.5, cx: 200, cy: 400 });
    const b = pinchUpdate(IDENTITY, mid, { ratio: 1.5, cx: 200, cy: 400 });
    expect(a).toEqual(b);
  });
});

describe("ceiling", () => {
  const fit = fitRect(BOX, WIDE); // 400 wide
  it("floors at MIN_CEILING when the picture has few pixels to give", () => {
    // 1600 px over 400 CSS px at 3× = 1.33 honest; the floor wins.
    expect(ceiling(WIDE, fit, 3)).toBe(MIN_CEILING);
  });
  it("follows the pixel-honest value in between", () => {
    // 1600 px over 400 CSS px at 1× = 4.0 → capped; at 1.25× = 3.2 → honest.
    expect(ceiling(WIDE, fit, 1.25)).toBeCloseTo(3.2);
  });
  it("caps at MAX_SCALE", () => {
    expect(ceiling({ width: 8000, height: 4000 }, fit, 1)).toBe(MAX_SCALE);
  });
  it("is the floor for an empty fit", () => {
    expect(ceiling(WIDE, { x: 0, y: 0, width: 0, height: 0 }, 2)).toBe(MIN_CEILING);
  });
});

describe("settle", () => {
  const fit = fitRect(BOX, SQUARE); // 400×400 at y 200
  it("is null at or under scale 1 — the hero as it was", () => {
    expect(settle({ scale: 1, x: 0, y: 0 }, fit, BOX, 3)).toBeNull();
    expect(settle({ scale: 0.7, x: 40, y: 40 }, fit, BOX, 3)).toBeNull();
  });
  it("clamps the scale to the ceiling", () => {
    expect(settle({ scale: 5, x: 0, y: 0 }, fit, BOX, 3)?.scale).toBe(3);
  });
  it("covers the box on an axis the picture exceeds, and centres on one it doesn't", () => {
    // ×1.5: the square is 600×600 — wider than the box (cover), shorter than it (centre).
    const z = settle({ scale: 1.5, x: 500, y: -900 }, fit, BOX, 3)!;
    // Horizontal: left edge ≤ 0 and right edge ≥ 400. x + fit.x*s = left; fit.x is 0 here.
    expect(z.x).toBeLessThanOrEqual(0);
    expect(z.x + 400 * 1.5).toBeGreaterThanOrEqual(400);
    expect(z.x).toBe(0); // it was pulled right past the edge, so it snaps to the left bound
    // Vertical: centred — the scaled picture's top is (800 - 600) / 2 = 100.
    expect(z.y + fit.y * 1.5).toBeCloseTo(100);
  });
  it("is per axis: a tall picture covers vertically and centres horizontally (review focus 4)", () => {
    const tallFit = fitRect(BOX, { width: 200, height: 1600 }); // 100×800 at x 150
    const z = settle({ scale: 2, x: -999, y: 50 }, tallFit, BOX, 3)!;
    // Horizontal 200 px wide, narrower than 400: centred at left 100 → x + 150*2 = 100.
    expect(z.x + tallFit.x * 2).toBeCloseTo(100);
    // Vertical 1600 tall: top ≤ 0, pulled down past the top → snaps to 0.
    expect(z.y + tallFit.y * 2).toBeCloseTo(0);
  });
});

describe("live", () => {
  const fit = fitRect(BOX, SQUARE);
  it("lets the scale run from LIVE_MIN to the ceiling times LIVE_OVER", () => {
    expect(live({ scale: 0.1, x: 0, y: 0 }, fit, BOX, 3).scale).toBe(LIVE_MIN);
    expect(live({ scale: 9, x: 0, y: 0 }, fit, BOX, 3).scale).toBeCloseTo(3 * LIVE_OVER);
    expect(live({ scale: 2, x: 0, y: 0 }, fit, BOX, 3).scale).toBe(2);
  });
  it("rubber-bands an offset past the bound at RESISTANCE of the overshoot", () => {
    // ×2: 800 wide, bounds for x are [-400, 0]. Dragged to +100: overshoot 100.
    const z = live({ scale: 2, x: 100, y: 0 }, fit, BOX, 3);
    expect(z.x).toBeCloseTo(100 * RESISTANCE);
    const inside = live({ scale: 2, x: -200, y: 0 }, fit, BOX, 3);
    expect(inside.x).toBe(-200);
  });
});

describe("doubleTapTarget", () => {
  const fit = fitRect(BOX, SQUARE);
  it("zooms to DOUBLE_TAP_SCALE about the tapped point, settled into bounds", () => {
    const z = doubleTapTarget(null, { x: 200, y: 400 }, fit, BOX, 3)!;
    expect(z.scale).toBe(DOUBLE_TAP_SCALE);
    // 1000 wide at 2.5: x in [-600, 0]; about the centre x = 200 - 200*2.5 = -300. Inside.
    expect(z.x).toBeCloseTo(-300);
  });
  it("stops at the ceiling when that is lower", () => {
    expect(doubleTapTarget(null, { x: 0, y: 0 }, fit, BOX, 2)!.scale).toBe(2);
  });
  it("is null — back to the hero — when already zoomed", () => {
    expect(doubleTapTarget({ scale: 2, x: 0, y: 0 }, { x: 0, y: 0 }, fit, BOX, 3)).toBeNull();
  });
});
```

- [ ] **Step 3: Run it, watch it fail**

```bash
bunx vitest run src/lib/zoom-math.test.ts
```

Expected: fails to resolve `./zoom-math`.

- [ ] **Step 4: Write the module**

`src/lib/zoom-math.ts`:

```ts
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
  return { x: (box.width - width) / 2, y: (box.height - height) / 2, width, height };
}

/**
 * Scale about a point so the content under it stays under it. A content point `c` is drawn at
 * `x + c·scale`; for the point under `origin` to stay put after scaling by `factor`, the new
 * translation is `origin − (origin − x)·factor`.
 */
export function zoomAbout(z: ZoomState, factor: number, origin: Point): ZoomState {
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
  return { ...z, x: z.x + (now.cx - startMid.x), y: z.y + (now.cy - startMid.y) };
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
    return { min: boxLen - len - fitOff * scale, max: -fitOff * scale };
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
  return { scale, x: clampN(s.x, bx.min, bx.max), y: clampN(s.y, by.min, by.max) };
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
export function live(z: ZoomState, fit: Rect, box: Size, ceil: number): ZoomState {
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
```

- [ ] **Step 5: Run it, watch it pass**

```bash
bunx vitest run src/lib/zoom-math.test.ts
```

Expected: all green. If `settle`'s "covers the box" test fails on `z.x` being `0`: the input
`x: 500` is past the `max` bound of `0` and must clamp to exactly `0`.

- [ ] **Step 6: Commit**

```bash
bunx prettier --write src/lib/zoom-math.ts src/lib/zoom-math.test.ts
git add src/lib/zoom-math.ts src/lib/zoom-math.test.ts
git commit -m "feat(zoom): the hero zoom's arithmetic, pure and pinned

fitRect, zoomAbout, pinchUpdate, ceiling, settle, live, doubleTapTarget —
docs/DESIGN_hero-zoom.md D3. No consumer yet.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 2 — The hook learns pinch and forgets the two-finger exit

**Files:**

- Modify: `src/hooks/use-rail-gestures.ts` (whole file — the new version is below)
- Test: `src/hooks/use-rail-gestures.test.tsx`

**Interfaces — produces** (Task 5 wires these):

```ts
export interface UseRailGesturesOptions {
  onTap: (tap: { clientX: number }) => void;
  onAdvance: (dir: 1 | -1) => void;
  onExit: () => void; // down-flick only, now
  zoomable?: boolean; // a second finger may begin a pinch
  zoomed?: boolean; // one finger pans; advance and exit are suspended
  onPinchStart?: (p: { cx: number; cy: number }) => void;
  onPinch?: (p: { ratio: number; cx: number; cy: number }) => void;
  onPinchEnd?: () => void;
  onPanStart?: () => void;
  onPan?: (p: { dx: number; dy: number }) => void;
  onPanEnd?: () => void;
  onDoubleTap?: (tap: { clientX: number; clientY: number }) => void;
}
```

This task delivers pinch + the deletion; Task 3 adds pan and double-tap to the same file. The
file below is the **complete** final version for both tasks — write it all in this task, and let
Task 3's tests drive out any slip in the pan/double-tap branches.

- [ ] **Step 1: Rewrite the two-finger tests, add the pinch tests**

In `src/hooks/use-rail-gestures.test.tsx`, first extend the harness. Replace the `Track`
component and the mocks above it with:

```tsx
const onTap = vi.fn();
const onAdvance = vi.fn();
const onExit = vi.fn();
const onPinchStart = vi.fn();
const onPinch = vi.fn();
const onPinchEnd = vi.fn();
const onPanStart = vi.fn();
const onPan = vi.fn();
const onPanEnd = vi.fn();
const onDoubleTap = vi.fn();
const ALL = [
  onTap,
  onAdvance,
  onExit,
  onPinchStart,
  onPinch,
  onPinchEnd,
  onPanStart,
  onPan,
  onPanEnd,
  onDoubleTap,
];

// Rendered rather than `renderHook`ed: the behaviour lives in an effect that attaches native
// listeners to a ref'd node, so React has to attach the ref first — which is what a real consumer
// does and what `renderHook` can't reproduce.
function Track({
  zoomable = true,
  zoomed = false,
}: {
  zoomable?: boolean;
  zoomed?: boolean;
}) {
  const { ref, dragPx, dragging } = useRailGestures({
    onTap,
    onAdvance,
    onExit,
    zoomable,
    zoomed,
    onPinchStart,
    onPinch,
    onPinchEnd,
    onPanStart,
    onPan,
    onPanEnd,
    onDoubleTap,
  });
  return (
    <div
      ref={ref}
      data-testid="track"
      data-drag={dragPx}
      data-dragging={dragging}
    />
  );
}
```

In `beforeEach`, replace the three `mockClear()` lines with `for (const f of ALL) f.mockClear();`
and keep the `render(<Track />)` + `offsetWidth` lines. Add, beside `el`, a helper that
re-renders the track with options:

```tsx
  /** Re-mount with options. The listeners read them through a ref, so the same node is fine. */
  const mount = (props: React.ComponentProps<typeof Track>) => {
    cleanup();
    el = render(<Track {...props} />).getByTestId("track");
    Object.defineProperty(el, "offsetWidth", { value: TRACK_W, configurable: true });
  };
```

(import `cleanup` from `@testing-library/react`, and `import * as React from "react"`).

Then **delete** the three two-finger tests under `describe("exit")` — "survives Safari cancelling
the two-finger gesture…", "still discards a cancelled single-finger gesture…" stays (it is about
one finger; keep it), and "takes any two-finger movement, and ignores a two-finger rest" — and
add this describe block after `describe("exit")`:

```tsx
  // docs/DESIGN_hero-zoom.md D2: two fingers are a pinch now, and the two-finger exit is gone.
  describe("pinch", () => {
    it("starts on the second finger with the midpoint, reports ratio + midpoint on moves, ends on a lift", () => {
      fire("pointerdown", { x: 100, y: 400, id: 1 });
      fire("pointerdown", { x: 300, y: 400, id: 2 });
      expect(onPinchStart).toHaveBeenCalledWith({ cx: 200, cy: 400 });

      // Fingers 200 apart → 400 apart, midpoint drifts right by 50.
      fire("pointermove", { x: 50, y: 400, id: 1 });
      fire("pointermove", { x: 450, y: 400, id: 2 });
      expect(onPinch).toHaveBeenLastCalledWith({ ratio: 2, cx: 250, cy: 400 });

      fire("pointerup", { x: 450, y: 400, id: 2 });
      expect(onPinchEnd).toHaveBeenCalledTimes(1);
      // The second finger's lift is not a tap, and nothing left.
      expect(onTap).not.toHaveBeenCalled();
      expect(onExit).not.toHaveBeenCalled();
      expect(onAdvance).not.toHaveBeenCalled();
    });

    it("never moves the rail: dragPx stays 0 under two fingers", () => {
      fire("pointerdown", { x: 100, y: 400, id: 1 });
      fire("pointermove", { x: 60, y: 400, id: 1 }); // a one-finger drag has begun…
      expect(dragPx()).toBe(-40);
      fire("pointerdown", { x: 300, y: 400, id: 2 }); // …until the second finger lands
      expect(dragPx()).toBe(0);
      fire("pointermove", { x: 0, y: 400, id: 1 });
      expect(dragPx()).toBe(0);
    });

    it("does nothing at all when not zoomable (a spread): no pinch, no exit, no tap", () => {
      mount({ zoomable: false });
      fire("pointerdown", { x: 200, y: 400, id: 1 });
      fire("pointerdown", { x: 240, y: 400, id: 2 });
      fire("pointermove", { x: 200, y: 300, id: 1 });
      fire("pointerup", { x: 200, y: 300, id: 1 });
      fire("pointerup", { x: 240, y: 400, id: 2 });
      for (const f of ALL) expect(f).not.toHaveBeenCalled();
    });

    it("ignores a third finger (review focus 2)", () => {
      fire("pointerdown", { x: 100, y: 400, id: 1 });
      fire("pointerdown", { x: 300, y: 400, id: 2 });
      fire("pointerdown", { x: 200, y: 600, id: 3 });
      expect(onPinchStart).toHaveBeenCalledTimes(1);
      fire("pointermove", { x: 50, y: 400, id: 1 });
      // Still the first two fingers' geometry: 250 apart over 200.
      expect(onPinch).toHaveBeenLastCalledWith({ ratio: 1.25, cx: 175, cy: 400 });
      fire("pointerup", { x: 200, y: 600, id: 3 });
      expect(onPinchEnd).not.toHaveBeenCalled();
    });

    it("treats a cancel mid-pinch as the end of the pinch, not a discard", () => {
      fire("pointerdown", { x: 100, y: 400, id: 1 });
      fire("pointerdown", { x: 300, y: 400, id: 2 });
      fire("pointermove", { x: 50, y: 400, id: 1 });
      fire("pointercancel", { x: 50, y: 400, id: 1 });
      expect(onPinchEnd).toHaveBeenCalledTimes(1);
      expect(onExit).not.toHaveBeenCalled();
    });

    it("cancels the browser's own handling of a two-touch move, and never a one-touch one", () => {
      const two = new Event("touchmove", { cancelable: true });
      Object.defineProperty(two, "touches", { value: [{}, {}] });
      act(() => void el.dispatchEvent(two));
      expect(two.defaultPrevented).toBe(true);

      const one = new Event("touchmove", { cancelable: true });
      Object.defineProperty(one, "touches", { value: [{}] });
      act(() => void el.dispatchEvent(one));
      expect(one.defaultPrevented).toBe(false);
    });
  });
```

- [ ] **Step 2: Run the file, watch the new tests fail**

```bash
bunx vitest run src/hooks/use-rail-gestures.test.tsx
```

Expected: the pinch tests fail (`onPinchStart` never called; `onExit` called by the two-finger
path). The deleted tests are gone.

- [ ] **Step 3: Rewrite the hook**

Replace `src/hooks/use-rail-gestures.ts` with:

```ts
"use client";

import * as React from "react";

// The picture rail's whole input surface, in one place: every way a finger can talk to the hero
// strip at the top of `/i/[itemId]` (the merged item screen since 09-10-26 — until then this drove
// the full-screen gallery at `/g/`).
//
// The strip has no chrome to speak of by default — no buttons, nothing to press. What it has
// instead is a small vocabulary of gestures, and this hook is the state machine that tells them
// apart from one another and from the accidents (a resting thumb, a scroll, an iOS system swipe).
// Seven outcomes since 10-04-26 (docs/DESIGN_hero-zoom.md D2), distinguished by how many
// fingers, which axis won, which way it went, how far, how fast, and whether the picture is
// already zoomed:
//
//   - **tap** — no travel at all. Toggles the chrome — or, on a desktop spread, focuses the page
//     that was clicked, which is why the tap reports where it landed
//     (docs/DESIGN_spread-mode.md D2).
//   - **double-tap** — a second tap within {@link DOUBLE_TAP_MS} and {@link DOUBLE_TAP_PX} of the
//     first, from a touch. Zooms in or out. The first tap is *not* delayed: it fires as a tap.
//   - **advance** — a horizontal drag past 15% of the screen, or a quick short flick. The rail
//     moves one cell. Only while not zoomed.
//   - **exit** — a quick **downward** flick that began with the page scrolled to the top. Only
//     while not zoomed. (Until 10-04-26 any two-finger movement exited too; that gesture is the
//     pinch now, and the exit is the flick, Escape, or the pill.)
//   - **pinch** — a second finger, when the screen says it may (`zoomable`). Reports the fingers'
//     distance ratio and midpoint on every move until one lifts. Never moves the rail.
//   - **pan** — one finger while the picture is zoomed (`zoomed`). Reports its travel from where it
//     went down; the rail does not move and nothing else fires.
//   - **nothing** — everything else, which snaps back. That includes every upward movement: up is
//     the browser's, because the item's details are on the page below the picture.
//
// **Two things learned on the 08-21-26 device pass, both of which shape the code below.**
//
//   1. **Every commit needs a velocity path.** Distance-only thresholds punish the confident flick
//      and reward the hesitant drag, which is backwards. Each threshold here is now "far enough OR
//      fast enough".
//   2. **The axis has to be locked, not re-decided at release.** A thumb swipe arcs. Judging
//      horizontal-vs-vertical from the *final* delta means a perfectly good sideways swipe that
//      drifted down finishes as "vertical" and does nothing. The axis is now decided once, the
//      moment the gesture clears the slop, and held for the rest of it.
//
// **Why the exit is speed-only.** Until the screen merge it had a slow far-drag path too (a
// 150px shove at any speed). A slow downward drag at the top of a scrolling page is iOS overscroll,
// though, and the two would fight — so only a flick leaves. See {@link EXIT_FAST_PX}.
//
// Sibling to `use-swipe-back.ts` and built the same way: native listeners on a ref'd node, so a
// gesture in flight never re-renders the screen it's driving. This one is the bigger of the two,
// and it should read like the same author wrote it.
//
// **Never `preventDefault` on a one-finger move** (same rule as `use-swipe-back`). The track
// carries `touch-action: pan-y` instead (`none` while zoomed — `HeroRail` flips it), which tells
// the browser up front that vertical panning is its own and horizontal is ours — declared rather
// than fought for. Under `pan-y` the browser may fire `pointercancel` once it commits to a
// scroll; a single-finger cancel is therefore discarded, exactly as an interruption is.
//
// **The one exception is two touches** (D2). iOS claims a two-finger gesture for the system — a
// page zoom or a scroll — the moment it decides it is one, and cancels our pointers; a pinch
// recognised here would be thrown away as it was recognised. So a `touchmove` with two or more
// touches is cancelled (a non-passive listener, the only one in the app), and so are Safari's
// proprietary `gesturestart`/`gesturechange`, which is what its own pinch handling listens to.
// One-touch moves are never cancelled. The device pass (docs/PLAN_hero-zoom.md Task 7) decides
// whether both listeners are needed on current iOS; drop whichever proves redundant, here and in
// the design.

/** Past this much travel in either axis, a press stops being a tap. The app-wide slop is 12px; the gallery's own prototype uses 8, and the tighter value wins on a screen with no other targets. */
const SLOP_PX = 8;

/**
 * A horizontal drag commits at this fraction of the track's width — the slow, deliberate path.
 *
 * Was 0.2 through the 08-21-26 device pass, where a 20%-of-screen minimum with no velocity path at
 * all made ordinary swiping "quite hard" (Ben's words). 0.15 plus {@link FLICK_PX} is the fix: a
 * careful drag still has to travel, a confident flick doesn't.
 */
const ADVANCE_FRACTION = 0.15;

/**
 * The fast path, and the one a real thumb actually uses: this much travel inside {@link FLICK_MS}
 * commits regardless of how far across the screen it got.
 *
 * A swipe is not a measured drag. Distance-only thresholds punish exactly the gesture people
 * perform most confidently — the quick flick that covers 50px in 150ms and lets go — and reward the
 * hesitant one. Every horizontal commit in this hook offers both. (The exit is the exception, and
 * speed-only on purpose — see {@link EXIT_FAST_PX}.)
 */
const FLICK_PX = 40;
const FLICK_MS = 300;

/**
 * The exit: a quick **downward** flick, this much travel inside {@link EXIT_FAST_MS}, that began
 * with the page scrolled to the top.
 *
 * Down, not up, since the screen merge (09-10-26, docs/DESIGN_screen-structure.md decision 4).
 * The picture now sits on top of a page you scroll — the details are under it — so an upward
 * move is the browser's, and the track says so with `touch-action: pan-y`. A downward move at
 * scroll position 0 is the one vertical gesture the browser has no use for, which is exactly why
 * iOS Photos uses it to dismiss. There is deliberately no slow far-drag path any more: a slow
 * downward drag at the top is overscroll, and the two would fight.
 */
const EXIT_FAST_PX = 80;
const EXIT_FAST_MS = 320;

/**
 * A double-tap: the second tap this soon after, and this close to, the first (D2). iOS's own
 * double-tap window is ~300ms; 30px is a thumb landing twice on the same spot. The first tap is
 * delivered at once — delaying it would make the chrome toggle feel late — so a double-tap is
 * "a tap, then a double-tap", never two taps.
 */
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_PX = 30;

export interface UseRailGesturesOptions {
  /**
   * A press that never moved. `clientX` is where it was released, so a screen showing two pages
   * side by side can tell which one was pressed.
   */
  onTap: (tap: { clientX: number }) => void;
  /** A committed horizontal drag. `1` moves the rail forward (finger travelled left). */
  onAdvance: (dir: 1 | -1) => void;
  /** A quick downward flick from the top of the page. */
  onExit: () => void;

  // ── zoom (docs/DESIGN_hero-zoom.md D2) ──────────────────────────────────────────────────────
  /** Whether a second finger may begin a pinch. False in a spread and over the end card. */
  zoomable?: boolean;
  /** Whether the picture is zoomed. One finger then pans it; advance and exit are suspended. */
  zoomed?: boolean;
  /** A second finger landed. The midpoint, in client px. */
  onPinchStart?: (p: { cx: number; cy: number }) => void;
  /** Two fingers moved. `ratio` is their distance over the distance at start; `cx`/`cy` the midpoint now. */
  onPinch?: (p: { ratio: number; cx: number; cy: number }) => void;
  /** One of the two fingers lifted (or the system cancelled them). */
  onPinchEnd?: () => void;
  /** A single finger began to pan the zoomed picture. */
  onPanStart?: () => void;
  /** …and moved: travel from where it went down, in client px. */
  onPan?: (p: { dx: number; dy: number }) => void;
  /** …and lifted or was cancelled. */
  onPanEnd?: () => void;
  /** A second tap inside the double-tap window. Where it landed, in client px. */
  onDoubleTap?: (tap: { clientX: number; clientY: number }) => void;
}

export interface RailGestures {
  /** Spread onto the track element — it must also carry `touch-action: pan-y` (`none` while zoomed). */
  ref: React.RefObject<HTMLDivElement | null>;
  /** Live horizontal travel, in px, while a single-finger horizontal drag is in flight; else 0. */
  dragPx: number;
  /** Whether a drag is currently in flight — the caller uses it to drop its transition. */
  dragging: boolean;
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(b.x - a.x, b.y - a.y);

export function useRailGestures(options: UseRailGesturesOptions): RailGestures {
  const ref = React.useRef<HTMLDivElement>(null);
  const [dragPx, setDragPx] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);

  // Every option reaches the listeners through one ref, so the effect below attaches exactly
  // once. Inline arrows in a dependency array would tear the listeners down and rebuild them on
  // every parent render — and this hook's parent re-renders on every cell change, which is how a
  // gesture starts dropping events mid-swipe. Same lesson as `BottomSheet`'s `onCloseRef` and
  // `useSwipeBack`'s `commitRef`. `zoomable`/`zoomed` ride along: a gesture reads the *current*
  // mode on every event, which is what lets a pinch end and the next finger-down be a pan.
  const handlers = React.useRef(options);
  React.useEffect(() => {
    handlers.current = options;
  });

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let startX = 0;
    let startY = 0;
    let startedAt = 0;
    /** Whether the page was scrolled to the top when the press began — the exit's precondition. */
    let atTop = false;
    let moved = false;
    /**
     * Decided once, the moment the gesture clears the slop, and held. Re-deciding at release is what
     * made an arcing thumb swipe fail — see the header note.
     */
    let axis: "x" | "y" | null = null;
    /** Sticky for the whole gesture: a second finger at any point means this was never a one-finger gesture. */
    let multiTouch = false;
    /** The first finger is being followed for tap / drag / pan. */
    let tracking = false;
    /** Two fingers are down and the screen is being told about them. */
    let pinching = false;
    /** The fingers' distance when the pinch began — the ratio's denominator. */
    let pinchDist0 = 1;
    /** Whether `onPanStart` has been sent for the pan in flight. */
    let panning = false;
    /** Where and when the last tap landed, for the double-tap window. */
    let lastTap: { x: number; y: number; at: number } | null = null;
    /** Every live pointer's position, by id. The first two are the pinch's fingers. */
    const points = new Map<number, { x: number; y: number }>();

    const reset = () => {
      tracking = false;
      moved = false;
      axis = null;
      multiTouch = false;
      pinching = false;
      panning = false;
      points.clear();
      setDragPx(0);
      setDragging(false);
    };

    /** The pinch's two fingers: the first two pointers down, in landing order (a Map keeps it). */
    const pair = () => {
      const [a, b] = points.values();
      return a && b ? ([a, b] as const) : null;
    };

    const down = (e: PointerEvent) => {
      points.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const h = handlers.current;

      if (points.size === 2) {
        // A second finger. The gesture is a two-finger one from here on, whatever happens — a
        // one-finger drag in flight is over, the rail snaps back, and if the screen allows it the
        // two fingers are a pinch.
        multiTouch = true;
        tracking = false;
        if (panning) {
          panning = false;
          h.onPanEnd?.();
        }
        setDragPx(0);
        setDragging(false);
        if (!h.zoomable) return;
        const p = pair();
        if (!p) return;
        pinching = true;
        pinchDist0 = dist(p[0], p[1]) || 1;
        h.onPinchStart?.({ cx: (p[0].x + p[1].x) / 2, cy: (p[0].y + p[1].y) / 2 });
        return;
      }
      if (points.size > 2) return; // A third finger is nobody's.

      startX = e.clientX;
      startY = e.clientY;
      startedAt = e.timeStamp;
      atTop = window.scrollY <= 0;
      moved = false;
      axis = null;
      multiTouch = false;
      panning = false;
      tracking = true;
      setDragging(true);
    };

    const move = (e: PointerEvent) => {
      const pt = points.get(e.pointerId);
      if (pt) {
        pt.x = e.clientX;
        pt.y = e.clientY;
      }
      const h = handlers.current;

      if (pinching) {
        const p = pair();
        if (!p) return;
        h.onPinch?.({
          ratio: dist(p[0], p[1]) / pinchDist0,
          cx: (p[0].x + p[1].x) / 2,
          cy: (p[0].y + p[1].y) / 2,
        });
        return;
      }

      if (!tracking) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (!moved && (Math.abs(dx) > SLOP_PX || Math.abs(dy) > SLOP_PX)) {
        moved = true;
        // The one and only axis decision. Ties go to horizontal: the rail is the gesture this
        // screen is mostly for, and a dead-diagonal swipe is far more often someone flicking
        // sideways with a lazy wrist than someone aiming straight up.
        axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
      }

      // Zoomed: the finger drives the picture, not the rail. Both axes, no lock, no dragPx.
      if (h.zoomed) {
        if (!moved || multiTouch) return;
        if (!panning) {
          panning = true;
          h.onPanStart?.();
        }
        h.onPan?.({ dx, dy });
        return;
      }

      // Only a single-finger drag locked to the horizontal moves the rail. A vertical drag is either
      // the browser's scroll or an exit flick, and letting it leak into `dragPx` would slide the
      // picture sideways while the page moves under the reader's thumb.
      setDragPx(axis === "x" && !multiTouch ? dx : 0);
    };

    /**
     * The pinch is over because a finger lifted or the system took it. If one finger is still
     * down and the picture is zoomed, that finger pans from where it is now — `moved` is set so
     * its eventual lift is never mistaken for a tap.
     */
    const endPinch = () => {
      pinching = false;
      handlers.current.onPinchEnd?.();
      const [rest] = points.values();
      if (points.size === 1 && rest) {
        startX = rest.x;
        startY = rest.y;
        moved = true;
        axis = null;
        tracking = true;
        if (handlers.current.zoomed) {
          // A pan, from here. It is a one-finger gesture now, so the two-finger flag goes:
          // it is what would otherwise stop `move` from reporting the pan.
          multiTouch = false;
          panning = true;
          handlers.current.onPanStart?.();
        }
        // Not zoomed: the finger is followed so its lift is swallowed (neither a tap nor an
        // advance — `multiTouch` stays set for that), but it pans nothing.
      } else if (points.size === 0) {
        reset();
      }
    };

    const up = (e: PointerEvent) => {
      points.delete(e.pointerId);
      const h = handlers.current;

      if (pinching) {
        // A third finger lifting leaves the pinch intact (review focus 2).
        if (points.size >= 2) return;
        endPinch();
        return;
      }

      if (!tracking) {
        // A finger that was never followed (a third one, or the second of a non-zoomable pair).
        if (points.size === 0) reset();
        return;
      }

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const elapsed = e.timeStamp - startedAt;
      // Read the verdict flags *before* resetting — `reset()` clears them, and the whole
      // classification below depends on them.
      const wasMultiTouch = multiTouch;
      const hadMoved = moved;
      const lockedAxis = axis;
      const wasPanning = panning;

      reset();

      // The finger left after a pinch, or the first of a non-zoomable pair: nothing more to say.
      if (wasMultiTouch && !wasPanning) return;

      if (!hadMoved) {
        // A tap — or the second half of a double-tap, from a touch. The first tap was delivered
        // as a tap already; the second is only ever a double-tap. A mouse never double-taps:
        // the desktop's click-to-toggle is unchanged (review focus 5).
        const now = e.timeStamp;
        if (
          e.pointerType !== "mouse" &&
          lastTap &&
          now - lastTap.at < DOUBLE_TAP_MS &&
          Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < DOUBLE_TAP_PX
        ) {
          lastTap = null;
          h.onDoubleTap?.({ clientX: e.clientX, clientY: e.clientY });
          return;
        }
        lastTap = { x: e.clientX, y: e.clientY, at: now };
        h.onTap({ clientX: e.clientX });
        return;
      }

      // A pan ends where the finger lifts; the screen settles it. Nothing else fires while zoomed.
      if (wasPanning) {
        h.onPanEnd?.();
        return;
      }
      if (h.zoomed) return;

      if (lockedAxis === "y") {
        // Only a downward flick, only from the top of the page, only fast. See EXIT_FAST_PX.
        const fast = dy > EXIT_FAST_PX && elapsed < EXIT_FAST_MS;
        if (dy > 0 && atTop && fast) h.onExit();
        return;
      }

      if (lockedAxis === "x") {
        // Far enough OR fast enough. The distance is measured against the track's own width rather
        // than assumed — it's full-bleed, so that's the only honest scale for "far".
        const far = Math.abs(dx) > el.offsetWidth * ADVANCE_FRACTION;
        const fast = Math.abs(dx) > FLICK_PX && elapsed < FLICK_MS;
        if (far || fast) h.onAdvance(dx < 0 ? 1 : -1);
      }
      // Everything else falls through to the snap-back the caller animates when `dragPx` returns
      // to 0 — which `reset()` above has already done.
    };

    /**
     * A cancel mid-pinch ends the pinch (the screen's settle makes any interruption safe); a
     * cancel mid-pan ends the pan the same way. A single-finger cancel otherwise is still a
     * discard: a genuine interruption (a call arriving, the app backgrounding) or, under `pan-y`,
     * the browser taking a scroll.
     */
    const cancel = (e: PointerEvent) => {
      points.delete(e.pointerId);
      if (pinching) {
        if (points.size >= 2) return; // a third finger's cancel is nobody's
        pinching = false;
        handlers.current.onPinchEnd?.();
      } else if (panning) {
        handlers.current.onPanEnd?.();
      }
      reset();
    };

    // The two-touch exception to "never preventDefault on move" — see the header.
    const touchMove = (e: TouchEvent) => {
      if (e.touches.length >= 2 && handlers.current.zoomable) e.preventDefault();
    };
    const gesture = (e: Event) => {
      if (handlers.current.zoomable) e.preventDefault();
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", cancel);
    el.addEventListener("touchmove", touchMove, { passive: false });
    el.addEventListener("gesturestart", gesture);
    el.addEventListener("gesturechange", gesture);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancel);
      el.removeEventListener("touchmove", touchMove);
      el.removeEventListener("gesturestart", gesture);
      el.removeEventListener("gesturechange", gesture);
    };
  }, []);

  return { ref, dragPx, dragging };
}
```

- [ ] **Step 4: Run the hook's tests**

```bash
bunx vitest run src/hooks/use-rail-gestures.test.tsx
```

Expected: everything green **except** possibly existing tap tests that tap twice with the
default `at: 0` — two taps at the same timestamp and place are now a tap + a double-tap. Fix
those tests by giving the second tap `at: 1000` (it is a separate gesture; the test's intent is
unchanged). Do not widen `DOUBLE_TAP_MS`.

- [ ] **Step 5: Run the whole suite, then commit**

```bash
bun run check
git add src/hooks/use-rail-gestures.ts src/hooks/use-rail-gestures.test.tsx
git commit -m "feat(zoom): the rail hook learns pinch, pan and double-tap; the two-finger exit is gone

docs/DESIGN_hero-zoom.md D2. Two fingers are a pinch when the screen says
zoomable; one finger pans while zoomed; a second tap inside 300 ms / 30 px
is a double-tap (touch only). The one preventDefault exception: two-touch
touchmove and Safari's gesture events, so iOS cannot claim the pinch.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

`item-screen.test.tsx` may fail here if any of its tests relied on a two-finger exit — none
should; if one does, that test asserts behaviour the design removed and is rewritten in Task 5.

---

## Task 3 — Pan and double-tap, pinned

**Files:**

- Test: `src/hooks/use-rail-gestures.test.tsx` (the code is already in Task 2's file)

- [ ] **Step 1: Add the tests**

After `describe("pinch")`:

```tsx
  // D2: while zoomed, one finger drives the picture and the rail's own gestures stand down.
  describe("pan (zoomed)", () => {
    beforeEach(() => mount({ zoomed: true }));

    it("starts past the slop, reports travel from the press, and ends on the lift", () => {
      fire("pointerdown", { x: 200, y: 400 });
      fire("pointermove", { x: 204, y: 404 }); // inside the slop: nothing yet
      expect(onPanStart).not.toHaveBeenCalled();
      fire("pointermove", { x: 230, y: 380 });
      expect(onPanStart).toHaveBeenCalledTimes(1);
      expect(onPan).toHaveBeenLastCalledWith({ dx: 30, dy: -20 });
      fire("pointerup", { x: 230, y: 380 });
      expect(onPanEnd).toHaveBeenCalledTimes(1);
    });

    it("never advances, never exits, never moves the rail", () => {
      // A drag that would have been a committed advance…
      fire("pointerdown", { x: 300, y: 400, at: 0 });
      fire("pointermove", { x: 100, y: 400, at: 100 });
      expect(dragPx()).toBe(0);
      fire("pointerup", { x: 100, y: 400, at: 100 });
      expect(onAdvance).not.toHaveBeenCalled();
      // …and a flick that would have been the exit.
      fire("pointerdown", { x: 200, y: 100, at: 1000 });
      fire("pointermove", { x: 200, y: 300, at: 1100 });
      fire("pointerup", { x: 200, y: 300, at: 1100 });
      expect(onExit).not.toHaveBeenCalled();
      expect(onPanEnd).toHaveBeenCalledTimes(2);
    });

    it("still taps: a press that never moved toggles the chrome, zoomed or not", () => {
      fire("pointerdown", { x: 200, y: 400 });
      fire("pointerup", { x: 200, y: 400 });
      expect(onTap).toHaveBeenCalledTimes(1);
      expect(onPanStart).not.toHaveBeenCalled();
    });

    it("the finger left down after a pinch pans from where it is, and its lift is not a tap", () => {
      fire("pointerdown", { x: 100, y: 400, id: 1 });
      fire("pointerdown", { x: 300, y: 400, id: 2 });
      fire("pointerup", { x: 300, y: 400, id: 2 });
      expect(onPinchEnd).toHaveBeenCalledTimes(1);
      expect(onPanStart).toHaveBeenCalledTimes(1);
      fire("pointermove", { x: 120, y: 410, id: 1 });
      expect(onPan).toHaveBeenLastCalledWith({ dx: 20, dy: 10 });
      fire("pointerup", { x: 120, y: 410, id: 1 });
      expect(onPanEnd).toHaveBeenCalledTimes(1);
      expect(onTap).not.toHaveBeenCalled();
    });

    it("ends the pan on a cancel", () => {
      fire("pointerdown", { x: 200, y: 400 });
      fire("pointermove", { x: 240, y: 400 });
      fire("pointercancel", { x: 240, y: 400 });
      expect(onPanEnd).toHaveBeenCalledTimes(1);
    });
  });

  describe("the finger left after a pinch, when the picture is NOT zoomed (review focus 3)", () => {
    it("is followed but pans nothing, and its lift is neither a tap nor an advance", () => {
      fire("pointerdown", { x: 100, y: 400, id: 1 });
      fire("pointerdown", { x: 300, y: 400, id: 2 });
      fire("pointerup", { x: 300, y: 400, id: 2 });
      fire("pointermove", { x: 0, y: 400, id: 1 });
      fire("pointerup", { x: 0, y: 400, id: 1 });
      expect(onPanStart).not.toHaveBeenCalled();
      expect(onTap).not.toHaveBeenCalled();
      expect(onAdvance).not.toHaveBeenCalled();
      expect(dragPx()).toBe(0);
    });
  });

  describe("double-tap", () => {
    it("is a tap, then a double-tap — the first is never delayed", () => {
      fire("pointerdown", { x: 200, y: 400, at: 0 });
      fire("pointerup", { x: 200, y: 400, at: 50 });
      expect(onTap).toHaveBeenCalledTimes(1);
      fire("pointerdown", { x: 210, y: 405, at: 200 });
      fire("pointerup", { x: 210, y: 405, at: 250 });
      expect(onTap).toHaveBeenCalledTimes(1);
      expect(onDoubleTap).toHaveBeenCalledWith({ clientX: 210, clientY: 405 });
    });

    it("is two taps when the second is too late or too far", () => {
      fire("pointerdown", { x: 200, y: 400, at: 0 });
      fire("pointerup", { x: 200, y: 400, at: 50 });
      fire("pointerdown", { x: 200, y: 400, at: 400 });
      fire("pointerup", { x: 200, y: 400, at: 450 });
      expect(onTap).toHaveBeenCalledTimes(2);
      fire("pointerdown", { x: 300, y: 400, at: 500 });
      fire("pointerup", { x: 300, y: 400, at: 550 });
      expect(onTap).toHaveBeenCalledTimes(3);
      expect(onDoubleTap).not.toHaveBeenCalled();
    });

    it("a third quick tap starts over: tap, double-tap, tap", () => {
      for (const at of [0, 100, 200]) {
        fire("pointerdown", { x: 200, y: 400, at });
        fire("pointerup", { x: 200, y: 400, at: at + 20 });
      }
      expect(onTap).toHaveBeenCalledTimes(2);
      expect(onDoubleTap).toHaveBeenCalledTimes(1);
    });

    it("never from a mouse: two quick clicks are two taps (review focus 5)", () => {
      const click = (at: number) => {
        for (const type of ["pointerdown", "pointerup"]) {
          const e = pointer(type, { x: 200, y: 400, at });
          Object.defineProperty(e, "pointerType", { value: "mouse" });
          act(() => void el.dispatchEvent(e));
        }
      };
      click(0);
      click(100);
      expect(onTap).toHaveBeenCalledTimes(2);
      expect(onDoubleTap).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Run them**

```bash
bunx vitest run src/hooks/use-rail-gestures.test.tsx
```

Expected: green against Task 2's code. If "the finger left down after a pinch pans" fails on
`onPanStart` count: `endPinch` must call `onPanStart` itself when `zoomed`, and `move` must not
call it again (the `panning` flag).

- [ ] **Step 3: Commit**

```bash
bunx prettier --write src/hooks/use-rail-gestures.test.tsx
bun run check
git add src/hooks/use-rail-gestures.test.tsx
git commit -m "test(zoom): pin pan and double-tap in the rail hook

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 4 — `HeroRail` draws the zoom

**Files:**

- Modify: `src/components/item/hero-rail.tsx` — `HeroRailProps`, the track's `touchAction`,
  `Page`, `RailImage`
- Test: `src/components/item/hero-rail.test.tsx`

**Interfaces — produces** (Task 5 passes it):

```ts
/** The current page's zoom (D1/D4). `snapping` plays the settle; a live pinch or pan has none. */
zoom?: { scale: number; x: number; y: number; snapping: boolean } | null;
```

- [ ] **Step 1: Write the failing tests**

Add to `hero-rail.test.tsx`'s `Harness` a `zoom` prop passed straight through:

```tsx
  zoom,
}: {
  …
  zoom?: React.ComponentProps<typeof HeroRail>["zoom"];
}) {
  …
      zoom={zoom}
```

Then add this describe:

```tsx
describe("zoom (docs/DESIGN_hero-zoom.md D4)", () => {
  const cells = [cell("a"), cell("b"), cell("c")] as const;

  it("puts the transform on the current cell's image only, with a top-left origin", () => {
    render(
      <Harness
        cells={cells}
        zoom={{ scale: 2, x: -100, y: -50, snapping: false }}
      />,
    );
    const b = screen.getByAltText("Plate b");
    expect(b.style.transform).toBe("translate(-100px, -50px) scale(2)");
    expect(b.style.transformOrigin).toBe("0 0");
    expect(b.style.transition).toBe("none");
    expect(screen.getByAltText("Plate a").style.transform).toBe("");
    expect(screen.getByAltText("Plate c").style.transform).toBe("");
  });

  it("transitions only while snapping", () => {
    render(
      <Harness cells={cells} zoom={{ scale: 2, x: 0, y: 0, snapping: true }} />,
    );
    expect(screen.getByAltText("Plate b").style.transition).toMatch(
      /transform 250ms/,
    );
  });

  it("hands the track to the picture while zoomed: touch-action none, pan-y otherwise", () => {
    const { rerender } = render(<Harness cells={cells} zoom={null} />);
    expect(screen.getByTestId("gallery-track").style.touchAction).toBe("pan-y");
    rerender(
      <Harness cells={cells} zoom={{ scale: 2, x: 0, y: 0, snapping: false }} />,
    );
    expect(screen.getByTestId("gallery-track").style.touchAction).toBe("none");
  });

  it("wraps the current page's picture in a measurable box", () => {
    render(<Harness cells={cells} />);
    const box = screen.getByTestId("hero-rail").querySelector("[data-page-box]");
    expect(box).not.toBeNull();
    expect(box!.querySelector("img")).toBe(screen.getByAltText("Plate b"));
    // One box: the neighbours are not measured.
    expect(
      screen.getByTestId("hero-rail").querySelectorAll("[data-page-box]"),
    ).toHaveLength(1);
  });
});
```

Note `rerender` — the harness is a plain function component, so re-rendering with new props is
what a real parent does.

- [ ] **Step 2: Run, watch fail**

```bash
bunx vitest run src/components/item/hero-rail.test.tsx
```

Expected: the four new tests fail (no `zoom` prop, no `data-page-box`).

- [ ] **Step 3: Implement**

In `hero-rail.tsx`:

1. Import the snap duration: `import { SNAP_MS } from "~/lib/zoom-math";`.

2. Add to `HeroRailProps`, after `onMotionEnd`:

```ts
  /**
   * The current page's zoom (docs/DESIGN_hero-zoom.md D1, D4): a transform on the picture under
   * the reader, and the track's `touch-action` flipped to `none` so a one-finger drag reaches the
   * picture rather than scrolling the page. `snapping` plays the 250ms settle; a live pinch or
   * pan has no transition at all. Single mode only — a spread never zooms.
   */
  zoom?: { scale: number; x: number; y: number; snapping: boolean } | null;
```

and destructure `zoom = null` in the component.

3. The track's style: replace `touchAction: "pan-y",` with

```ts
            // `pan-y` declares that vertical panning belongs to the browser and horizontal to the
            // gesture hook — see `use-rail-gestures.ts` for why it never calls `preventDefault`
            // on one finger. While zoomed it is `none`: the picture takes every axis (D2). The
            // browser reads it at touchstart, so the flip lands between gestures — exactly right.
            touchAction: zoom ? "none" : "pan-y",
```

4. Where the current cell's pages are rendered (`<Page key={pageKey(page)} …`), pass the zoom to
the current cell's page in single mode — `undefined` for every other page, which is how `Page`
knows not to mark its box:

```tsx
                      priority={i === 1}
                      // Only the page under the reader zooms, and only in single mode (D1).
                      // `undefined` = not that page; `null` = that page, not zoomed.
                      zoom={i === 1 && pages === 1 ? zoom : undefined}
```

5. `Page` gains `zoom?: HeroRailProps["zoom"]` and wraps the image in the measurable box:

```tsx
      {page === "end" ? (
        <div className="w-full max-w-[360px]">{endCell}</div>
      ) : (
        // The box the screen measures at each gesture start (D3): the transform sits on the
        // `<img>` inside, so this rect is the untransformed inset box however far the picture
        // is already zoomed. Only the current page in single mode carries the attribute.
        <div
          className="h-full w-full"
          data-page-box={zoom !== undefined ? "" : undefined}
        >
          <RailImage item={page} priority={priority} side={side} zoom={zoom ?? null} />
        </div>
      )}
```

   `Page`'s `zoom` prop is `undefined` for pages that are not the current single page (the
   neighbours, and every page of a spread) and `null | ZoomState` for the one that is.

6. `RailImage` gains `zoom?: HeroRailProps["zoom"]` and a `style`:

```tsx
      style={
        zoom
          ? {
              transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`,
              transformOrigin: "0 0",
              willChange: "transform",
              // A CSS transition, not WAAPI, on purpose: `globals.css`'s reduced-motion rule
              // collapses it, and zoom gets no exemption — only the magazine turn has one (D4).
              transition: zoom.snapping ? `transform ${SNAP_MS}ms ease` : "none",
            }
          : undefined
      }
```

- [ ] **Step 4: Run the rail's tests and the screen's**

```bash
bunx vitest run src/components/item/
```

Expected: green. The existing "renders the three cells … and a pan-y track" test still passes
(no zoom → `pan-y`).

- [ ] **Step 5: Commit**

```bash
bunx prettier --write src/components/item/hero-rail.tsx src/components/item/hero-rail.test.tsx
bun run check
git add src/components/item/hero-rail.tsx src/components/item/hero-rail.test.tsx
git commit -m "feat(zoom): HeroRail draws the current page's zoom and flips touch-action

docs/DESIGN_hero-zoom.md D4: transform on the current image only, a 250 ms
CSS transition while snapping, touch-action none while zoomed, and a
data-page-box the screen measures.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 5 — `ItemScreen` holds the zoom

**Files:**

- Modify: `src/components/item/item-screen.tsx` — imports, state after `focusSide`, the
  `prevSpread` block, `advance`, the `useRailGestures` call, the `<HeroRail` props
- Test: `src/components/item/item-screen.test.tsx`

**Interfaces — consumes:** Task 1's module, Task 2's options, Task 4's prop.

- [ ] **Step 1: Write the failing tests**

In `item-screen.test.tsx`, the hook needs a decoded, sized picture. Add near the top, after the
mocks:

```tsx
// jsdom draws nothing: the box is 0×0 and no image ever decodes. The zoom measures both at each
// gesture start (docs/DESIGN_hero-zoom.md D3), so give it a 400×800 box and a 1600×1600 picture.
function sizeThePicture() {
  const rect = vi
    .spyOn(Element.prototype, "getBoundingClientRect")
    .mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 400,
      bottom: 800,
      width: 400,
      height: 800,
      toJSON: () => ({}),
    });
  const w = vi
    .spyOn(HTMLImageElement.prototype, "naturalWidth", "get")
    .mockReturnValue(1600);
  const h = vi
    .spyOn(HTMLImageElement.prototype, "naturalHeight", "get")
    .mockReturnValue(1600);
  return () => {
    rect.mockRestore();
    w.mockRestore();
    h.mockRestore();
  };
}

const currentImg = () =>
  screen.getByTestId("hero-rail").querySelector("[data-page-box] img") as HTMLImageElement;
```

**First, the file's own helpers have to learn time.** Today `pointer()` stamps every event
`timeStamp: 0`, so two `tap()`s in a row are now a tap and a double-tap (within 300 ms, same
spot) — and nine existing tests tap twice. Replace `pointer`, `send` and `tap` (lines ~124-142)
with:

```tsx
/** jsdom has no PointerEvent; a MouseEvent with the right type name is what the hook reads. */
function pointer(
  type: string,
  x: number,
  y: number,
  opts: { id?: number; at?: number; pointerType?: "touch" | "mouse" } = {},
) {
  const e = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
  Object.defineProperty(e, "pointerId", { value: opts.id ?? 1, configurable: true });
  Object.defineProperty(e, "pointerType", {
    value: opts.pointerType ?? "touch",
    configurable: true,
  });
  Object.defineProperty(e, "timeStamp", { value: opts.at ?? 0, configurable: true });
  return e;
}
const send = (type: string, x: number, y: number, at?: number) =>
  act(() => void track().dispatchEvent(pointer(type, x, y, { at })));
/**
 * Every tap is its own gesture: a second tap inside the hook's 300 ms / 30 px double-tap window
 * would be a double-tap (docs/DESIGN_hero-zoom.md D2), so consecutive taps are a second apart.
 */
let clock = 0;
const tap = () => {
  clock += 1000;
  send("pointerdown", 100, 100, clock);
  send("pointerup", 100, 100, clock + 20);
};
```

and reset `clock = 0` in `beforeEach`. Then the zoom helpers, after `heading`:

```tsx
/** Two quick taps at one spot — the hook's double-tap (touch). */
function doubleTap(x = 200, y = 400) {
  clock += 1000;
  for (const at of [clock, clock + 120]) {
    send("pointerdown", x, y, at);
    send("pointerup", x, y, at + 20);
  }
}
/** One finger of two. */
const two = (type: string, id: number, x: number, y: number) =>
  act(() => void track().dispatchEvent(pointer(type, x, y, { id })));
```

The three `pointerType`-aware call sites in the file (the desktop mouse tests) change from
`pointer(type, x, y, "mouse")` to `pointer(type, x, y, { pointerType: "mouse" })`.

Add the describe:

```tsx
describe("zoom (docs/DESIGN_hero-zoom.md)", () => {
  let restore: () => void;
  beforeEach(() => {
    restore = sizeThePicture();
  });
  afterEach(() => restore());

  it("double-tap zooms the current picture in about the point and hides the chrome; again zooms out", () => {
    renderScreen();
    tap(); // chrome on
    expect(screen.getByTestId("gallery-chrome")).toHaveAttribute("aria-hidden", "false");

    doubleTap(200, 400);
    // 1600² in a 400×800 box fits 400×400 at y 200; ×2.5 about (200, 400):
    // x = 200 − 200·2.5 = −300; y = 400 − 400·2.5 = −600, then clamped into cover bounds
    // (vertical: 1000 tall, y + 200·2.5 ∈ [800 − 1000, 0] → y ∈ [−700, −500]) → −600 stays.
    expect(currentImg().style.transform).toBe("translate(-300px, -600px) scale(2.5)");
    expect(track().style.touchAction).toBe("none");
    expect(screen.getByTestId("gallery-chrome")).toHaveAttribute("aria-hidden", "true");

    doubleTap(200, 400);
    expect(currentImg().style.transform).toBe("");
    expect(track().style.touchAction).toBe("pan-y");
  });

  it("a pinch follows the fingers live and settles on release", () => {
    renderScreen();
    two("pointerdown", 1, 150, 400);
    two("pointerdown", 2, 250, 400); // 100 apart, midpoint (200, 400)
    two("pointermove", 1, 100, 400);
    two("pointermove", 2, 300, 400); // 200 apart: ×2
    expect(currentImg().style.transform).toBe("translate(-200px, -400px) scale(2)");
    expect(currentImg().style.transition).toBe("none");
    two("pointerup", 2, 300, 400);
    // ×2 is inside the ceiling (2.5 floor); the offsets were inside the cover bounds. Settled.
    expect(currentImg().style.transform).toBe("translate(-200px, -400px) scale(2)");
    expect(currentImg().style.transition).toMatch(/transform 250ms/);
  });

  it("a pinch released under 1 snaps back to the hero", () => {
    renderScreen();
    two("pointerdown", 1, 100, 400);
    two("pointerdown", 2, 300, 400);
    two("pointermove", 1, 150, 400);
    two("pointermove", 2, 250, 400); // ×0.5 live → LIVE_MIN
    expect(currentImg().style.transform).toMatch(/scale\(0\.6\)/);
    two("pointerup", 1, 150, 400);
    expect(currentImg().style.transform).toBe("");
  });

  it("advancing with the keyboard resets the zoom", () => {
    renderScreen();
    doubleTap();
    expect(currentImg().style.transform).not.toBe("");
    key("ArrowRight");
    expect(currentImg().style.transform).toBe("");
  });

  it("does nothing on a picture that has not decoded (review focus 1)", () => {
    restore();
    restore = (() => {
      const rect = vi
        .spyOn(Element.prototype, "getBoundingClientRect")
        .mockReturnValue({
          x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 800,
          width: 400, height: 800, toJSON: () => ({}),
        });
      return () => rect.mockRestore();
    })();
    renderScreen();
    doubleTap();
    expect(currentImg().style.transform).toBe("");
    expect(track().style.touchAction).toBe("pan-y");
  });
});
```

(`key` is the file's existing keyboard helper; import `afterEach` from vitest.) The first test's
"chrome on" assertion relies on `tap()` toggling from hidden, which `useChromeCycle` starts as.
Note the double-tap's *first* tap lands 300 px from the `tap()` before it, so it is a plain tap
that toggles the chrome off — and the double-tap then hides it regardless (D1). The assertion is
on the end state, which is the same either way.

- [ ] **Step 2: Run, watch fail**

```bash
bunx vitest run src/components/item/item-screen.test.tsx
```

Expected: the five zoom tests fail (no transform ever appears).

- [ ] **Step 3: Implement**

In `item-screen.tsx`:

1. Imports:

```ts
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
```

2. State, right after `const [focusSide, setFocusSide] = …`:

```ts
  // ── zoom (docs/DESIGN_hero-zoom.md D1) ────────────────────────────────────────────────────────
  // The current picture's transform, or null for the hero as it was. One piece of state; every
  // index change clears it (advance below, and the spread turning on). `snapping` is whether the
  // next transform plays the 250ms settle (a release, a double-tap) or lands at once (a live
  // pinch or pan).
  const [zoom, setZoom] = React.useState<Zoom>(null);
  const [snapping, setSnapping] = React.useState(false);
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
```

3. In the `if (spread !== prevSpread)` block, add `setZoom(null);` (D5 — a spread never zooms).

4. In `advance`, after `chrome.reset();`:

```ts
      // A new picture is the hero as it was (D1). The hook already refuses to advance while
      // zoomed; this covers ←/→ and the explore cap.
      setZoom(null);
      setSnapping(false);
```

5. The `useRailGestures` call gains:

```ts
    // ── zoom (docs/DESIGN_hero-zoom.md D2) ──────────────────────────────────────────────────────
    zoomable: !spread && !atEnd,
    zoomed: zoom !== null,
    onPinchStart: ({ cx, cy }) => {
      const m = measure();
      if (!m) return;
      gesture.current = {
        ...m,
        start: zoom ?? IDENTITY,
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
      setZoom(live(next, g.fit, g.box, g.ceil));
    },
    onPinchEnd: () => {
      const g = gesture.current;
      if (!g) return;
      setSnapping(true);
      setZoom((z) => (z ? settle(z, g.fit, g.box, g.ceil) : null));
    },
    onPanStart: () => {
      // The finger left down after a pinch that settled back to 1 arrives here with `zoom`
      // null: nothing to pan (D2).
      const m = measure();
      if (!m || !zoom) return;
      gesture.current = { ...m, start: zoom, startMid: { x: 0, y: 0 } };
      setSnapping(false);
    },
    onPan: ({ dx, dy }) => {
      const g = gesture.current;
      if (!g || !zoom) return;
      setZoom(
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
      setSnapping(true);
      setZoom((z) => (z ? settle(z, g.fit, g.box, g.ceil) : null));
    },
    onDoubleTap: ({ clientX, clientY }) => {
      const m = measure();
      if (!m) return;
      setSnapping(true);
      chrome.reset();
      setZoom((z) =>
        doubleTapTarget(
          z,
          { x: clientX - m.left, y: clientY - m.top },
          m.fit,
          m.box,
          m.ceil,
        ),
      );
    },
```

   One subtlety for the reader of the code — put it in a comment above `onPanStart`: the pan
   callbacks close over `zoom` from the render that attached them. The hook reads its options
   through a ref it refreshes on every render, so by the time `onPanStart` fires after a settle,
   the screen has re-rendered with the settled zoom and the closure is current.

6. The `<HeroRail` gets `zoom={zoom ? { ...zoom, snapping } : null}`.

- [ ] **Step 4: Run the screen's tests**

```bash
bunx vitest run src/components/item/item-screen.test.tsx
```

Expected: green. If the first test's expected `-600` differs: check `settle`'s vertical bound —
fit is `{x: 0, y: 200, w: 400, h: 400}`, so at ×2.5 the picture is 1000 tall and
`y + 200·2.5 ∈ [800 − 1000, 0]`, i.e. `y ∈ [−700, −500]`; `−600` is inside.

- [ ] **Step 5: Full check and commit**

```bash
bunx prettier --write src/components/item/item-screen.tsx src/components/item/item-screen.test.tsx
bun run check
git add src/components/item/item-screen.tsx src/components/item/item-screen.test.tsx
git commit -m "feat(zoom): the item screen holds the zoom — pinch, pan, double-tap, reset on advance

docs/DESIGN_hero-zoom.md D1, D3, D5. Measures the page box once per gesture;
zoom hides the chrome; any index change or the spread turning on clears it.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 6 — Playwright: nothing broke, and (stretch) one Chromium pinch

**Files:**

- Run: the whole e2e suite against a production build
- Optional create: one test in `e2e/item.spec.ts`

- [ ] **Step 1: Make sure port 3000 is free, then run the suite in production shape**

```bash
lsof -ti:3000 | xargs -r kill
bun run e2e:prod
```

Expected: the same count green as `main` (61 at the time of writing). `item.spec.ts` drives the
rail with ←/→ and Escape and taps with `tapInPlace`, none of which this change touches. A tap test
that taps twice quickly at one spot would now be a double-tap — if one fails that way, space its
taps with `await page.waitForTimeout(400)`, which is the honest fix (two taps are two gestures).

- [ ] **Step 2 (stretch, Chromium only): a CDP pinch smoke**

Playwright's touchscreen has no pinch, but Chromium's DevTools protocol does. Add to
`e2e/item.spec.ts`, inside the existing describe for the phone project, guarded to Chromium:

```ts
  test("a pinch zooms the picture and a second finger-lift settles it", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "CDP pinch is Chromium only");
    // `imageId` is the serial describe's seeded picture — the same one the test at ~line 220 opens.
    await page.goto(`/i/${imageId}`);
    const img = page.locator("[data-page-box] img");
    await expect(img).toBeVisible();
    const box = (await img.boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.synthesizePinchGesture", {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
      scaleFactor: 2,
      relativeSpeed: 800,
      gestureSourceType: "touch",
    });
    await expect
      .poll(async () => img.evaluate((el) => (el as HTMLElement).style.transform))
      .toMatch(/scale\(/);
    await expect(page.getByTestId("gallery-track")).toHaveCSS("touch-action", "none");
  });
```

If it flakes in two runs, **delete it** rather than retry-wrapping it: SPEC §12 already records
gestures as hook-tested and device-judged, and this smoke is a bonus, not a gate.

- [ ] **Step 3: Commit (if the stretch test is kept)**

```bash
git add e2e/item.spec.ts
git commit -m "test(e2e): a Chromium CDP pinch zooms the hero

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 7 — Docs, log, device pass

**Files:**

- Modify: `docs/DESIGN_screen-structure.md` (the "Gestures" paragraph), `SPEC.md` §12 (the
  gestures sentence at ~line 709), `CLAUDE.md` (one Architecture bullet), `log.md`
- Device pass: on the tailnet origin

- [ ] **Step 1: `DESIGN_screen-structure.md`**

In the **Gestures** paragraph, replace "Two-finger movement still exits." with:

> Two-finger movement is a **pinch** since 10-04-26 (`docs/DESIGN_hero-zoom.md`); the two-finger
> exit is gone, and the exit is the down-flick, Escape or the pill.

- [ ] **Step 2: `SPEC.md` §12**

In the sentence beginning "The one item on the original list that is **not** covered here is the
swipe gestures", change the list to "the rail swipe, the down-flick exit, pinch / pan /
double-tap zoom (`docs/DESIGN_hero-zoom.md`), drag-to-close" and drop "two-finger exit".

- [ ] **Step 3: `CLAUDE.md`**

Add an Architecture bullet after the spread-mode one:

> - **The hero zooms on a phone — 10-04-26** (design `docs/DESIGN_hero-zoom.md`, plan
>   `docs/PLAN_hero-zoom.md`; branch `feat/hero-zoom`). Pinch to zoom, one finger to pan while
>   zoomed, double-tap in and out; **the two-finger exit is gone** (down-flick, Escape, pill
>   remain). All the arithmetic is `lib/zoom-math.ts`, pure; the hook grew pinch/pan/double-tap
>   and one scoped `preventDefault` (two-touch `touchmove` + Safari's `gesture*` events); `HeroRail`
>   flips the track to `touch-action: none` while zoomed. The ceiling is honest about the 1600 px
>   masters (floor 2.5, cap 4). Desktop and the spread do not zoom in this cut. Device-judged,
>   not Playwright-judged, like every rail gesture.

- [ ] **Step 4: `log.md`**

Extend today's entry (or add one under `## 2026-10` if the day has none) with a `**Shipped:**`
line for the zoom, a `**Decisions:**` line for the three (two-finger exit dropped; phone first;
no library — name the two considered and why), and `**Open / next:**` carrying the design's
"What this leaves open" list in one line each. End with the spend line per CLAUDE.md's rule
(`python3 ~/.claude/scripts/session-spend.py --session <uuid>`; omit on a non-zero exit).

- [ ] **Step 5: Commit the docs**

```bash
bunx prettier --write docs/DESIGN_screen-structure.md SPEC.md CLAUDE.md log.md
git add docs/DESIGN_screen-structure.md SPEC.md CLAUDE.md log.md
git commit -m "docs(zoom): the hero zooms; the two-finger exit is retired

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 6: Device pass (Ben, on the iPhone; the executing session writes the checklist into the log and stops)**

Serve over HTTPS (CLAUDE.md: `tailscale serve --bg 3000`, origin
`https://macbook-air-m5.halley-morpho.ts.net`), `bun run dev`, open a picture item. Check, in
Safari **and** the installed PWA:

1. Pinch out: the picture grows under the fingers, the caption hides, two fingers moving together
   pan.
2. Let go above 1: it settles, no jump; past the ceiling it springs back.
3. One finger while zoomed: pans; past an edge it resists and springs back. The page does **not**
   scroll.
4. Pinch in below 1 and let go: back to the hero, `touch-action` back (one-finger vertical drag
   scrolls the page again).
5. Double-tap: zooms in about the finger, caption hides; double-tap again: back.
6. Tap while zoomed: caption toggles, picture stays.
7. Swipe to the next picture after zooming out: unchanged. Then zoom, press nothing, and swipe:
   the picture pans and the rail stays.
8. The down-flick at the top after zooming out still leaves.
9. Reduce Motion on (Settings → Accessibility → Motion): the settle is instant, everything else
   the same.
10. iOS listeners: comment out the `touchmove` listener, rebuild, pinch — does iOS zoom the page
    or cancel the pinch? Restore; repeat for the two `gesture*` listeners. Record what each one
    turned out to be for; delete whichever did nothing, in the hook and in the design's D2.

Then merge is Ben's call.

---

## Verification, end to end

- `bun run check` green on every commit.
- `bun run e2e:prod` at the count `main` has.
- The hook's test file has **no** test asserting a two-finger exit.
- `grep -rn "two-finger" src docs/DESIGN_screen-structure.md SPEC.md` finds only history
  (hero-rail/hook comments saying it is gone) — no live claim that two fingers exit.
- A `/i/<id>` in a desktop browser at 1440 with the spread on: nothing changed, `M` still flips
  it, clicks still focus pages, two mouse clicks still toggle the chrome twice.
