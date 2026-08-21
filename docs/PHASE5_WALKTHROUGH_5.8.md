# Phase 5.8 walkthrough — the immersive gallery

**Executed 08-21-26** against `docs/PHASE5_PLAN_5.8.md`, on branch `feat/phase-5.8-gallery`. Eight
tasks, all landed, each its own commit with `bun run check` green. The plan was written to be
executed cold and very nearly was: three places argued back, none of them a design question, and one
of them a bug the phase merely *exposed* rather than caused.

**Status: complete, with one loose end stated plainly.** The iOS device pass ran 08-21-26 and
passed; what it turned up — one real cluster of gesture defects — is at the end, along with the fix.
**That fix is unit-tested but has not itself been re-confirmed on device**, so the next person to
pick up a phone should start there.

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

- `bun run check` green before every commit. 487 unit/integration tests across 48 files (478 at
  code-complete; the device-pass fixes added nine, all pinning gesture thresholds that had just been
  shown to be wrong by hand).
- `bun run e2e`: **three consecutive green runs**, 27 tests. Covers cold-open signed-out (no pill,
  no console errors), tap → chrome → tap-again → details with the From row linking out, the article
  guard 404, the full feed → item → hero → gallery doorway, the pill's Feed button landing on the
  intact feed with **zero draws in the request log**, and a gallery session leaving `seen_item`
  untouched.
- Integration coverage asserts the same corpus promise one layer down: a `galleryRail` call writes
  no `seen_item` rows, returns image rows only, never the anchor, and respects `exclude`.

## The device pass (08-21-26) — passed, with one cluster worth the whole exercise

Run over the `tailscale serve` HTTPS origin. **The regression everyone was watching for did not
happen**: long-pressing the item hero still offers "Add to Photos". Save-to-collection, share, and
Save-image all work from inside the gallery. Cold-opened `/g/` signed-out is clean. The rail's
mechanics, the chrome cycle, the hard-flick exit, and the pill's Feed button all behaved.

Ben's verdict on the rail itself: *"the mechanics are good, like I wanted"*, with the caveat that
**feel can't really be judged until there are more sources to wander between** — a two-museum corpus
doesn't drift far enough to tell a good walk from a lucky one. Worth re-running once more sources
land rather than tuning against today's corpus.

**Four separate complaints, one cause.** Rail swipes "quite hard"; the item page's left-to-right back
gesture "too hard to do"; the details sheet "should close with a down swipe"; the two-finger exit
"barely fires". They looked like four thresholds needing four nudges. They were three shared defects:

1. **No velocity path anywhere.** Every commit was distance-only, which punishes the confident flick
   and rewards the hesitant drag — backwards, since a fast short movement is the more deliberate of
   the two. Every threshold is now "far enough **or** fast enough", which is the two-way test the
   hard-flick exit already used and the reason *that* one always felt right.
2. **The axis was re-decided at release.** A thumb swipe arcs. Judging horizontal-vs-vertical from
   the final delta means a good sideways swipe that drifted down finishes as "vertical" and does
   nothing. `useSwipeBack` was worse still: it *permanently abandoned* the gesture the first time
   vertical won mid-drag, so the item page's back swipe died halfway across and snapped back for no
   visible reason. Both hooks now decide once, at the slop, and hold.
3. **The two-finger exit was discarded at the moment it was recognised.** iOS Safari fires
   `pointercancel` when it claims a multi-touch gesture for the system — which it does for
   two-finger swipes *even under `touch-action: none`* — and the hook treated every cancel as
   "throw this away". A cancelled gesture that was multi-touch and had moved is now an exit; a
   cancelled single-finger one still isn't, because that's a real interruption.

Plus one scoping fix: the details sheet's drag armed only in its top 64px, so a swipe down from
mid-sheet did nothing. It now arms anywhere on a panel that isn't scrolled, with the grabber band
still ruling on a scrolled one.

**The fix has not been re-confirmed on device.** It is pinned by nine new unit tests — every
threshold, both axis locks, and the cancelled-multi-touch rescue — and the e2e suite is green three
runs running, but a threshold is a *feel* judgement and no test can make one. The four gestures to
re-run first are the four that prompted it: the rail swipe, the item page's left-to-right, a quick
flick down on the details sheet, and the two-finger exit.

**The lesson to carry into 5.9 and 5.10:** when several gestures across several screens all feel
"too hard", suspect a shared missing dimension before you suspect the numbers. Four threshold tweaks
would have shipped four half-fixes and left the two-finger exit broken entirely.

### Two things found while pinning the fix in tests

**React normalizes synthetic `timeStamp` as `nativeEvent.timeStamp || Date.now()`.** A falsy native
value silently becomes an epoch millisecond sitting next to a sibling event's `performance.now()`
one — two clocks, one subtraction, a *negative* elapsed, and a velocity test that passes for every
gesture. `BottomSheet` reads `Date.now()` on both ends instead; `use-rail-gestures` can keep reading
`e.timeStamp` because it attaches **native** listeners, where React never touches the value. The
distinction is now written down in both files.

**A test that skips itself reads as a pass.** `e2e/gallery.spec.ts`'s doorway test took the feed's
first tile blind and bailed with `test.skip` when it turned out to be an article — roughly one run in
three, covering nothing while showing green. It now picks the first tile that actually has an image.

### Left for a later pass

- **Re-confirming the gesture fix on device** — see above. The only unfinished item that could still
  change code.
- **Rail feel**, deliberately — see above. Re-judge when the corpus spans more sources.
- **`wildcardChance` is still 0.1**, untuned. Turn it up under `FEED_DEBUG` (the details sheet grows
  a `Debug` row showing `via · topic`) once there is more to wander between.
- **The iOS long-press callout can't be styled**, and shouldn't be. Ben noted it doesn't match the
  app; it is Safari's own image menu, and replacing it with anything of ours is precisely what would
  cost the two-tap path to Photos.

## Not in this phase, on purpose

Saved's gallery entry and collection rails (5.9). URL sync while swiping — decided against; revisit
only if refresh-mid-session turns out to matter. The ambit-archive integration itself:
`WILDCARD_SOURCES` stays empty, and the knob is the doorway, not the feature. OG metadata for `/g/`
— `/i/` is the share surface. Image preloading and IIIF sizing (7.3).
