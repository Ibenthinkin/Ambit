import { describe, expect, it } from "vitest";

import {
  DOUBLE_TAP_SCALE,
  IDENTITY,
  LIVE_MIN,
  LIVE_OVER,
  MAX_SCALE,
  MIN_CEILING,
  RESISTANCE,
  SNAP_TO_ONE,
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
    expect(fitRect(BOX, WIDE)).toEqual({
      x: 0,
      y: 300,
      width: 400,
      height: 200,
    });
  });
  it("fits a tall picture to the whole box", () => {
    expect(fitRect(BOX, TALL)).toEqual({ x: 0, y: 0, width: 400, height: 800 });
  });
  it("centres a square picture vertically", () => {
    expect(fitRect(BOX, SQUARE)).toEqual({
      x: 0,
      y: 200,
      width: 400,
      height: 400,
    });
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
    expect(ceiling(WIDE, { x: 0, y: 0, width: 0, height: 0 }, 2)).toBe(
      MIN_CEILING,
    );
  });
});

describe("settle", () => {
  const fit = fitRect(BOX, SQUARE); // 400×400 at y 200
  it("is null at or under scale 1 — the hero as it was", () => {
    expect(settle({ scale: 1, x: 0, y: 0 }, fit, BOX, 3)).toBeNull();
    expect(settle({ scale: 0.7, x: 40, y: 40 }, fit, BOX, 3)).toBeNull();
  });
  it("is null just above 1 too — a brush with two fingers must not leave the hero in a zoomed limbo", () => {
    // Visibly the hero, but `zoomed` would be true: touch-action none, swipes dead.
    expect(settle({ scale: 1.03, x: -5, y: -4 }, fit, BOX, 3)).toBeNull();
    expect(settle({ scale: SNAP_TO_ONE, x: 0, y: 0 }, fit, BOX, 3)).toBeNull();
    expect(
      settle({ scale: SNAP_TO_ONE + 0.01, x: 0, y: 0 }, fit, BOX, 3),
    ).not.toBeNull();
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
    expect(live({ scale: 9, x: 0, y: 0 }, fit, BOX, 3).scale).toBeCloseTo(
      3 * LIVE_OVER,
    );
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
    expect(
      doubleTapTarget({ scale: 2, x: 0, y: 0 }, { x: 0, y: 0 }, fit, BOX, 3),
    ).toBeNull();
  });
});
