# Phase 5.6 walkthrough — feed masonry

**Executed 08-17-26** against `docs/PHASE5_PLAN_5.6.md`, on branch `phase-5.6-feed-masonry`.
The plan was written to be executed cold and very nearly was: nine steps, all of them landed
roughly as specified. What follows is the record of what shipped, the four places reality argued
with the plan, and the findings — two of which cost real time and are worth not re-learning.

**Status: code complete, one item outstanding — the on-device pass** (see the end).

---

## What shipped

**The screen.** `/feed`'s throwaway placeholder is gone. In its place, an infinite two-column
masonry of the feed engine's output: square-cornered full-bleed image tiles, article cards, and an
occasional "Because" serendipity tile. Tap opens the item page, long-press opens the item sheet,
and the floating pill carries the feed's own wiring.

**New files**

| File | What it is |
|---|---|
| `src/components/feed/masonry.ts` | The layout brain, pure and DB/React/DOM-free: `buildTiles` + `packColumns`. |
| `src/components/feed/feed-screen.tsx` | The client screen — infinite query, columns, sentinel, pill, sheets, toast. |
| `src/components/feed/image-tile.tsx` | Image only. No border, no title, no chrome. |
| `src/components/feed/article-card.tsx` | Eyebrow / headline / lede, with a press-scale. |
| `src/components/feed/because-tile.tsx` | Inert from→to caption for the card below it. |
| `src/components/feed/debug-badge.tsx` | SPEC §9's dev overlay, in its cheapest form. |
| `src/components/feed/use-feed-scroll.ts` | `?focus=` return-scroll + session scroll restore. |
| `src/components/sheets/item-sheet.tsx` | The long-press sheet — "Closer Look" + save-to-collection. |
| `src/app/i/[itemId]/page.tsx` | **Interim stub**, replaced wholesale in 5.7. |
| `src/lib/source-label.ts` | `aic` → "Art Institute of Chicago". |
| `src/app/dev/tokens/sign-out-button.tsx` | Sign-out's interim home. |
| `e2e/feed.spec.ts`, `e2e/support.ts` | The feed suite, and the shared hydration/sign-in helpers. |

**Changed:** `PillToolbar.onShare` is now optional (absent ⇒ no share glyph); `BottomSheet` gained
an `animation="sheet" | "menu"` prop; `globals.css` gained `--animate-menu-rise`/`-drop`;
`src/test/setup.ts` stubs `IntersectionObserver`; `/feed/page.tsx` became the RSC shell — the
repo's **first-ever consumer of `src/trpc/server.ts`**, which had existed unused since Phase 1.

**Tests:** 328 unit/integration (was 288 at the start of this phase, 268 at 5.5's close), 14 e2e
(was 7). `bun run check` and `bun run build` clean.

---

## The four places reality argued with the plan

### 1. Article ledes had to be clamped — the prototype's fixture lied about the data

The plan specifies the lede as `item.summary`, straight through, with no clamp; the prototype does
the same. That works because every lede in the prototype's fixture is hand-written editorial copy
of a sentence or two. The `summary` column is not that: it holds whatever synopsis the source
provides, and Wikipedia's routinely runs 600+ characters. Rendered verbatim in a 196px column, the
first real article card was **twenty-five lines tall** — a wall of text next to a wall of pictures,
and the "no body, no expand affordance" rule broken by accident, because at that length the lede
*is* the body.

`ArticleCard` now carries `line-clamp-5`, which leaves the prototype's own longest lede untouched,
and `masonry.ts`'s height estimate caps its lede-line count at the same five so the packer still
predicts the tile it's placing. Both sides carry a comment pointing at the other; there's a unit
test asserting a 150-character and a 3000-character summary produce identical packing.

This one is only findable by running the thing against the real corpus, which is the argument for
doing the browser pass before writing the walkthrough rather than after.

### 2. `?focus=` cannot work through the stub's Back link — and that's not a bug in `?focus=`

Step 7's return-scroll assumes that returning to `/feed` shows you the feed you left. Verified in
Chrome, it does — but only on **browser back**, where the App Router restores `/feed`'s RSC payload
from the client router cache and the tiles are all still there. Following a fresh
`<Link href="/feed?focus=…">` re-runs the server component, and `getFeedPage` never repeats items,
so the feed you land on is made of **entirely different cards**. The focused tile is genuinely
gone. (It also costs a page of corpus.)

Measured, on the two paths:

| Return path | Feed preserved? | Where you land |
|---|---|---|
| Browser back | yes — same 24 tiles | exactly where you were (628 → 628) |
| Stub's `<Link>` to `?focus=` | no — 24 new tiles, old one absent | falls back to the remembered offset |

So the mechanism is correct and its substrate is real, but the stub's Back link is the one path
that can't use it. Left as the plan specified, because 5.7 owns the real back gesture and the
evidence above says what it should be: **pop history, don't push a new entry**. Recorded in
`use-feed-scroll.ts`'s header so 5.7 doesn't rediscover it.

### 3. Two scroll-restore races, both invisible without a browser

The first restore implementation looked right and restored to `0` every time. Two separate causes,
each worth remembering:

- **The document is short when the effect runs.** `scrollTo({top: 900})` on a page that is
  currently 400px tall silently clamps and lands near the top. The focus path already had a retry
  schedule; the restore path had none, and needed the same. It also has to check *where it actually
  ended up* rather than assume the scroll took.
- **The persist listener ate its own tail.** A clamped restore scrolls the page, which fires
  `scroll`, which writes the clamped offset over the saved one — so by the second attempt there was
  nothing left to restore to. Persistence is now suppressed until the restore sequence settles.

Neither is reachable from jsdom, which has no layout at all. The unit tests cover the mechanism
(does it look, does it retry, does it fall back); the numbers came from Chrome.

### 4. An error state the plan's copy table doesn't have

`FeedScreen` renders "Couldn't load the feed." with a Try again button when the query errors.
Without it, a failed fetch falls through to "Nothing here yet. Check back soon." — telling the user
their feed is empty when in fact the request died. That's the same hazard 5.5's required `onError`
prop exists to prevent, so it seemed wrong to leave the screen with a silent version of it.

---

## The e2e detour, which was two real bugs wearing a flake costume

The feed suite passed serially and failed under parallel workers, in a different test each run,
always on sign-in, always by timing out on `waitForURL("/feed")`. The recorded house wisdom ("a
first-run failure after a change is usually on-demand compilation — re-run before debugging") sent
me around the loop twice before I stopped guessing and read a trace. There were two causes, and
neither was the app being flaky.

**`test-results/` was triggering Fast Refresh.** Playwright's default output directory sits in the
project root, and it writes traces and error-context files *while tests are still running*. Next's
dev watcher sees those writes as project changes and rebuilds; the failing run's trace has
`[Fast Refresh] rebuilding` sitting exactly where the navigation should have been. A remount mid
sign-in swallows `router.push("/feed")`. Fixed by moving `outputDir` to `./.playwright/test-results`
— Turbopack ignores dot-directories, so the watcher never sees it.

**The landing form natively submits before hydration.** With that fixed, the failures moved to a
different test and the trace showed the real tell: `navigated to "http://localhost:3000/?"`. The
auth card is a real `<form onSubmit={…}>` with a `type="submit"` button, so a click that lands
before React attaches goes through the browser's *native* form handling — a GET to `/?` that
reloads the page and discards the typed values. The suite had simply never had enough parallel load
to lose that race before 5.6 added seven more tests.

Fixed at the test layer with `waitForHydration()` in `e2e/support.ts`, which polls for React DOM's
own `__reactFiber$` / `__reactProps$` keys on the form — the most direct available signal that the
handlers are live, and cheaper than a guessed `waitForTimeout`.

**Worth flagging, not fixed here:** the underlying behavior is a genuine (if minor) landing-page
defect. A real user on a slow connection who types fast and hits Enter gets a page reload and an
empty form, with no explanation. It belongs to the auth screens (5.2's work), not the feed, so 5.6
records it rather than reaching across to change it. Three consecutive clean parallel runs after
both fixes.

---

## Other findings worth keeping

**The hydration contract holds, and it's checkable in ten seconds.** A hard reload of `/feed` with
the Network tab filtered to `trpc` shows **zero** requests — page one comes entirely from the
server's dehydrated cache. Scrolling to the bottom then produces exactly one `feed.page` request
per bottom-reach, no duplicates. That's the whole point of the `{}`-on-both-sides discipline, and
because `feed.page` permanently writes `seen_item`, it's also the difference between a reload
costing nothing and a reload costing a page of the user's corpus.

**`IMAGE_ASPECTS` rotates on the global image ordinal, never per page.** Resetting per page would
align the height rhythm to the 12-card fetch boundary — precisely the seam infinite scroll exists
to hide. There's a test for it.

**Greedy packing over two flex stacks, not CSS `columns`.** Native multi-column balances by
reflowing, which means appending a page can move a tile the reader is currently looking at. The
greedy pack can't: a tile's placement depends only on the tiles before it. There's a test asserting
that appending a page never reorders what's already placed.

**Broken images are expected, not a defect.** Museum CDNs bot-block third-party fetchers and there
is no image proxy until 5.7, so a nonzero broken rate is the designed-for condition — the tile
falls back to "Image unavailable" at the same aspect so the column doesn't reshuffle. The e2e
console-error assertion filters resource-load failures for exactly this reason, and only those.

---

## Deviations from the plan, all deliberate

1. **Article ledes are clamped to five lines**, and the height estimate caps to match. See above.
2. **An error state was added** beyond the copy table, for the reason above.
3. **`collection-row.tsx` is actually `collection-rows.tsx`**, and `ItemSheet` uses local compact
   rows rather than `CollectionRow` — the plan allowed either. The shared row carries a sub-label
   and a 9px dot on a 14px radius; the menu wants neither, and forcing a `size` prop onto it would
   have made the shared component worse to save eight lines.
4. **The e2e corpus is seeded, but the specs assert behavior rather than content.** The plan asks
   for ~30 deterministic items; they're there, and they'll matter once Phase 7.1 gives CI an empty
   database. They cannot make the feed deterministic *today*, though: the dev DB holds 8.5k items
   and the tier draw reaches across all sixteen topics, so thirty rows can't dominate a page. Every
   assertion is therefore about behavior — tiles render, the count grows, a gesture does what it
   should — never about which item appears.
5. **`e2e/support.ts` is new** and not in the plan; both specs needed the same hydration wait.
6. **`playwright.config.ts` gained an `outputDir`**, and `.gitignore` moved with it.

---

## Verification

- `bun run check` — typecheck, lint, format, **328 tests**. Green.
- `bun run build` — clean. `/feed` and `/i/[itemId]` both dynamic, as intended.
- `bun run e2e` — **14/14**, three consecutive parallel runs (33.7s / 39.5s / 43.8s).
- **Browser pass** (Chrome, 402×850): feed renders real content in two balanced columns; zero
  client `feed.page` requests on first paint; one fetch per bottom-reach; tap → `/i/{id}`;
  long-press → the item sheet with the right title and three collection rows; browser-back restores
  scroll exactly; zero console errors.
- e2e cleanup verified — `select count(*) from item where source='e2e'` returns 0 after a run.

## Still open

**The on-device pass has not happened.** It carried over from 5.5 (blocked then on the dev-origin
issue, fixed 08-17 via `allowedDevOrigins`) and it is the one part of this phase's Done bar that
cannot be done from here — it needs Ben, a phone, and the LAN dev origin
(`next dev`'s "Network:" line; `next.config.js` currently allows `192.168.1.168`, re-copy if DHCP
moved it). What it has to cover, both phases' worth:

- **5.6:** tap vs. long-press vs. scroll on the tiles — the 12px slop guard and the four iOS
  incantations (`select-none`, `touch-manipulation`, `-webkit-touch-callout: none`, and
  `pointer-events-none` on the `<img>`) all pass in a desktop browser while being wrong on iOS,
  which is exactly why the Done bar names a device. Also the `pt-[58px]` top inset, which is a
  plain value today because no screen in the app has established a safe-area convention yet.
- **5.5 (carried over):** the pill's `pointer-events` wrapper not eating scrolls that start low on
  the screen, and the sheet exit animation.

## Not in this phase, on purpose

Item pages beyond the stub, the image proxy, OG meta, swipe-back and "wander next" are 5.7's.
Drag-to-close sheets and the gallery are 5.8's. Collection creation is 5.10's, along with
sign-out's permanent home in Settings.
