# Screen structure — the merged item screen, one New-collection row, the living landing slideshow — design

**Written:** 09-10-26 by Fable 5.1, from Ben's desktop review notes
(`docs/design_update_3/desktopPolishChecklistNotes.md`, the Item page, Gallery, Item sheet and
Landing sections) and five questions answered in chat the same evening.
**Status:** design approved 09-10-26; plan `docs/PLAN_screen-structure.md`, ready to execute cold.
**Sub-project 2 of 3** from that review. Sub-project 1 (facets, four-stage onboarding,
`/profile/topics`, personas) shipped 09-10 pm. Sub-project 3 (the chrome redesign: detached
share button, desktop right-hand rail, hover-over save on tiles, list screens) gets its own doc.
This one is the "fixes to what exists" pile, and like sub-project 1 it is deliberately free of
new visual taste decisions — every pixel here is either already in the app or is the removal of
one.

## Why

Three things Ben ran into on the desktop pass, and one he has been living with on the phone:

- **The item page and the immersive gallery are two screens that want to be one.** The item page
  shows a hero cropped to 300 px on the phone and capped at 70 % of the viewport on desktop, with
  rounded corners; a tap on it opens `/g/`, a full-screen rail where a second tap opens a details
  sheet holding facts the item page already shows. Ben's words: *"the location of a tap makes too
  much difference in the response"*, *"photos should be bigger"*, *"ditch the rounded corners on
  the hero images in every view"*, and *"we can get rid of the tap for more details entirely —
  that info can just go below."*
- **Escape does nothing on the item page.** Ben pressed Enter on a tile (which opens the item
  page), then Escape, and stayed put. He read it as the item *sheet* not closing; the sheet's
  Escape works and is pinned by `e2e/desktop.spec.ts:99`. The item page has no Escape handler at
  all — `grep "Escape" src/` finds only `bottom-sheet.tsx` and `gallery-screen.tsx`.
- **Nowhere that offers a collection lets you make one.** The tile's right-click sheet, the item
  screen's save sheet and the gallery's save modal all list existing collections and stop; the
  Collections sheet's "New collection — make one on your profile" row navigates to the profile
  (`collections-sheet.tsx:87`). The only create form in the app is the profile's dashed tile.
- **The landing slideshow stops after five seconds and the glyph is dead.** The run is eight
  slides at 600 ms, then the sheet rises and the timer ends; a tap on the imagery is `skip`, which
  is idempotent once the sheet is up; there are no key handlers. And the sheet's collapse glyph is
  `isStatic ? undefined : …` where `isStatic` reads `prefersReducedMotion()` in a lazy initializer
  the server cannot evaluate — the hydration mismatch logged 09-08 (`<button>` on the server,
  `<div aria-hidden>` on the client), which is how a glyph "doesn't open or close anything".

## Decisions (with Ben, 09-10-26)

1. **The item page becomes the immersive screen.** One route, `/i/[itemId]`; `/g/[itemId]` is
   retired to a redirect so nothing in a history stack 404s. The hero is the gallery's rail, and
   swiping sideways makes the whole page that item. Articles keep the reader layout.
2. **The hero is as big as it can be, square-cornered, top-aligned.** Phone: full width, natural
   height up to `100dvh`, whole — an image whose aspect is close to the phone's fills the screen; a
   square or landscape one shows at its natural height with the chrome *below* it. Desktop
   (≥ `md`): **full viewport height, edge to edge** — a portrait image fills the height and sits
   centred left–right; the details below stay in the 720 px reader column. No rounded corners on
   any hero anywhere; the profile's collection covers keep theirs (they are tiles).
3. **No details sheet, no "tap for more".** Maker, from, license and topic join the item body
   below the hero. A tap toggles the chrome (title + pill); a second tap toggles it back. Mouse
   movement summons the chrome on desktop, exactly like a tap.
4. **Vertical gestures: down flicks out, up scrolls.** A quick downward flick with the page at the
   top returns to the feed (iOS Photos' dismiss). Upward movement scrolls into the details
   natively. Ben's note said "up or down"; up was given to scrolling because a fast up-flick and a
   scroll begin identically and Chrome hands the touch to native scrolling mid-gesture — the
   exit would miss often enough to feel broken. **Escape** returns to the feed from anywhere on
   the screen; ←/→ page the rail; the pill's Feed button stays.
5. **The tile sheet gains "New collection…" and Share.** One shared inline-create row lands in
   every collection picker — the tile sheet, the item screen's save sheet, and the Collections
   sheet in place of its navigate-to-profile row. It expands into a name field and, where an item
   is in hand, files it in one go.
6. **The landing slideshow never stops.** It keeps its own rhythm forever, the sheet still rises
   after the first pass on today's schedule, and a click on the imagery or ←/→ steps one slide.
   Tap-to-skip goes — a click now means "next". The glyph opens and collapses the sheet, and its
   hydration bug is fixed.

## 1. The merged item screen

**Route.** `/i/[itemId]` stays the one public surface, with its OG metadata and the hero
`preload`. For an image it now also awaits the first eight of `items.galleryRail` — exactly what
`/g/` does today — and hands `ItemScreen` the rail. `/g/[itemId]` becomes a permanent redirect
to `/i/[itemId]`.

**Layout.** `ItemScreen` is a normal scrolling page (the viewport is the scroller, as everywhere):

```
<main>
  <HeroRail>            the three-cell rail strip, bg-immersive, at the very top
  <Column reader>       on bg-bg
    <ItemFacts>         title · maker · from · summary · facts (maker / from / license / topic) · link-out · PDR body
    <WanderNext>        "where Ambit would wander next", for the current item
    <JoinCta>           signed-out only
```

**The strip's height follows the picture.** No dimensions are stored on `item`, so each cell's
`<img onLoad>` records its natural ratio; the strip is `min(100dvh, viewportWidth × ratio)` on the
phone and `100dvh` above `md`, transitioned on advance so the details slide up under a square
image rather than jumping. Until the current picture's ratio is known the strip is `100dvh` — the
entry image is preloaded, so that is a frame; neighbours load off-screen before they arrive.
(Storing width/height on `item` would remove the frame; recorded as a follow-up, not done here.)

**Chrome placement follows the height.** When the strip is shorter than the viewport the title and
pill render *below* the picture as an ordinary block; when it fills the viewport they overlay the
bottom with the existing gradient. Both placements fade with the gallery's `visibility` +
`opacity` treatment — `visibility`, not `pointer-events`, for the reason the gallery's comment
gives (a descendant can override an ancestor's `pointer-events`; the pill does).

**Gestures.** The rail's horizontal machinery is unchanged (slop 8 px, 15 % drag or a 40 px flick
inside 300 ms, axis lock at slop). The track is `touch-action: pan-y` — the browser owns vertical
scrolling. The bottom-third "open details" zone goes with the sheet. The exit is a **downward**
flick (80 px inside 320 ms) that started with the page scrolled to the top; the slow far-drag exit
goes, because a slow downward drag at the top is iOS overscroll and the two would fight. Two-finger
movement still exits. `main` carries `overscroll-behavior-y: contain` so the flick is not also a
pull-to-refresh.

**Keyboard.** One `window` `keydown`: Escape → `leave()`, ←/→ → `advance(±1)`; suspended while a
sheet is open, where `BottomSheet` owns Escape. Articles get Escape only, in `ItemShell`.

**Leaving.** Every exit — Escape, the down-flick, the pill — is `useLeaveToFeed(entryItemId)`:
pop when the visit came from the feed (the intact feed, same tiles, same scroll, nothing
refetched), push `/feed?focus=` when it did not. `useExitGallery`'s `history.go(-2)` arithmetic
dies with `/g/`.

**The URL follows the rail.** On advance, `history.replaceState` to `/i/{current}` and the
document title with it — no navigation, no server round trip, the track animates — so the address
bar, a reload and the share sheet all name what is on screen. The feed-origin marker is keyed on
the *entry* item and is untouched, so backing out after ten swipes still pops to the feed.

**Data.** `RailItem` gains `body` (a PDR essay's text, rendered under the picture when swiped to)
and `topicLabel` (joined from `topic.label` — the details sheet resolves it from the sixteen-entry
`TOPICS` config today and prints a bare slug for any grown topic, which since sub-project 1 is
most of them). `items.wanderNext` becomes a client query keyed on the current item, with the
entry item's answer passed down as `initialData` (fresh for the query client's 30 s `staleTime`)
so a cold share link still pays zero client requests.
Swiping still marks nothing seen.

**Gone.** `gallery-screen.tsx`, `gallery-details-sheet.tsx`, `use-exit-gallery.ts`,
`gallery-origin.ts`, `hero-gallery-link.tsx`, `image-item-body.tsx` (its two halves become
`HeroRail` and `ItemFacts`), the `/g/` page body, `e2e/gallery.spec.ts` (folded into
`item.spec.ts`).

## 2. One New-collection row

`NewCollectionRow` lives beside `CollectionRow` in `sheets/collection-rows.tsx`: a faint
"New collection…" row that, on pick, becomes an inline name field (40 characters, Enter submits,
CONFLICT reads "You already have a collection with that name." inline — all lifted from
`new-collection-sheet.tsx`, which now renders this form too so there is one create form in the
app). It calls `saves.createCollection` and then `onCreate(collectionId)`:

| picker | `onCreate` |
|---|---|
| tile sheet (`item-sheet.tsx`, right-click / long-press) | files the item and toasts, as an existing row does |
| item screen's save sheet (`save-to-collection-sheet.tsx`) | files the current item |
| Collections sheet (`collections-sheet.tsx`) | invalidates and opens the new collection's list, as an existing row does |

The tile sheet also gains a **Share** row above the collections, opening the existing `ShareSheet`
for that item.

## 3. The living landing slideshow

`useSlideshow` wraps instead of ending: `index = (index + 1) % count`, forever, on the same
setTimeout chain. What used to be `onDone` at the end of the run is `onFirstPass`, fired once when
the first pass completes — the sheet rises on exactly today's schedule and the pictures keep
moving behind it. `advance(dir)` steps and restarts the slide timer; `skip()` fires `onFirstPass`
now (the glyph); `restart()` stays for collapse. The imagery's click is `advance(1)`; a `window`
`keydown` maps ←/→ to `advance(±1)` unless a form field has focus.

**The hydration fix.** `mode === "static"` stays in the lazy initializer; `prefersReducedMotion()`
moves to a `useSyncExternalStore` whose server snapshot is `false`, the same way `hydrated`
already works. The collapse handler is then identical on both sides of the boundary, and a
reduced-motion reader's static-ness flips one frame after hydration — which is what the existing
comment on the sheet already promises. Expected to also clear the production React #418 on `/`
(`docs/BUILD_PLAN.md`), to be confirmed in a production build in Firefox.

## 4. Testing

- **Unit:** `item-screen`, `hero-rail`, `item-facts` (the moved `ImageItemBody` cases plus the
  facts rows and their null-omission), `use-rail-gestures` (details-zone and up-exit matrices out,
  down-flick-at-top matrix in), `use-chrome-cycle.show`, `collection-rows` (expand / create /
  CONFLICT / Enter), one case per picker that the row files or navigates, `use-slideshow`
  (wraps, `onFirstPass` once, `advance` both ways), `landing-screen` (click advances and does
  not raise the sheet; arrows; arrows inert in a field; the collapse glyph is a button on both
  sides).
- **Playwright:** `gallery.spec.ts` folded into `item.spec.ts` — tile → item → swipe → Escape
  returns to the intact feed with zero `feed.page` requests (the corpus-preservation test, kept);
  `/g/` redirects; a signed-out visitor gets the picture, the facts and no pill. `desktop.spec.ts`:
  the hero fills the viewport height at 1440 with the details in the column. `feed.spec.ts`: a new
  collection can be made from the tile sheet. `home.spec.ts`: clicking the imagery changes the
  slide; the collapse glyph returns to the slideshow (the hydration regression test, under
  `e2e:prod`).

## Out of scope, recorded

- Tile hover zoom and focus outline; hover-over save; the detached share button; the desktop
  side rail; list screens — sub-project 3.
- Landing copy — Ben's.
- Storing image dimensions on `item`.
- The known-red `<details>` invariant row; the three-worker `feed.spec.ts:152` flake.
