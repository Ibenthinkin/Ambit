# Phase 5.8 walkthrough — the immersive gallery

**Executed 08-21-26** against `docs/PHASE5_PLAN_5.8.md`, on branch `feat/phase-5.8-gallery`. Eight
tasks, all landed, each its own commit with `bun run check` green. The plan was written to be
executed cold and very nearly was: three places argued back, none of them a design question, and one
of them a bug the phase merely *exposed* rather than caused.

**Status: code complete, awaiting the iOS device pass.** Everything a browser can prove is green
(three consecutive `bun run e2e` runs, 27 tests). What can't be proved in Chromium is listed at the
end, with the one regression to watch for.

---

## What shipped

**The screen.** `/g/[itemId]` — the app's second public route. A picture edge to edge on
`bg-immersive`, with nothing on top of it until you ask. Chrome (title, maker, hint, pill) starts
hidden and cycles on a ten-second loop; a tap raises it, a tap while it's up opens the details
sheet. Swiping walks the rail. A hard flick up from the picture, or any two-finger movement, leaves.
A slow drag up from the title block opens details. Signed-out visitors get the picture, the rail,
the caption, and the way out — the pill, both sheets, and the protected `saves.forItem` query are
all behind `authed`.

**The rail.** `server/services/gallery-rail.ts` extends `services/wander.ts` from three teaser rows
into an endless, bidirectional, images-only sequence. Per slot: roll a wildcard, else draw a tier on
the feed's own CORE/DRIFT/JUMP shares, then one curated-weighted image, with a three-link fallback
(step topic → anchor's topic → anywhere) and a short batch when even that runs dry. Behind
`items.galleryRail`, the API's third and (for now) last public procedure.

**The knob.** `wildcardChance`, default 0.1 — the probability a slot ignores the topic walk
entirely and draws corpus-wide, preferring `server/config/wildcard-sources.ts`'s list. That list is
empty today and the emptiness is the point: it is the doorway ambit-archive's personal images walk
through when that integration lands.

**The plumbing.** `BottomSheet` grew `variant: "gallery"`, `dragToClose` and `onSwipeSide` (all
additive; the existing suite passes untouched, which is the proof). `useRailGestures` and
`useChromeCycle` joined the hooks directory. `gallery-origin.ts` mirrors `feed-origin.ts`, and
`useExitGallery` mirrors `useLeaveToFeed` one screen deeper. The item hero, deliberately inert since
5.7, became the doorway.

---

## The three places reality argued with the plan

**1. The plan's own router-test instruction contradicted the architecture it named.** T2 said to gate
knob overrides in the procedure and to "mirror how `routers/feed.ts` gates `input.knobs`" — but
`routers/feed.ts` does not gate them at all. It forwards unconditionally and `getFeedPage` owns the
`FEED_DEBUG` decision, precisely so the router can't develop an opinion that disagrees with the
service's. The architecture won: `items.galleryRail` forwards, `getGalleryRail` gates, the router
test asserts forwarding, and the gate is tested in `gallery-rail.test.ts` next to
`feed.test.ts`'s equivalent block.

**2. The gesture hook's return shape was specified twice, differently.** T4 asked for
`{ handlers, dragPx, dragging }` in one sentence and "native listeners on a ref'd node (pattern:
`use-swipe-back.ts`)" in the next. The ref won — it's the named pattern, and it's what keeps a swipe
from re-rendering the screen it's driving. The hook returns `{ ref, dragPx, dragging }`.

**3. A cleanup collision the phase exposed but did not cause.** `feed.spec.ts` and `item.spec.ts`
both seed under `source: "e2e"` and both deleted the *whole source* in `afterAll`. With
`fullyParallel: true`, the spec files run in separate workers — so adding a third such spec had them
pulling each other's fixtures out from under each other mid-run. It surfaced as an empty feed in one
file and a 404'd item page in another, with nothing in either to explain it. All three cleanups are
now scoped to their own `sourceId` prefix. Worth knowing because the shape recurs: **a shared
fixture namespace plus a broad delete is a time bomb that only goes off when a third participant
arrives.**

---

## Findings worth keeping

**`animation-fill-mode: both` beats an inline transform.** `BottomSheet`'s drag-to-close could not
move the panel at all until it switched the animation off first. Every `--animate-sheet-*` token
carries `both`, so once the entrance finishes the keyframe's own `translateY(0)` keeps winning over
anything set inline. `style.animation = "none"` at pointer-down is what hands control to the
gesture; the exit path clears it again. The visible cost, recorded in the code rather than papered
over: a drag-close snaps the last stretch back before the exit animation runs, because that
animation starts from zero. Hand-rolling the close travel would mean two implementations of the exit
that could disagree.

**`pointer-events: none` on an ancestor is not a lock.** The gallery's chrome has to be completely
inert while it's faded out — an invisible control that still takes taps is worse than no control.
`pointer-events: none` on the chrome wrapper does *not* achieve that: `PillToolbar` sets
`pointer-events: auto` on its own nav, on purpose, so its full-width wrapper can span the screen
without eating scrolls, and a descendant's `auto` overrides any ancestor's `none`. `visibility:
hidden` cannot be overridden that way, and it transitions discretely — flipping to visible takes
effect at once and back to hidden only after the fade finishes, which is exactly the semantics a
fade needs.

**Reset before read is a real bug shape.** `useRailGestures`'s release handler captured `dx`/`dy`
before calling `reset()` but read `moved`/`multiTouch` after it — and `reset()` clears them. Every
gesture with movement in it classified as a tap. It cost one debug cycle and would have cost far
more on a device, where "the swipe just toggles the chrome" reads as a threshold problem rather than
an ordering one.

**The rail moves in px, not percentages.** The plan specified
`translateX(calc(-33.3333% + ${dragPx/width*33.3333}%))`, which needs the track measured. It doesn't:
the rail is exactly three screens wide, so `-33.3333%` is one screen, and adding raw `${dragPx}px`
tracks the finger 1:1 with no measurement at all. Same result, one fewer thing to get wrong on a
resize.

---

## Deviations from the plan, all deliberate

- **Knob gating lives in the service, not the router** (finding 1 above).
- **`useRailGestures` returns a ref, not a handlers object** (finding 2).
- **`db/items.ts` grew a shared `sampleCurated` helper.** `drawImageAnywhere` needed the same
  curated-weighting tail as `drawFromTopic`, and "curated-weighted random, never similarity" is the
  one sentence the corpus-as-product bet rests on. It deserves exactly one implementation.
- **A wildcard does not advance the walk.** The plan says so; worth restating because the opposite
  is the tempting reading. A wildcard is a detour — if it relocated the walk, one wildcard would
  silently teleport the rest of the rail, and a dial meant to season the walk would replace it.
- **`e2e/gallery.spec.ts` taps with `page.mouse.click`, not a locator click.** The track is 300%
  wide and translated a screen left, so most of its bounding box is outside the viewport and
  Playwright refuses to click into it.
- **A walkthrough and a `HeroGalleryLink` test were added beyond T6/T8's letter.** The SPEC's route
  entries point at a per-phase walkthrough, and the hero's no-anchor/no-callout contract is the
  phase's single most likely regression — it wanted a test that fails if someone "tidies" it into a
  `<Link>`.

---

## Verification

- `bun run check` green before every commit. 478 unit/integration tests across 48 files.
- `bun run e2e`: **three consecutive green runs**, 27 tests. Covers cold-open signed-out (no pill,
  no console errors), tap → chrome → tap-again → details with the From row linking out, the article
  guard 404, the full feed → item → hero → gallery doorway, the pill's Feed button landing on the
  intact feed with **zero draws in the request log**, and a gallery session leaving `seen_item`
  untouched.
- Integration coverage asserts the same corpus promise one layer down: a `galleryRail` call writes
  no `seen_item` rows, returns image rows only, never the anchor, and respects `exclude`.

## Still open — the iOS device pass

Not yet run. It has to happen over the HTTPS tailnet origin (`tailscale serve --bg 3000`), because
the Web Share API is secure-context only and share/clipboard simply don't exist on plain
`http://` over the LAN. What it needs to judge, none of which Chromium can:

- Rail swipe feel and the 20% threshold; the chrome fade; tap-again → details; slow-up from the
  title distinguished from hard-up from the picture; the two-finger exit.
- Drag-to-close live-following the finger; side-swipe cycling.
- Exit popping to the item page with its state intact; the pill's Feed button landing on the intact
  feed with its scroll position preserved.
- Save-to-collection, share, and Save-image from inside the gallery.
- **Long-press on the item hero still offering "Add to Photos."** The single most likely regression
  of the phase — the warning comment in `image-item-body.tsx` exists because the obvious
  implementation breaks it, and a test now pins the two things that would (an anchor around the
  image, or `-webkit-touch-callout: none` in its markup). The device is still the only place the
  callout itself can be seen.

Also worth a look during the pass: `wildcardChance` with `FEED_DEBUG=true` and the dial turned up,
to judge how much serendipity the rail actually wants. 0.1 is a starting position, not a verdict.

## Not in this phase, on purpose

Saved's gallery entry and collection rails (5.9). URL sync while swiping — decided against; revisit
only if refresh-mid-session turns out to matter. The ambit-archive integration itself:
`WILDCARD_SOURCES` stays empty, and the knob is the doorway, not the feature. OG metadata for `/g/`
— `/i/` is the share surface. Image preloading and IIIF sizing (7.3).
