# Hero zoom — pinch and double-tap on the item screen's picture — design

**Written:** 10-04-26 by Fable 5.1, from Ben's ask ("I'd like to be able to pinch and zoom on a
photo while in gallery mode") and three questions answered in chat the same afternoon.
**Status:** design approved in chat 10-04-26; plan `docs/PLAN_hero-zoom.md`, **built 10-04-26 on
`feat/hero-zoom`** (Opus 5.5), **merged to `main` 10-04-26** after Ben's phone look; check 10 of the device pass (which iOS listener is needed) not yet run.

## Why

The item screen's hero is the whole viewport — a picture centred in a 12 px inset, whole,
`object-contain` (`DESIGN_screen-structure.md` §1, amended 09-11-26). That is the right frame to
_look_ at a picture and the wrong one to _inspect_ it: a 1600 px museum plate on a 402 px phone is
shown at a quarter of its pixels, and the only way to see a brushstroke today is to leave the app
for the museum's site. iOS Photos is the reference everyone already has in their hands — pinch to
zoom in, one finger to pan, double-tap to jump in and out — and the hero already borrows its
12 px inset and its down-flick dismiss. Zoom is the missing third.

## Decisions (with Ben, 10-04-26)

1. **Pinch zooms. The two-finger exit is dropped.** Until now any two-finger movement on the hero
   left to the feed (the redesign handoff's "pinch out of the picture"; `use-rail-gestures.ts`).
   Pinch-to-zoom takes that gesture. Leaving is the down-flick at the top of the page, Escape,
   and the pill's Feed — all unchanged. (Offered and declined: iOS Photos' pinch-in-to-dismiss.)
2. **Phone first: pinch and double-tap, in the single-page view, from a touch screen.** The
   desktop is untouched in this cut (no trackpad pinch, no double-click) and the magazine spread
   never zooms.
3. **No library.** Asked and weighed: `react-zoom-pan-pinch` wraps the content and cancels touch
   events on its container, which its own bug list records as blocking native page scroll on
   mobile — the opposite of the hero's `touch-action: pan-y`. `@use-gesture/react` is a sound
   recogniser but only a recogniser: it would hand back two-finger geometry (~80 lines of this
   design) and none of the bounds, ceiling, double-tap or snap, while putting a second gesture
   engine on an element whose hand-rolled one was tuned on device. One thing taken from its docs:
   Safari's proprietary `gesturestart`/`gesturechange` events want `preventDefault` (D2).

## D1. What zoom is

A **mode of the single-page hero**, held as one piece of state on `ItemScreen`:

```ts
/** The current picture's transform. `null` is the hero exactly as today. */
type Zoom = { scale: number; x: number; y: number } | null;
```

`scale` is relative to the fitted picture (1 = as drawn today); `x`/`y` are the translation in
CSS px of the frame, with the transform origin at the picture box's top-left. Rules:

- **Only the current cell's page zooms.** The cells before and after, the chrome gradient and the
  caption are untouched. The `/explore` end card never zooms.
- **Any index change resets it to `null`:** a swipe, ←/→, a URL follow, the head extension. So
  does the spread turning on. Nothing is persisted; a reload is scale 1.
- **Not in a spread, never from a mouse.** The screen passes `zoomable = !spread && !atEnd` to
  the hook; a
  mouse cannot produce two pointers, and the desktop's trackpad pinch arrives as `wheel`, which
  nothing listens to. So the desktop single view is unchanged by construction, not by a check.
- **Zoom hides the chrome.** Every change of zoom through a gesture calls `chrome.reset()` —
  pinching in, double-tapping in or out. A picture being inspected has no caption on it.

## D2. Gestures

`use-rail-gestures.ts` stays the hero's one input surface. It gains three outcomes and loses one.
Its header comment's "four outcomes" list is rewritten to match.

**Lost: the two-finger exit.** `onExit` keeps its down-flick path only. A two-finger movement
when `zoomable` is false (a spread) is _nothing_ — it snaps back like any other unclassified
gesture. The `pointercancel` rescue that existed for the two-finger exit goes with it.

**Pinch.** The hook now tracks every active pointer's position (`Map<pointerId, {x, y}>`), not
just the first finger's origin. When a second pointer goes down and `zoomable` is true:

- `onPinchStart({ cx, cy })` — the midpoint, in client px. The screen measures the current
  picture here (D3) and remembers the zoom it started from.
- `onPinch({ ratio, cx, cy })` on every move while two pointers are down — `ratio` is the current
  distance between the fingers over the distance at start; `cx`/`cy` the current midpoint. The
  screen computes the new zoom from the _start_ zoom, this ratio and the midpoint's drift since
  the start (`pinchUpdate`, D3), so a pinch never accumulates rounding and two fingers moving
  together pan as they zoom.
- `onPinchEnd()` when either finger lifts. The screen settles (D3): below 1 snaps to `null`,
  above the ceiling snaps to it, offsets clamp into bounds. If the other finger is still down and
  the picture is zoomed, that finger begins a **pan** from its current position; if not zoomed,
  it is ignored until it lifts.
- A `pointercancel` during a pinch is an `onPinchEnd`, not a discard — the settle makes any
  interruption safe.

**Pan.** When `zoomed` is true (an option the hook reads through its handlers ref on every
event), a single finger drives the picture, not the rail: `onPanStart()` when the finger first
clears the slop (or at once, for the finger left down after a pinch), `onPan({ dx, dy })` on every
move after it, relative to where the finger went down, and `onPanEnd()` on lift or cancel. The
screen ignores a pan while `zoom` is `null` — the finger left down after a pinch that settled
back to 1 is the case. The axis lock,
the advance thresholds and the down-flick exit are all **suspended** while zoomed — there is no
`dragPx`, the track never moves. A tap (no travel) still fires `onTap` and toggles the chrome,
as in iOS Photos.

**Double-tap.** Two taps within `DOUBLE_TAP_MS = 300` and `DOUBLE_TAP_PX = 30` of each other.
**The first tap is not delayed:** it fires `onTap` at once, so the chrome toggle keeps its
instant feel; the second fires `onDoubleTap({ clientX, clientY })` instead of a second `onTap`.
The screen zooms to `DOUBLE_TAP_SCALE` about the point, or back to `null` if already zoomed, and
calls `chrome.reset()` either way — so whatever the first tap did to the caption, a double-tap
ends with it hidden. Mouse clicks are not double-taps (`pointerType === "mouse"` is skipped), so
the desktop's click-to-toggle is unchanged.

**Two mechanics under all of it.**

- **`touch-action` flips with the mode.** The track declares `pan-y` when not zoomed, exactly as
  today, and `none` while zoomed. The browser reads it at `touchstart`, so the flip takes effect
  between gestures — which is the right moment: the pinch that zooms in happens under `pan-y`,
  and the one-finger pan that follows it happens under `none`, so it reaches the picture rather
  than scrolling the page. `HeroRail` sets it from its `zoom` prop.
- **One scoped exception to "never `preventDefault` on move".** The hook adds a non-passive
  `touchmove` listener that calls `preventDefault()` **only when `touches.length >= 2`**, and
  `preventDefault` on Safari's `gesturestart`/`gesturechange`. The hook's own comments record
  that iOS cancels two-finger pointers under `pan-y` the moment it claims the gesture for a
  scroll or a page zoom; these two listeners are what stop it. Single-finger moves are never
  cancelled — vertical scrolling from the picture is still the browser's. The device pass (plan
  Task 10) says whether both are needed on current iOS; either can be removed once that is
  known, and the comment on each says so.

## D3. The math — pure, in `src/lib/zoom-math.ts`

No React, no DOM. Everything takes sizes and returns a `Zoom`; `zoom-math.test.ts` pins it.

```ts
type Size = { width: number; height: number };
type Rect = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };

/** The letterboxed picture inside the inset box — `object-contain`'s arithmetic, done once. */
fitRect(box: Size, natural: Size): Rect;

/** Scale about a point: the point stays under the fingers. */
zoomAbout(z: NonNullable<Zoom>, factor: number, origin: Point): NonNullable<Zoom>;

/** One live pinch frame from where it started: scale about the starting midpoint by `ratio`,
 *  then follow the midpoint's drift — two fingers moving together pan as they zoom. */
pinchUpdate(start: NonNullable<Zoom>, startMid: Point, now: { ratio: number; cx: number; cy: number }): NonNullable<Zoom>;

/**
 * The ceiling: as far as the picture's own pixels honestly go, with a floor so a small picture
 * can still be looked at and a cap so a huge one cannot be zoomed into mush.
 * `max(MIN_CEILING, natural.width / (fit.width * dpr))`, capped at `MAX_SCALE`.
 */
ceiling(natural: Size, fit: Rect, dpr: number): number;

/** Where a release lands: `null` at or under 1; otherwise the scale clamped to the ceiling and the
 *  offsets clamped so the picture covers the box on any axis it exceeds, and sits centred on
 *  any axis it doesn't. */
settle(z: NonNullable<Zoom>, fit: Rect, box: Size, ceiling: number): Zoom;

/** A live gesture's freedom: scale in [LIVE_MIN, ceiling * LIVE_OVER], offsets past the bounds
 *  moved at `RESISTANCE` of the finger — the rubber-band. */
live(z: NonNullable<Zoom>, fit: Rect, box: Size, ceiling: number): NonNullable<Zoom>;

/** The double-tap target: `DOUBLE_TAP_SCALE` (or the ceiling if lower) about the tapped point,
 *  settled; `null` if already zoomed. */
doubleTapTarget(z: Zoom, point: Point, fit: Rect, box: Size, ceiling: number): Zoom;
```

**Coordinates.** Everything in this module is in the **picture box's** space: the inset box the
`<img>` fills, its top-left at `(0, 0)`, in CSS px. `fit` is the letterboxed picture inside that
box; `x`/`y` move the box's content from there; `box` is its size, and the bounds are its edges
(the 12 px inset stays visible around a zoomed picture, as in iOS Photos' own margins). The
screen converts a client point once, at gesture start, by subtracting the box's
`getBoundingClientRect()` left/top — the hook reports client coordinates and knows nothing of
boxes.

Constants, each with a one-line reason in the file: `MIN_CEILING = 2.5`, `MAX_SCALE = 4`,
`DOUBLE_TAP_SCALE = 2.5`, `LIVE_MIN = 0.6`, `LIVE_OVER = 1.25`, `RESISTANCE = 0.35`,
`SNAP_MS = 250`.

**Why the ceiling is the honest part.** The image cache serves ≤1600 px WebP masters, fetched
from each museum once, ever (7.3) — there is no larger rendition to ask for. On a 3× phone a
1600 px picture fitted to ~378 CSS px is at one device pixel per source pixel at about 1.4×;
past that it is interpolation. The floor of 2.5 says a reader may still look closer than
pixel-honest, because a soft close look beats none; the cap of 4 says no further. Raising the
masters is out of scope and would mean re-fetching every source image.

**Measuring once, not per frame.** At `onPinchStart` and on a double-tap the screen reads the
current page box's `getBoundingClientRect()` (the inset box, which is also the coordinate space
above) and the `<img>`'s `naturalWidth/Height`, and derives `fit` and the ceiling. `RailItem` carries no
dimensions, so the DOM is the only source; one read per gesture start is cheap and never jank.
The box is measured on a `data-page-box` wrapper `HeroRail` puts around the current page's
image — the transform sits on the `<img>`, so the wrapper's rect is the untransformed box however
far the picture is already zoomed — and the natural size is read off the `<img>` inside it. If
`naturalWidth` is 0 (the picture has not decoded yet) the gesture is ignored.

## D4. Rendering

`HeroRail` takes one new prop:

```ts
/** The current page's zoom (D1). `snapping` plays the 250 ms settle; a live pinch or pan has none. */
zoom?: { scale: number; x: number; y: number; snapping: boolean } | null;
```

and applies it to the current cell's `RailImage` only, as inline style: `transform:
translate(x px, y px) scale(s)`, `transformOrigin: "0 0"`, `willChange: "transform"`, and
`transition: snapping ? "transform 250ms ease" : "none"`. The track's `touchAction` becomes
`zoom ? "none" : "pan-y"`. Nothing else in the rail changes: the drag translate is 0 while zoomed
because the hook never sets `dragPx` in pan mode, the leaf and spine are spread-only and the
spread never zooms.

**A CSS transition, not WAAPI, on purpose.** `globals.css`'s reduced-motion rule collapses it to
0.01 ms, so a reader who asks for less gets an instant snap. That is consistent with every
motion in the app except the magazine turn, which Ben exempted deliberately (09-27-26); zoom
gets no such exemption.

`snapping` is set by the screen on a settle and a double-tap, and cleared by the next pinch start
or the first move of a pan — not by the pan's start, because a pinch that ends with one finger
still down settles and starts a pan in the same event, and the settle must still play. The `<img>` keeps `pointer-events: none` and its native iOS long-press callout; the track
owns every pointer, as before.

## D5. How it sits with the rest of the screen

- **`advance()` sets zoom to `null`** before anything else — the hook refuses to advance while
  zoomed, so this covers ←/→ and the explore cap. `chrome.reset()` is already there.
- **Spread on → zoom `null`**, in the same render-time adjustment that handles `prevSpread`.
- **Leaving** needs nothing: the state dies with the screen.
- **Keyboard** while zoomed: ←/→ reset and advance; Escape leaves. No zoom keys in this cut.
- **Save, Share, the facts, the URL** all follow `current`, which zoom never changes.
- **The explore end card** is never the current image, so nothing to zoom; the hook's `zoomable`
  is also false while `atEnd`.
- **`/explore`'s signed-out visitor** gets zoom too — it is the same screen.

## D6. Testing

- **`zoom-math.test.ts`**: `fitRect` for a wide, a tall and a square picture; `zoomAbout` keeps
  the origin fixed; `pinchUpdate` scales about the start midpoint and follows its drift;
  `ceiling` floors at 2.5, follows the pixel-honest value in between, caps at
  4; `settle` returns `null` at ≤1, clamps the scale, covers the box on the long axis and
  centres on the short one; `live` rubber-bands past the bounds; `doubleTapTarget` toggles.
- **`use-rail-gestures.test.tsx`**: two synthetic pointers (the existing `pointer()` helper takes
  an `id`) — a pinch reports start, live ratios and midpoints, and end; a second finger when
  `zoomable` is false does nothing and no longer exits (the three two-finger tests are rewritten
  to this); a finger left down after a pinch pans when zoomed and is ignored when not; while
  `zoomed`, a horizontal drag pans and never advances, a down-flick never exits, a tap still
  taps; two taps inside the window fire tap then double-tap, outside it two taps; a mouse
  double-click is two taps.
- **`hero-rail.test.tsx`**: the zoom transform lands on the current cell's image only; the track
  is `pan-y` unzoomed and `none` zoomed; `snapping` toggles the transition.
- **`item-screen.test.tsx`**: a double-tap zooms and hides the chrome; advancing (keyboard)
  resets the zoom; turning the spread on resets it.
- **Playwright**: nothing for the pinch — SPEC §12 already records the swipe gestures as
  hook-tested and judged on device, and a pinch is the same class. One **optional** Chromium
  smoke through CDP's `Input.synthesizePinchGesture` is plan Task 9 (stretch); it is dropped
  rather than flaked.
- **Device pass** (plan Task 10) on the tailnet origin, iPhone Safari and the installed PWA:
  pinch in and out, pan to each edge, double-tap in and out, tap-to-toggle while zoomed, swipe
  after zooming out, the down-flick after zooming out, Reduce Motion on, and the two iOS
  listeners each disabled in turn.

## What this leaves open

- Desktop: trackpad pinch (`wheel` + `ctrlKey`) and double-click on the single view. The math
  and the rendering are shared; it is a hook branch and a day.
- Zoom inside the spread (a zoomed page while the leaf, spine and focus side all still work).
- Swiping to the next picture from a zoomed edge, and inertia on the pan — both iOS Photos
  behaviours, both left out to keep the first cut small.
- Larger masters. The ceiling is honest about 1600 px; a `?w=` rendition above the master would
  need a second fetch from every museum, which 7.3 ruled out.
