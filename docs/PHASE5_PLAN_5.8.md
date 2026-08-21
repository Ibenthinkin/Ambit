# Phase 5.8 — Immersive gallery: detailed execution plan

**Status: ready to execute.** Written to be executed cold, by a session that has not read the
research behind it. Everything you need is in this document; where it says "verified", the claim
was checked against the repo, the prototypes, or the docs at plan time (08-21-26), not inherited.
You should not need to open the prototypes — every px/ms value they contribute is inlined below.

**What this phase is.** The signature screen: `/g/[itemId]`, a full-bleed, images-only,
zero-UI-until-you-ask-for-it gallery, entered by tapping the item page's hero (the doorway 5.7
deliberately left as a no-op). It swipes through a **wander rail** — an endless, bidirectional
sequence drawn by the same machinery as the item page's teaser: topic-graph walk chooses *where*,
curated-weighted random chooses *what*, and nothing is ever marked seen. Public like `/i/`, so a
stranger who cold-opened a shared link can fall into it too. Riding along: a **wildcard knob**
(dev-tunable serendipity dial in the rail draw — the future home of the ambit-archive flavour),
drag-to-close on `BottomSheet` (its header comment assigns it to 5.8), and the third-ever public
tRPC procedure.

**Source of truth.** `docs/BUILD_PLAN.md` 5.8 for scope — **except the pool source, which Ben
re-decided 08-21-26** (see decision 1 below; T8 updates BUILD_PLAN). Design from
`docs/design_handoff_ambit_pwa_redesign/Ambit - Gallery.dc.html` under the standing convention
that **prototypes win over the README** — this phase leans on that convention twice (decisions 2
and 8). Recreate, don't port.

**Done bar (BUILD_PLAN 5.8, adjusted for decision 1):** tap the item-page hero → gallery opens on
that work; swipe advances through an endless images-only rail with zero `seen_item` writes; chrome
hidden by default with the fade + auto-cycle; details sheet with drag-close + side-swipe-cycle;
exits behave per decision 5 (verified on iOS); works cold-opened and signed-out (no pill, no
protected queries); iOS "Add to Photos" on the item hero still works after the tap is wired.

**Reference reading before you start** (~15 minutes):

- `src/server/services/wander.ts` — the machinery T1 extends; its header states the public/anon
  posture the rail inherits.
- `src/components/item/image-item-body.tsx` — the hero you're wiring, and **the warning comment
  you must obey** (decision 6).
- `src/hooks/use-leave-to-feed.ts` + `src/components/feed/feed-origin.ts` — the pop-vs-push exit
  pattern T5 mirrors; the measured cost of getting it wrong.
- `src/components/ui/bottom-sheet.tsx` — header comment ends where T3 begins.
- `src/components/item/item-shell.tsx` — the authed-only pill/sheets/toast wiring T5 re-uses
  (including the `saveImage` handler to copy).
- `docs/PHASE5_WALKTHROUGH_5.7.md` — hazards from the adjacent screen, incl. the HTTPS device-pass
  setup (`tailscale serve`) that 5.8's share/save testing requires.

---

## Decisions locked with Ben 08-21-26 (do not relitigate)

1. **The rail is a wander rail, not the feed's image set.** BUILD_PLAN 5.8 said "over the feed's
   image set"; Ben re-decided: a new **public** procedure extends the wander machinery into an
   endless images-only rail seeded by the entry item. Public because the entry point is the hero
   on `/i/[itemId]` and the person tapping it may be a stranger; infinite by construction, which
   is what the prototype's 28-item wrap was imitating; and it **marks nothing seen** — swiping
   never burns corpus. (Fresh `feed.page` draws were rejected in writing: auth-only, and every
   swipe-through would re-create the corpus-burn defect removed on 08-20.)
2. **Entered from the item hero and Saved only — feed tiles keep opening item pages.** The
   redesign README's gesture matrix lists Feed as a gallery entry; the **feed prototype's own
   code** does not (verified: `Ambit - Feed Masonry 3.dc.html` `openItem()` sends image taps to
   `Ambit - Item Image.dc.html`; only the Saved and Item-Image prototypes call `openGallery()`).
   Prototypes beat the README, so BUILD_PLAN's "not feed tiles" stands and 5.6's shipped tile
   behaviour is untouched. Saved's entry lands in 5.9.
3. **Own route `/g/[itemId]`**, not an overlay over `/i/`. Deep-linkable, and the exit is a real
   history **pop** — 5.7 established that back/exit behaviour here is a correctness constraint (a
   pushed `/feed` draws a page of corpus), and an overlay would have to hand-roll a history entry
   to get the same result. The URL does **not** change while swiping (no history spam, no
   replaceState — out of scope); it names the entry item.
4. **Sharing from the gallery shares `/i/{currentItemId}`**, never `/g/` (the prototype does the
   same: `shareLink = 'ambit.link/i/' + cur().id`). `/i/` stays the canonical share surface with
   the OG metadata; `/g/` gets minimal metadata + `robots: noindex`.
5. **Exit semantics** (new — the prototype exits to the feed because it was *entered* from the
   feed; ours is entered from the item page):
   - **Hard swipe up / two-finger swipe** (and any future close affordance) **pop back to the
     entry surface** via a `gallery-origin` marker mirroring `feed-origin` — today that's
     `/i/{entryId}`, in 5.9 it will be Saved, and the pop is entry-agnostic. Cold-opened `/g/`
     (no marker): **push** `/i/{entryId}` instead — there is nothing behind the page to pop to.
   - **The pill's Feed button still reaches the feed**: `history.go(-2)` when both origin markers
     line up (stack is `…feed → /i/x → /g/x`; lands on the intact feed, zero draws), else the
     documented cold-open path `router.push('/feed?focus={entryId}')`.
6. **Hero tap mechanism**: a slop-guarded pointer handler on a small client wrapper — **not** a
   `<Link>`/`<a>` (an anchor changes the iOS long-press callout and risks the native
   **"Add to Photos"** path bought on 08-20), and **not** the feed tile's
   `-webkit-touch-callout: none` incantations. The warning comment in `image-item-body.tsx` is
   the law here; the device pass re-verifies the callout after wiring.
7. **Wildcard knob, re-grounded.** There is no ambit-archive adapter in this repo (verified:
   `src/server/services/sources/` holds aic/cma/met/wellcome/wikipedia only; "archive items" are
   labelling support in `source-label.ts`, no rows). The knob is `wildcardChance`: the probability
   a rail slot ignores the topic walk and draws corpus-wide, preferring a `WILDCARD_SOURCES`
   config list that is **empty today** — a tunable serendipity dial now, and archive items slot
   straight into it when that integration lands. Default **0.1**. Client overrides honored only
   under the server's `FEED_DEBUG` gate, exactly like `feed.page`'s knobs.
8. **No double-tap.** The README's gesture matrix says "double-tap → details"; the prototype codes
   **tap-again**: a tap with chrome hidden shows chrome, a tap with chrome up opens details, and
   the hint copy says "Tap again, or the title, for details" (verified: `onUp()`'s
   `if (this.state.chromeVisible) this.openDetail(); else this.toggleChrome()`). Prototypes win.
9. **Details facts mapping.** The prototype's Medium / Origin / Where-it-lives fields don't exist
   in the schema (verified: `item` carries `attribution`, `license`, `source`, `sourceUrl`,
   `topicId`, `summary`). Facts rows become: **Maker** (`attribution`, row omitted when null),
   **From** (`sourceLabel(source)` linking `sourceUrl`), **License** (omitted when null),
   **Topic** (label from `TOPICS`). Description under the table = `summary` (omitted when null).
   Omit a row rather than render an empty value.
10. **`BottomSheet` grows** optional drag-to-close, a side-swipe callback, and a `gallery`
    animation variant (T3) — additive props, every existing call site unchanged.

## House rules that apply throughout (verified, same as 5.7)

- `bun run check` is the full gate; e2e via `bun run e2e` (Playwright outputDir
  `./.playwright/test-results` — load-bearing, don't change it).
- Plain `<img>` always, never `next/image`. Tailwind v4 CSS-first tokens in
  `src/styles/globals.css` — the ones this phase uses **already exist** (verified):
  `--color-immersive` (#0b0a08, "gallery only"), `--color-surface` (#1b1815),
  `--animate-sheet-gallery` (0.4s `var(--ease-settle)` = cubic-bezier(.22,.61,.36,1)),
  `--animate-sheet-up`/`--animate-sheet-down`, `--shadow-sheet`. Sora font.
- DB repo files dynamic-import `./client` inside the function body (envless CI — see the comment
  in `drawFromTopic`); integration tests self-skip without `DATABASE_URL`.
- `/g/*` must stay **out** of `src/proxy.ts`'s matcher (currently
  `["/feed/:path*", "/saved/:path*", "/onboarding/:path*"]` — verified; do not add `/g`).
- Auth boundary in client form: protected queries get `enabled: authed`; anon must never collect
  an UNAUTHORIZED in the console (pattern: `item-shell.tsx`).
- Component tests: jsdom via a first-line `// @vitest-environment jsdom` docblock; mock patterns
  in `use-leave-to-feed.test.ts` (next/navigation), `feed-screen.test.tsx` (tRPC react mock),
  `routers.test.ts` (`createCaller` + `anonContext()`).
- Comment generously — the repo teaches.

---

## Tasks

T1, T3, T4 are mutually independent (disjoint files) — any order, each its own commit with
`bun run check` green. T2 needs T1. T5 needs T2+T3+T4. T6 needs T5 (the route must exist before
the hero points at it). T7 needs T6. T8 last.

### T1 — Rail service: `gallery-rail.ts` + db support

**Create** `src/server/services/gallery-rail.ts` + `gallery-rail.test.ts`,
`src/server/config/wildcard-sources.ts`. **Modify** `src/server/db/items.ts`.

1. **`drawFromTopic` gains a `type` filter**: optional `type?: "image" | "article"` in its options;
   when present push `eq(item.type, opts.type)` into `conditions` (next to the `scoreFloor`
   condition). Existing callers pass nothing and are unchanged.
2. **`drawImageAnywhere`** (new, `db/items.ts`): the corpus-wide draw the wildcard needs.
   `drawImageAnywhere({ scoreFloor, excludeIds, limit, sources, rng })` — same shape as
   `drawFromTopic` minus `topicId`, plus optional `sources: string[]` (`inArray(item.source, …)`
   when non-empty); always `eq(item.type, "image")`; same suspended-source guard, same
   curated-weighted `weightedSampleWithoutReplacement` tail, same dynamic `./client` import.
3. **`wildcard-sources.ts`**: `export const WILDCARD_SOURCES: string[] = []` with a header
   explaining decision 7 — empty today, ambit-archive's slug lands here when that integration
   ships, and the rail's wildcard draw prefers these sources when the list is non-empty.
4. **`gallery-rail.ts`**, same pure-core/impure-shell split as `wander.ts` (read its header first;
   the rail inherits its public/anon posture — no `userId` parameter exists, by construction):
   - `export const RAIL_KNOBS = { wildcardChance: 0.1 }` (+ a `GalleryKnobs` type; the only knob
     for now — more only if a feel-tuning session asks).
   - Pure `pickRailTopics(startTopicId, graph, rng, count, knobs)`: a walk producing `count`
     `{ topic, via }` entries where `via` is `"stay" | "drift" | "jump" | "wildcard"`. Per slot:
     first roll `rng() < knobs.wildcardChance` → `wildcard` (topic irrelevant; the walk does
     **not** advance). Otherwise draw a tier using the feed's own shares — verified:
     `DEFAULT_KNOBS` (`~/server/services/feed`) exports `tierCore: 40`, `tierDrift: 35`,
     `tierJump: 25` (plus the `temp` and `scoreFloor` this task also uses); weight the roll with
     those three values, don't restate the numbers. `stay` → current topic; `drift` →
     near hop (softmax over the positive-sim head of the graph row with
     `Math.exp(sim / DEFAULT_KNOBS.temp)` — same two-line local copy as `pickWanderTopics`, same
     "change it in both places" comment); `jump` → uniform over the far half of the row
     (`row.slice(Math.floor(row.length / 2))`). Drift and jump **advance the walk** (the rail
     drifts away from the entry the way the feed drifts down a page); a missing/empty graph row
     degrades to `stay`.
   - Impure `getGalleryRail(anchorItemId, { count = 8, excludeIds = [], rng = Math.random,
     knobs = RAIL_KNOBS })`: `getItemById(anchor)` (missing → `[]`); walk from `anchor.topicId`;
     per entry: `wildcard` → `drawImageAnywhere` preferring `WILDCARD_SOURCES` (when the preferred
     draw returns nothing — always, today — fall through to a source-unrestricted call); others →
     `drawFromTopic(topic, { type: "image", scoreFloor: DEFAULT_KNOBS.scoreFloor, excludeIds:
     [anchorItemId, ...excludeIds, ...drawnSoFar], limit: 1, rng })`. Empty topic pool → retry
     the anchor's own topic; still empty → `drawImageAnywhere`; still empty → **stop and return
     what you have** (thin corpus; the client treats a short batch as "this end is exhausted").
     The fallback chain is what makes the rail deterministic enough for the seeded one-topic e2e
     corpus.
   - Return `RailItem[]`: `{ id, title, attribution, imageUrl, summary, source, sourceUrl,
     license, topicId }` + `debug?: { via, topic }` **only when the server debug flag is on**
     (same gate `feed.ts` uses to populate `card.debug` — find it there:
     `env.FEED_DEBUG ?? env.NODE_ENV === "development"`). All fields are public item data —
     `items.byId` already returns the full row to anon — but nothing user-shaped exists to leak.
   - Tests (pinned rng — `mulberry32`/`hashSeed` from `~/server/services/random`, as
     `wander.test.ts` does): wildcard fires at the expected rate under a forced-value rng; walk
     advances on drift/jump and holds on stay/wildcard; missing graph row degrades to stay; shell
     (mocked `db/items`): images-only options passed through, anchor never returned, fallback
     chain order (topic → anchor topic → anywhere), short-batch stop, `debug` present/absent by
     flag.

### T2 — Router: `items.galleryRail` (the third public procedure)

**Modify** `src/server/api/routers/items.ts` (its header currently says the router holds "both"
public procedures — reword to three), `routers.test.ts`, `routers.integration.test.ts`.

- `galleryRail: publicProcedure.input(z.object({ itemId: z.string(), count:
  z.number().int().min(1).max(16).default(8), exclude: z.array(z.string()).max(200).default([]),
  knobs: z.object({ wildcardChance: z.number().min(0).max(1) }).partial().optional() }))
  .query(...)` → `getGalleryRail(input.itemId, { count, excludeIds: input.exclude, knobs })`,
  with knob overrides **honored only when the server debug flag is on** — mirror how
  `routers/feed.ts` gates `input.knobs` (accepted always, applied conditionally, never an error).
  The `exclude` cap at 200 bounds the SQL IN-list; a rail longer than 200 accepts rare repeats
  (comment this).
- Comment: public for the same reason as `wanderNext` (the gallery opens from the public
  `/i/[itemId]`); covered by the shared rate-limit middleware; **draws are reads — no `seen_item`
  writes on this path, ever** (the 08-20 corpus-burn postmortem is why this sentence exists).
- **Router tests**: works anon (the boundary test in the public direction — mock the service);
  knobs forwarded only under debug (spy on the service, flip the gate the same way the feed
  router's own test does — read it first).
- **Integration tests** (self-skip without `DATABASE_URL`): seeded corpus → rail returns only
  `type: "image"` rows; never the anchor; respects `exclude`; **`seen_item` row count is
  identical before and after a rail call**; a `count: 3` call returns ≤3.

### T3 — `BottomSheet`: drag-to-close, side-swipe, gallery variant

**Modify** `src/components/ui/bottom-sheet.tsx` + `bottom-sheet.test.tsx`. Additive only — every
existing call site compiles and behaves unchanged. Read the header comment first; it ends by
assigning exactly this work to 5.8; rewrite it as done.

New optional props:

- `variant?: "pill" | "gallery"` (default `"pill"`). `gallery` swaps the enter/exit animations to
  `--animate-sheet-gallery` (exit: the same keyframes reversed — add `--animate-sheet-gallery-out`
  to `globals.css`, 0.3s, mirroring how `--animate-sheet-down` pairs with `-up`) and the panel
  styling the details sheet needs: `rounded-t-[26px]` (deliberately larger than
  `--radius-sheet`'s 22px — prototype value, inline it), `max-h-[80%]`, `overflow-y-auto`,
  top border `0.5px rgba(239,235,224,0.12)`, shadow `0 -12px 50px rgba(0,0,0,0.5)`, scrim
  `rgba(9,8,6,0.66)` + `backdrop-blur-[3px]`. Background stays `bg-surface` — the prototype's
  `#1B1813` vs the token's `#1b1815` is below perception; the token wins.
- `dragToClose?: boolean` (default false). Pointer handlers on the panel: a `pointerdown` within
  the top **64px** of the panel arms the grabber drag; `pointermove` live-follows downward only
  (`translateY(max(0, dy))`, no transition while dragging); `pointerup` with `dy > 56` → close,
  else snap back (`transform .3s cubic-bezier(.22,.61,.36,1)`).
- `onSwipeSide?: (dir: 1 | -1) => void`. On `pointerup` where `|dx| > |dy| && |dx| > 48`: close
  **and** call it (`dir = 1` for a leftward swipe — "next"). The gallery uses it to cycle; no
  other sheet passes it.

Tests: pill-variant snapshot/behaviour unchanged (the existing suite is the proof — it must pass
untouched); gallery variant renders the animation class; drag beyond 56px closes, under snaps
back; side-swipe closes + calls back with the right sign; `dragToClose` off → handlers absent.

### T4 — Gesture + chrome hooks

**Create** `src/hooks/use-rail-gestures.ts` + test, `src/hooks/use-chrome-cycle.ts` + test.

1. **`useRailGestures(opts)`** — the prototype's pointer state machine, as a hook returning
   `{ handlers, dragPx, dragging }` for the track div (which carries `touch-action: none` and
   spans the screen). Callbacks: `onTap`, `onAdvance(dir: 1 | -1)`, `onOpenDetails`, `onExit`.
   Constants, verbatim from the prototype:
   - Movement slop: 8px (`moved` flips when `|dx| > 8 || |dy| > 8`).
   - Multi-touch: track active pointer ids in a Set; a second concurrent pointer marks the whole
     gesture `multiTouch`; on release, `multiTouch && moved` → `onExit()`.
   - Horizontal drag: only while `|dx| >= |dy|` and single-finger — expose `dragPx = dx` live;
     otherwise `dragPx = 0`.
   - Release: vertical (`|dy| > |dx|`), upward, started in the **top two-thirds** of the track,
     and *hard* (`|dy| > 150`, or `|dy| > 80` within 320ms) → `onExit()`. Vertical, upward,
     started in the **bottom third**, `|dy| > 60` → `onOpenDetails()`. Not moved → `onTap()`.
     Else horizontal: `|dx| > width * 0.2` (measure the track's `offsetWidth`) → `onAdvance(dx <
     0 ? 1 : -1)`; under threshold → snap back (dragPx returns to 0, transition owned by the
     caller).
   - Native listeners on a ref'd node (pattern: `use-swipe-back.ts` — read it first; this hook is
     its bigger sibling and should feel like the same author), cleaned up on unmount, never
     `preventDefault` on move.
   - jsdom tests (mirror `use-swipe-back.test.tsx`'s PointerEvent dispatch): tap fires only
     without movement; slop respected; 20%-width commit each direction; sub-threshold snap-back;
     hard-swipe-up from top two-thirds exits, slow-up from bottom third opens details; two-finger
     exits; vertical drag never leaks into `dragPx`.
2. **`useChromeCycle()`** → `{ visible, toggle, reset }`. Starts hidden; a 10s timer flips
   visibility each phase (10s hidden, 10s shown, repeat); `toggle()` flips immediately and
   restarts the timer from the new state; `reset()` hides immediately and restarts (called on
   every image change — prototype behaviour). Timer cleared on unmount. Tests with
   `vi.useFakeTimers()`: auto-cycle at 10s boundaries; toggle restarts phase; reset hides.

### T5 — The screen: route, rail state, chrome, details, pill

**Create** `src/app/g/[itemId]/page.tsx`, `src/components/gallery/gallery-screen.tsx`,
`gallery-screen.test.tsx`, `src/components/gallery/gallery-details-sheet.tsx`,
`src/components/gallery/gallery-origin.ts` + `gallery-origin.test.ts`,
`src/components/gallery/use-exit-gallery.ts` + test.

**`page.tsx`** (RSC, public — the same session-only-decides-chrome shape as `/i/`):

- `await params`; `getItemById` (React-`cache`d, as `/i/` does); `notFound()` on miss **or when
  `item.type !== "image"`** (articles have no business here; a crafted `/g/{articleId}` link 404s).
- `generateMetadata`: title `` `${item.title} · Ambit` ``, `robots: { index: false }` (decision 4
  — `/i/` is canonical), nothing else. No OG block.
- Session via `auth.api.getSession({ headers: await headers() })` — decides `authed` only.
- First batch server-side: `api.items.galleryRail({ itemId, count: 8 })` via the server caller
  (`~/trpc/server`) → pass to the client as `initialRail`, entry item first: the entry item's own
  row (build a `RailItem` from the item — same fields) followed by the 8 drawn.
- Render `<GalleryScreen entryItem={…} initialRail={…} authed appUrl={env.BETTER_AUTH_URL}
  viewerName={…} />` — same prop derivations as `/i/`'s page (verified in `item-shell.tsx`).

**`gallery-origin.ts`** — a deliberate parallel of `feed-origin.ts` (~15 lines; do not refactor
the shipped, measured original into a shared factory — a pointer comment each way instead):
`markGalleryOrigin(itemId)` / `cameFromApp(itemId)`, key `"ambit.galleryOrigin.v1"`, same
try/catch story (Safari Lockdown), same sessionStorage-not-module-state reasoning.

**`use-exit-gallery.ts`** — `useExitGallery(entryItemId)` → `{ exit, toFeed }`:

- `exit()`: `cameFromApp(entryItemId) ? router.back() : router.push('/i/' + entryItemId)` —
  decision 5's first bullet, with the same read-at-call-time-never-at-render comment as
  `use-leave-to-feed.ts`.
- `toFeed()`: both markers (`cameFromApp(entry) && cameFromFeed(entry)`) → `history.go(-2)`
  (comment the stack: `…feed → /i/x → /g/x`); else `router.push('/feed?focus=' + entryItemId)`.
  `cameFromFeed` from `~/components/feed/feed-origin`.
- Tests: the four marker combinations (mock next/navigation + real markers, pattern
  `use-leave-to-feed.test.ts`; stub `history.go`).

**`GalleryScreen`** (client) — the composition:

- **Container**: full-bleed `bg-immersive` `overflow-hidden`, height `100dvh`, no scrolling.
- **Rail state**: `items: RailItem[]` seeded from `initialRail` with `entryIndex` pointing at the
  entry item; a virtual `index` into it. Fetch-more when `index` comes within 3 of either end:
  `api.useUtils().items.galleryRail.fetch({ itemId: outermostIdOnThatEnd, count: 8, exclude:
  last-200 ids in the list })`, append or prepend. A batch shorter than requested marks that end
  **exhausted**: swiping past the last loaded cell snaps back (rubber-band, no advance) instead
  of wrapping — the corpus-thin degradation. In-flight guard per end (one fetch at a time).
- **Track**: the T4 hook drives a 300%-wide flex rail of three cells (`flex: 0 0 33.3333%`,
  `height: 66.6667%`, `padding: 56px 16px 0`, contents centered), rendering `items[index-1..
  index+1]` (absent neighbour → empty cell). `transform: translateX(calc(-33.3333% +
  ${dragPx/width*33.3333}%))`; transition `none` while dragging, else `.4s
  cubic-bezier(.22,.61,.36,1)`; `will-change: transform`. Images: plain `<img>`,
  `object-contain`, `rounded-[12px]`, `max-width/height: 100%`, `alt={title}`,
  `pointer-events: none` on the img (the track owns the pointer); src = the `data:` bypass else
  `/api/img/{id}` (same branch as `image-item-body.tsx` — copy its comment pointer).
  `onAdvance` bumps `index` and calls `chrome.reset()`.
- **Chrome** (all of it fades as one unit — opacity + `translateY(10px→0)`, `.6s ease`,
  `pointer-events: none` while hidden — an invisible control must never be hit):
  - Top scrim: 120px, `linear-gradient(to bottom, rgba(11,10,8,0.55), transparent)`.
  - Bottom block over `linear-gradient(to top, rgba(11,10,8,0.94) 42%, transparent)`, padding
    `26px 24px 42px`: title Sora 22px/1.24 `#F5F1E7`; maker 12.5px `rgba(239,235,224,0.52)`
    `mt-[7px]` tracking `0.15px` (= `attribution ?? sourceLabel(source)`, as the item page's
    maker line); hint row `mt-[14px]` — 12px info glyph + "Tap again, or the title, for details"
    11px `rgba(239,235,224,0.34)`; then the pill centered `mt-[20px]`.
  - Tapping the title/maker block opens details (`stopPropagation` so the track doesn't also
    treat it as a chrome toggle).
  - `useChromeCycle` wiring: `onTap` → chrome visible ? open details : `toggle()` (decision 8).
- **Pill**: `PillToolbar` (verified props: `bookmark`, `onBookmark`, `onShare?`, `onHome?`) —
  **authed only**, with `onHome={toFeed}` (decision 5 — NOT the default `/feed` push), share +
  bookmark opening the two sheets, bookmark state from `api.saves.forItem.useQuery({ itemId:
  currentItem.id }, { enabled: authed })`. Signed-out: no pill, no sheets, no protected queries —
  the chrome is just title/maker/hint ("leaving is not a privilege", and neither is looking).
- **Sheets + toast**: re-use `SaveToCollectionSheet` / `ShareSheet` and the toast wiring by the
  same pattern as `item-shell.tsx` — including copying its `saveImage` handler (fetch
  `/api/img/{id}` → `navigator.share({files})` → `<a download>` fallback) — but keyed to the
  **current** item, and `ShareSheet.url` = `` `${appUrl}/i/${currentItem.id}` `` + the
  `?from=` viewer-name suffix (decision 4). `imageContext` is always true here.
- **Details sheet** (`gallery-details-sheet.tsx`, on T3's `BottomSheet variant="gallery"
  dragToClose onSwipeSide={(dir) => advance(dir)}`): grabber (BottomSheet's own); title Sora
  25px/1.18 `#F5F1E7`; maker 12.5px in `text-accent` `mt-[8px]` tracking `0.3px`; facts table
  per decision 9 — rows `py-[11px]` over `0.5px rgba(239,235,224,0.08)` top borders, label column
  `88px` 11px/600 tracking `0.6px` uppercase `rgba(239,235,224,0.4)`, value Sora 15.5px/1.45
  `rgba(239,235,224,0.82)` (the From row's value is a link to `sourceUrl`, accent); description
  16px/1.6 `rgba(239,235,224,0.72)` `mt-[18px]`; footer hint `mt-[26px]` centered at 40%
  opacity: "Tap or swipe down to close · swipe sideways to keep browsing". Tapping the sheet body
  closes it (prototype behaviour; BottomSheet's scrim-close covers the rest). When a rail item
  carries `debug`, append one small fact row `Debug` with `via · topic` — the gallery's slice of
  SPEC §9's standing dev-overlay rule.
- **Exit gestures**: the T4 hook's `onExit` → `exit()`.
- Haptic nicety from the prototype: `navigator.vibrate?.(10)` when details open (guard, it's
  Android-only; wrap in try/catch as the prototype does).

Component tests (jsdom; tRPC mock pattern from `feed-screen.test.tsx`, fake timers for the
cycle): renders entry image; tap toggles chrome, second tap opens details; advance updates
title + resets chrome; fetch-more fires near the end with the outermost anchor + capped exclude;
exhausted end clamps; signed-out renders no pill and fires no protected query; share URL points
at `/i/{current}`.

### T6 — Entry wiring: the hero tap

**Create** `src/components/item/hero-gallery-link.tsx`. **Modify**
`src/components/item/image-item-body.tsx` (+ its test if assertions pin the hero's wrapper).

- A small client component wrapping the hero `<img>`: `usePress` (`~/hooks/use-press`, the
  ≤12px-slop tap hook from 5.5) with **tap only** — no long-press handler, nothing that calls
  `preventDefault`, and **no `-webkit-touch-callout` anywhere** (decision 6; the warning comment
  in `image-item-body.tsx` explains why — update it from "until 5.8 wires it" prose to present
  tense, keeping the Add-to-Photos account intact). On tap: `markGalleryOrigin(item.id)` then
  `router.push('/g/' + item.id)`.
- Render it only when the item has an `imageUrl` (the hero already conditionally renders).
  `cursor-pointer` now earns its place. Keep the `<img>` itself untouched.
- The RSC (`image-item-body.tsx`) imports the client wrapper — verify the file keeps no
  `"use client"` of its own (server component with a client child is the standard split).

### T7 — e2e: `e2e/gallery.spec.ts` + `item.spec.ts` touch-ups

Copy `e2e/item.spec.ts`'s scaffolding (it seeds `source: "e2e"` items with data-URI pixels,
timestamped user, afterAll cleanup — and runs its public checks signed-out by design; read its
header note about hydration waits before writing any). Seed ~6 **image** items with data-URI
pixels across two real topic ids, `curationScore: 9`, plus the article item it already seeds.

1. **Cold-open, signed-out**: `/g/{imageId}` renders — entry `<img>` with `alt` = title visible;
   no pill (`Save to collection` count 0); no console errors (mirror the smoke pattern).
2. **Chrome + details**: click the stage → title chrome appears; click again → details sheet with
   the From row linking the seeded `sourceUrl`; click the sheet body → closes. (A click is a tap:
   no movement, so the slop guard passes.)
3. **Entry + exit**: signed in, from `/feed` tap a tile → `/i/{id}`, tap the hero → URL is
   `/g/{id}`; pill's Feed control → lands on `/feed` (the `go(-2)` path; assert URL and that the
   request log drew no new `feed.page` — reuse `feed.spec.ts`'s request-filter technique).
4. **Article guard**: `/g/{articleId}` → 404.
5. **No corpus burn**: after the gallery session, `seen_item` count for the e2e user is unchanged
   by gallery activity (query via the same Drizzle connection the spec already opens).
6. **`item.spec.ts`**: the hero now navigates — add the tap-through assertion to the authed flow;
   check no existing assertion pins the hero as handler-less (5.7's spec asserted content, not
   absence of handlers — verify by reading, adjust only if something pins it).

Spec header note (same reasoning as 5.7's): rail swipes, hard-swipe-up, two-finger exit, and
drag-to-close are unit-tested in T3/T4 and verified in the device pass — Playwright's mouse API
doesn't compose multi-pointer/velocity gestures reliably.

### T8 — Docs

- **SPEC §7 table**: add `items.galleryRail` (query, public, input/output shapes, the FEED_DEBUG
  knob gate, "no seen_item writes"). Grep for "two public" / "both" — T2's router header, §7's
  bullets, and §11 all counted two public procedures; there are now three.
- **SPEC §8.1**: add `/g/[itemId]` — public, images-only (article ids 404), noindex, exit
  semantics (decision 5), entered from the item hero (and Saved, 5.9).
- **SPEC §9**: a short "gallery rail" note — wander machinery extended, stay/drift/jump shares,
  `wildcardChance` + `WILDCARD_SOURCES`, reads-only.
- **BUILD_PLAN 5.8**: rewrite the entry — pool source corrected to the wander rail (decision 1,
  dated), entries per decision 2, the decisions list (3–10 above, compressed), status + device
  pass result.
- **`log.md`** per its trigger rules (session-spend script; never estimate).

---

## Verification

1. Per task: `bun run check` green before each commit.
2. After T7: `bun run e2e` — three consecutive green runs (the repo's flake bar).
3. Manual dev pass: from `/feed`, tile → item → hero → gallery; swipe both directions past the
   first batch boundary (fetch-more fires, no jank); chrome auto-cycle observed both ways; details
   via tap-again, title tap, and slow swipe-up; drag-close live-follows; side-swipe cycles;
   wildcard knob visible in draws with `FEED_DEBUG=true` and a raised `wildcardChance`; signed-out
   incognito `/g/{id}` clean.
4. **iOS device pass over the HTTPS origin** (`tailscale serve --bg 3000` — share/clipboard are
   secure-context-only; the LAN origin cannot test them):
   - Rail swipe feel; 20% threshold; chrome fade; tap-again → details; slow-up vs hard-up
     distinguished; two-finger exit.
   - Exit pops to the item page with its state intact; pill Feed lands on the intact feed
     (scroll position preserved, zero draws).
   - **Long-press on the item hero still offers "Add to Photos"** after T6 — this is the single
     most likely regression of the phase; the warning comment exists because the obvious
     implementation breaks it.
   - Save-to-collection, share, and Save image from inside the gallery.
5. Corpus check: after a long gallery session on a real account, `seen_item` count unchanged.

## Out of scope (resist)

- Saved's gallery entry and collection rails — 5.9.
- URL sync while swiping (`replaceState` to `/g/{currentId}`) — decided against; revisit only if
  refresh-mid-session turns out to matter.
- Ambit-archive integration itself — `WILDCARD_SOURCES` stays empty; the knob is the doorway,
  not the feature.
- OG metadata for `/g/` — `/i/` is the share surface.
- Image preloading/resizing beyond the browser's own (IIIF sizing and CDN caching are 7.3).
- The 60 items stranded on `topic_id = test-feed-topic-*` and the AIC Cloudflare challenge
  (`HANDOFF_aic-images.md` §8) — both predate this phase and neither blocks it.
