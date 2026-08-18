# Phase 5.6 — Feed masonry: detailed execution plan

**Status: ready to execute.** Written to be executed cold, by a session that has not read the
research behind it. Everything you need is in this document; where it says "verified", the claim
was checked against the repo, the prototype, or the live dev database at plan time (08-17-26),
not inherited. You should not need to open the prototype — every px/ms/color value it contributes
is inlined below.

**What this phase is.** The throwaway `/feed` placeholder dies. In its place: the real screen —
an infinite two-column masonry of the feed engine's output, per the redesign's
`Ambit - Feed Masonry 3.dc.html` prototype. Image tiles (square-cornered, full-bleed), article
cards, and an occasional "Because" serendipity tile; tap navigates to the item page, long-press
opens a new item sheet ("Closer Look" + save-to-collection); the floating pill with the feed's
own wiring; `?focus=` return-scroll. This is also the repo's **first-ever consumer** of the tRPC
RSC hydration helpers (`prefetchInfinite` + `HydrateClient`) — nothing has ever exercised
`src/trpc/server.ts` before. A minimal `/i/[itemId]` stub ships alongside so taps navigate
somewhere real (5.7 replaces it; BUILD_PLAN explicitly allows this).

**Source of truth.** The prototype `docs/design_handoff_ambit_pwa_redesign/Ambit - Feed Masonry 3.dc.html`,
under the standing convention that **prototypes win over the README** — the README's Feed section
(lines 227–247) predates this prototype and loses on several points; every divergence has already
been resolved below. Recreate, don't port: the prototype's `scrollerRef`, fake latency, and
localStorage persistence are mockup scaffolding.

**Reference reading before you start** (~15 minutes):

- `src/server/api/routers/feed.ts` + the types at the top of `src/server/services/feed.ts` — the contract.
- `src/components/sheets/save-to-collection-sheet.tsx` + `collections-sheet.tsx` + `collection-row.tsx` — the house sheet pattern you'll mirror.
- `src/hooks/use-press.ts` — the gesture layer, built in 5.5 for exactly this screen.
- `src/app/dev/tokens/page.tsx`, the `BackboneSection` — the wiring precedent for pill + sheets + toast.
- `docs/PHASE5_WALKTHROUGH_5.5.md` — the hazards list; several of its traps reappear here.

---

## Preconditions — verified 08-17-26, re-check if time has passed

- **DB populated**: 8,563 items, 28 users, 192 `seen_item` rows, one user with seeded collections.
  Containers `ambit-postgres-1` + `ambit-mailpit-1` up.
- **You must be signed in and onboarded** — `feed.page` is a `protectedProcedure` and the page
  guards redirect anonymous → `/` and un-onboarded → `/onboarding`. Same drill as 5.5: `bun run
  invite <your-email>`, sign up through `/`, pick topics.
- **`feed.page` permanently consumes corpus.** Every call marks its 12 items seen (`seen_item`
  has no TTL, the write is unconditional inside `getFeedPage`). Dev reloads are affordable
  against 8.5k items, but this is why the query options in Step 4 forbid casual refetching —
  treat any unexplained `feed.page` request in the Network tab as a bug.
- **Test baseline**: 268 unit/integration tests green, `bun run e2e` 7/7, `bun run check` clean.
- **Carry-over**: 5.5's real-phone pass never happened (it was blocked on the dev-origin issue,
  fixed 08-17 via `allowedDevOrigins`). This phase's device pass covers both: pill + sheets (5.5's
  Done bar) and tap/long-press on tiles (5.6's).

---

## Decisions already made — do not relitigate

Taken with Ben on 08-17-26 (1–2) or settled by recorded convention (3–6):

1. **Because tile cadence: first JUMP per fetched page.** At most one serendipity tile per
   12-card page — attached to the page's *first* card with `tier === "JUMP"` and
   `driftPath.length >= 2`. DRIFT cards get no tile (drift stays ambient). This matches the
   prototype's occasional cadence (~1 in 12) where rendering every eligible card would hit ~7 in 12.
2. **Because tile copy**: from-line `you've been exploring {fromLabel}` (muted), to-line
   `{toLabel}` (accent). Labels resolved from `driftPath[0]` and `card.topicId` via a
   server-passed `topicLabels` map. No arrow glyph — the stacked lines are the from→to.
3. **The feed pill has three items, no share** — Profile, Ambit mark, Bookmark. The prototype
   omits share here and share-on-feed has no referent (there is no "current item" on a feed).
   `PillToolbar.onShare` becomes **optional**; the icon is omitted when absent.
4. **Height variety via literal aspect-ratio classes** — a refinement of the recorded
   "fixed literal-class rotation" decision (the DB has no image dimensions). The prototype sizes
   images as `colW × ratio` with eight ratios; literal `aspect-[100/68]`-style classes reproduce
   that exactly at the prototype's 402px frame *and* scale on wider phones, where fixed px
   heights would distort. Still zero runtime-computed class names — Tailwind's scanner sees
   every class as a literal.
5. **Taps navigate to `/i/{id}`**, image and article alike (prototype wins over the README's
   tap-image→gallery; recorded at re-baseline). The gallery is 5.8's and is entered from item
   pages/Saved, never feed tiles.
6. **Standing conventions**: 12px slop stands over the prototype's 10px (recorded 5.5
   divergence); drag-to-close sheets is 5.8's, not here; sign-out's interim home is
   `/dev/tokens` (permanent home is Settings, 5.10); the prototype's dead `menuOpen` overlay
   (Saved/About/Settings/Contact) is a leftover — do not build it.

---

## The backend contract — verified against live code, no server changes in this phase

**`api.feed.page`** (`protectedProcedure.query`, `src/server/api/routers/feed.ts`):

- Input: `{ cursor?: string, knobs?: Partial<FeedKnobs> }`. **Pass `{}` from the client** —
  `knobs` is dev-tooling (honored only under `FEED_DEBUG`), and any input asymmetry between
  server prefetch and client hook breaks hydration (Step 5).
- Output `FeedPage`: `{ cards: FeedCard[]; nextCursor?: string }`, page size 12.
- `FeedCard`: `{ item: Item; tier: "CORE" | "DRIFT" | "JUMP"; topicId: string; driftPath?: string[]; debug?: { why: string; curationScore: number } }`.
  `debug` is present only in dev / `FEED_DEBUG`.
- `Item` fields used here: `id, type ("image" | "article"), title, summary (lede, nullable),
  imageUrl (nullable), source, attribution (nullable), topicId`.
- `driftPath` semantics: absent for CORE; `[start]` when the topic's adjacency row is empty;
  `[start, hop]` / `[start, hop1, hop2]` otherwise. **A Because tile requires length ≥ 2**;
  `from = driftPath[0]`, `to = card.topicId`. Collapse 2-hop paths to one from→to pair.
- End of feed: `nextCursor === undefined`. With `getNextPageParam: (last) => last.nextCursor`,
  React Query's `hasNextPage` already encodes it — no extra check.
- Malformed cursor → clean `BAD_REQUEST` (pre-validated). You never construct cursors; they're opaque.

**Saves surface** (5.5's, reused as-is): `saves.collections` (lazily seeds Articles/Art/Photos),
`saves.saveToCollection({itemId, collectionId})` → `{ collectionName }` (one collection per item —
picking another **moves** it), `saves.unsave`, `saves.count`. `items.byId({id})` is the app's one
`publicProcedure` — the stub page's data source.

---

## Steps

Run `bun run check` at every checkpoint; it must stay green throughout.

### Step 1 — Groundwork (five small, independently checkable changes)

1a. **Sign-out moves.** Relocate the sign-out control from `/feed` to `/dev/tokens`: add a small
    "Session" section at the top of `src/app/dev/tokens/page.tsx` rendering the existing
    `SignOutButton` (move the component to `src/app/dev/tokens/sign-out-button.tsx`; delete
    `src/app/feed/sign-out-button.tsx`). Keep the button's `getByRole("button", { name: "Sign out" })`
    accessibility name — e2e depends on it.

1b. **`PillToolbar.onShare` becomes optional** (`src/components/ui/pill-toolbar.tsx`): omit the
    share button entirely when the prop is absent. Update `pill-toolbar.test.tsx`: existing
    4-item assertions keep passing `onShare`; add a case asserting share is absent without it.

1c. **New animation tokens** in `src/styles/globals.css`, alongside the existing `--animate-*`
    definitions: `--animate-menu-rise: menurise .2s ease both` (keyframes: opacity 0→1,
    translateY(-6px)→0) and `--animate-menu-drop: menudrop .15s ease both` (the reverse — the
    prototype unmounts instantly, but `BottomSheet` v2's close path awaits an exit animation,
    so give the menu variant a fast symmetric one). Respect the existing
    `prefers-reduced-motion` pattern used by the other animations in that file.

1d. **`BottomSheet` animation variant** (`src/components/ui/bottom-sheet.tsx`): new prop
    `animation?: "sheet" | "menu"` (default `"sheet"`, existing consumers untouched). `"menu"`
    swaps enter/exit to `animate-menu-rise` / `animate-menu-drop`. Remember the 5.5 findings
    baked into this component: exit state adjusts **during render**, the `animationend` listener
    is **native** (jsdom delivers no React `onAnimationEnd`) and guards `e.target === el`.

1e. **jsdom `IntersectionObserver` stub** in `src/test/setup.ts`: a permissive no-op class
    (`observe`/`unobserve`/`disconnect`) assigned when `typeof IntersectionObserver ===
    "undefined"`. Tests that need to *drive* it override per-test with `vi.stubGlobal(...)`
    capturing the constructor callback, restored via `vi.unstubAllGlobals()` in `afterEach`.

1f. **`sourceLabel` util** — `src/lib/source-label.ts`:
    `SOURCE_LABELS: Record<string, string> = { wikipedia: "Wikipedia", met: "The Met", aic: "Art Institute of Chicago", cma: "Cleveland Museum of Art", wellcome: "Wellcome Collection" }`,
    falling back to `source.charAt(0).toUpperCase() + source.slice(1)`. Unit-test both branches.

*Checkpoint: `bun run check` green; `/dev/tokens` shows Sign out; existing sheets animate unchanged.*

### Step 2 — `ItemSheet` (the long-press sheet)

New `src/components/sheets/item-sheet.tsx`, on `BottomSheet animation="menu"`. Props:
`{ open: boolean; onClose: () => void; item: { id: string; title: string } | null; onSaved: (c: { id: string; name: string }) => void; onError: (message: string) => void }`
(`onError` required — the 5.5 house rule). Content, top to bottom (panel padding `10px 18px 30px`
— pass content insets, the sheet shell has none):

- Centered title: the item's title, Sora 600 15px `text-ink-hi`-adjacent (`#F3EFE5` — use the
  closest existing token treatment the other sheets use for titles), `padding: 0 4px 4px`.
- **"Closer Look"** row: flex, gap 11px, padding `14px 10px`, radius 12px; an 18px magnifier SVG
  (add `Magnifier` to `src/components/icons/index.tsx`: `circle cx=11 cy=11 r=7` +
  `path M21 21l-4.35-4.35`, `stroke-width: 2`, stroke `currentColor`, rendered in accent) +
  label 15px. Activating it closes the sheet and navigates to `/i/{item.id}` (`router.push`).
- Divider: `h-[0.5px] bg-ink/8`, margin `6px 4px`.
- Section label **"Save to collection"**: 11.5px / 600 / tracking 1px / uppercase / `text-ink/40`,
  padding `10px 10px 2px`.
- One compact row per collection from `saves.collections` (flex, gap 11px, padding `12px 10px`,
  radius 12px): 8px accent dot + name at 15px. No "already saved here" state in this sheet
  (the prototype shows plain rows); picking calls `saves.saveToCollection`, then `onSaved` →
  the parent toasts `Saved to {name}` and closes.

Reuse the mutation/invalidation pattern from `save-to-collection-sheet.tsx` (including
`useUtils` invalidations); if `collection-row.tsx` fits with a size prop, reuse it, otherwise a
local compact row is fine — don't force it.

Unit tests (`sheets.test.tsx` pattern — mocked `~/trpc/react` with `vi.hoisted` state): renders
title + Closer Look + rows when open; picking a row fires the mutation and `onSaved`; mutation
error path fires `onError`; Closer Look navigates (mock `next/navigation`).

*Checkpoint: check green; sheet demoable in isolation (it gets mounted for real in Step 4).*

### Step 3 — The masonry engine, as a pure function

New `src/components/feed/masonry.ts` — DB-free, render-free, unit-tested (the same seam
philosophy as `services/feed.ts`):

```ts
export type FeedTile =
  | { kind: "image"; card: FeedCard; aspectClass: string; ratio: number }
  | { kind: "article"; card: FeedCard }
  | { kind: "because"; key: string; from: string; to: string };

export function buildTiles(pages: FeedPage[], topicLabels: Record<string, string>): FeedTile[]
export function packColumns(tiles: FeedTile[]): [FeedTile[], FeedTile[]]
```

**`buildTiles`** flattens `pages[].cards` in order. Image cards get the next aspect class from a
fixed rotation keyed by the **global image-tile ordinal `% 8`** across the whole flattened list —
never reset per page (a per-page reset aligns the visual rhythm to fetch boundaries):

```ts
// ratio = height/width, from the prototype's POOL; literal classes only —
// Tailwind's scanner cannot see computed class strings.
export const IMAGE_ASPECTS = [
  { className: "aspect-[100/68]",  ratio: 0.68 },
  { className: "aspect-[100/78]",  ratio: 0.78 },
  { className: "aspect-[100/124]", ratio: 1.24 },
  { className: "aspect-[100/130]", ratio: 1.3  },
  { className: "aspect-[100/62]",  ratio: 0.62 },
  { className: "aspect-[100/142]", ratio: 1.42 },
  { className: "aspect-[100/118]", ratio: 1.18 },
  { className: "aspect-square",    ratio: 1.0  },
] as const;
```

Per fetched page, the first card with `tier === "JUMP" && (driftPath?.length ?? 0) >= 2` gets a
`because` tile inserted **immediately before it** (key `because-${card.item.id}`, labels via
`topicLabels` with the raw id as fallback). One per page, max.

**`packColumns`** is the prototype's greedy shortest-column placement: two accumulators, each
tile goes to the column with the smaller estimated height, then that column grows by
`estHeight(tile) + 4`. Estimates (relative correctness is all that matters; `COL_W = 196`):
image → `COL_W * ratio`; because → `118`;
article → `74 + ceil(title.length / 18) * 24 + ceil((summary ?? "").length / 30) * 21`.

Unit tests: rotation continuity across page boundaries; one because-tile per page and only for
qualifying JUMPs (none when a page has no JUMP with a 2+ path); packColumns balances a known
sequence deterministically and appending pages never reorders previously placed tiles.

### Step 4 — Tiles + `FeedScreen`

New `src/components/feed/` components, all rendered inside `"use client"` `FeedScreen`.

**`FeedScreen`** (`feed-screen.tsx`), props `{ topicLabels: Record<string, string> }`:

```ts
const q = api.feed.page.useInfiniteQuery({}, {
  getNextPageParam: (last) => last.nextCursor,
  staleTime: Infinity,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});
```

The input **must be `{}`** — byte-identical to the server prefetch (Step 5). `staleTime:
Infinity` is load-bearing: `feed.page` writes `seen_item`, so every stray refetch permanently
burns corpus (`/dev/tokens` set the precedent).

Layout (the scroll container is the **window** — the prototype's internal scroller is ios-frame
scaffolding, the same `absolute`-vs-`fixed` class of bug 5.5 hit three times):

- Root: `bg-bg min-h-dvh`. Grid: `grid grid-cols-2 gap-1 px-1 pt-[58px] items-start`
  (the prototype's `gap: 4px; padding: 58px 4px 0`), each column `flex flex-col gap-1`, filled
  from `packColumns(buildTiles(data?.pages ?? [], topicLabels))`. Each tile wrapped in
  `<div data-feed-id={card.item.id}>` (because-tiles: no id — they're inert). If the app's other
  screens compose safe-area insets into top padding, match that convention here; otherwise 58px
  and verify on the device pass.
- Wrap the **first page's** tiles in `Rise` (stagger per the existing house usage); appended
  pages get no entrance animation — a rise cascade on infinite scroll reads as flicker.
- After the columns: a 1px sentinel `<div className="h-px" />`, the loader row, then a
  `h-24` spacer clearing the pill.
- Sentinel: `IntersectionObserver` with **default (viewport) root**, `rootMargin: "500px"`;
  on intersect `if (hasNextPage && !isFetchingNextPage) void fetchNextPage()`. Skip the
  prototype's duplicate scroll-listener trigger — one mechanism, not two. Keep the observer's
  callback deps out of effect-teardown churn (hold callbacks in refs, the 5.5 lesson).
- Loader row (only while `isFetchingNextPage || (isPending && !data)`): flex centered, gap 10px,
  padding `20px 0 26px`; `Spinner size={15}` + "finding something interesting…" at 14px
  `text-ink/40`.
- End of feed (`!hasNextPage && cards.length > 0`): same row styling, "You've reached the edge,
  for now."
- Empty corpus (`!hasNextPage && cards.length === 0`): centered block, muted — "Nothing here
  yet. Check back soon."

**`ImageTile`** (`image-tile.tsx`): wrapper `relative overflow-hidden cursor-pointer` +
`usePress` handlers + `select-none touch-manipulation` + `style={{ WebkitTouchCallout: "none" }}`
(the dev/tokens precedent — all four are required for iOS). Inside: `<img loading="lazy"
src={item.imageUrl ?? ""} alt={item.title} className="w-full h-full object-cover block
pointer-events-none" />` inside the aspect-class wrapper. **Square corners, no border, no
title/meta/actions** — image only. Local `broken` state via `onError`: swap to a `bg-ink/5`
block at the same aspect with a centered `text-ink/40` 11px "Image unavailable" caption (there's
no image proxy until 5.7 — hotlinked museum CDNs will produce a nonzero broken rate; this is
expected, not a bug).

**`ArticleCard`** (`article-card.tsx`): `bg-[rgba(239,235,224,0.035)] border-[0.5px]
border-[rgba(239,235,224,0.07)]` (or the nearest `ink/N` alpha equivalents if they land on the
same values — check `globals.css` before inventing arbitrary values), padding `16px 14px 14px`,
square corners, press-scale `0.985` with `transition-transform .2s` while pressing (drive from
`usePress` press-state or a local `data-pressing` toggle). Content: eyebrow
`sourceLabel(item.source)` at 9.5px / 600 / tracking 1.3px / uppercase / `text-ink/34`; title
Sora 600 19px / leading 1.25, `mt-[10px]`; lede `item.summary` (omit when null) at 13.5px /
leading 1.52 / `text-ink/58`, `mt-[9px]`. No body, no expand affordance, no per-card buttons.
Same `usePress` wiring as `ImageTile`.

**`BecauseTile`** (`because-tile.tsx`), inert (no handlers): padding `16px 13px`,
`bg-[rgba(239,235,224,0.03)]`, `border-[0.5px] border-[rgba(239,235,224,0.06)]`. Header row
(flex, gap 7px): 8px accent `Diamond` icon (exists in `icons/index.tsx`) + "Because" at 9.5px /
600 / tracking 1.3px / uppercase / `text-ink/34`. Then `you've been exploring {from}` at 12px /
leading 1.5 / `text-ink/50`, `mt-[9px]`; then `{to}` at 15px / leading 1.35 / `text-accent`,
`mt-[6px]`.

**Gestures**: one `usePress` per tile — `onTap` → `router.push(\`/i/${item.id}\`)`,
`onLongPress` → open `ItemSheet` with that item (defaults: 450ms, 12px slop, haptic — all
already in the hook; reuse, don't rebuild).

**Pill + sheets + toast**, mounted once in `FeedScreen` (the `BackboneSection` wiring is the
precedent): `PillToolbar` with `bookmark="idle"`, `onBookmark` → `CollectionsSheet` open,
`onHome` → `window.scrollTo({ top: 0, behavior: "smooth" })`, `onProfile` → toast "Profile is
5.10", **no `onShare`**. `CollectionsSheet` always mounted; `ItemSheet` mounted with the
long-pressed item (`onSaved` → toast `Saved to {name}`; `onError` → toast). One page-level
`Toast` driven by `string | null` state, **`raised`** (the feed toast sits above the pill —
prototype `bottom: 100px`).

**Debug badge** (SPEC's standing dev-overlay requirement, nearly free here): when `card.debug`
is present (dev-only by construction), render a tiny absolute top-left chip on image/article
tiles — 10px, `bg-scrim/60 text-ink/70 px-1`, showing `card.tier`, with `title={card.debug.why}`.

**Placeholder cleanup**: `src/app/feed/page.tsx` loses everything but the guards (Step 5);
delete the old placeholder JSX and `sign-out-button.tsx` (moved in 1a).

Unit tests (jsdom docblock, mocked `~/trpc/react` returning a fixed two-page dataset, IO stub
from 1e): renders both columns with the expected tile mix; sentinel intersection triggers
`fetchNextPage` once (guarded while fetching); long-press opens the item sheet with the right
item; tap fires navigation; broken image swaps to fallback; empty state renders on
`{ cards: [], nextCursor: undefined }`.

*Checkpoint: check green; with the dev server running, `/feed` scrolls real content.*

### Step 5 — `/feed/page.tsx` becomes the RSC shell

Keep the existing guards **verbatim** (session → `redirect("/")`;
`!hasCompletedOnboarding(userId)` → `redirect("/onboarding")` — that guard's comment already says
it carries forward). Then:

```tsx
void api.feed.page.prefetchInfinite({});   // api from ~/trpc/server — first-ever use
const topicLabels = Object.fromEntries(TOPICS.map((t) => [t.id, t.label]));
return (
  <HydrateClient>
    <FeedScreen topicLabels={topicLabels} />
  </HydrateClient>
);
```

(Adjust the `TOPICS` field names to whatever `src/server/config/topics.ts` actually exports —
verify, don't assume `label`.)

**The one real trap**: the prefetch input must **byte-match** the client's — `{}` on both sides.
A mismatch doesn't error; the queries get different keys, hydration silently misses, and the
client refetches invisibly (which here also burns a second page of corpus). **Verify in the
browser**: on a hard reload of `/feed`, the Network tab must show **no** client `feed.page`
request before you scroll. `/feed` stays dynamic (it reads headers + hits the DB); confirm
`bun run build` passes under CI's placeholder env.

*Checkpoint: check + build green; Network tab shows zero `feed.page` requests on first paint;
scrolling fetches page 2 exactly once.*

### Step 6 — `/i/[itemId]` stub

New `src/app/i/[itemId]/page.tsx`, server component on the **public** `items.byId` (server-side
caller or direct repo call — match how other server components fetch). `notFound()` on missing
id. Render deliberately minimal and clearly interim: item title (Sora 600, `text-ink-hi`),
`sourceLabel(source)` eyebrow, the image (plain `<img>`, `max-w-full`) or `summary` for
articles, and a "← Back" link to `/feed?focus={id}` — which makes the stub the live test rig for
Step 7's return-scroll. A file-top comment: `// INTERIM STUB — replaced wholesale in 5.7.`
No OG meta, no swipe-back, no wander-next — all 5.7 scope.

### Step 7 — `?focus=` return-scroll + scroll restore

In `FeedScreen`, on mount (client only):

- Read `?focus=` (`useSearchParams`). If present, resolve
  `document.querySelector(\`[data-feed-id="${id}"]\`)` and scroll the window so the element sits
  84px below the top: `window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - 84 })`.
  Retry at 90 / 350 / 800 ms (images and hydration land late); each attempt re-queries, stops
  when found.
- Fallback (no focus id, or not found — it may have scrolled out of the served window): restore
  `sessionStorage["ambit.feedScroll.v1"]` if `window.scrollY < 4`.
- Persist: a passive scroll listener, rAF-throttled, writing `window.scrollY` to that key.

jsdom has no layout (`getBoundingClientRect` is zeros) — this gets its unit coverage only at the
"does it call scrollTo / does it retry" level; the real check is e2e/manual via the stub's Back
link.

### Step 8 — e2e

**Update `e2e/auth.spec.ts`** (two touches, verified against current line numbers):

- The invited-sign-up test's final assertion `Signed in as {EMAIL}` → assert the real feed
  rendered: `await expect(page.locator("[data-feed-id]").first()).toBeVisible()` (the dev DB has
  8.5k items; a fresh onboarded user gets a full page).
- The sign-out test: after signing in, `page.goto("/dev/tokens")`, click
  `getByRole("button", { name: "Sign out" })` there, keep the wait-for-`/` and the
  "/feed bounces anon" half unchanged.

**New `e2e/feed.spec.ts`** (serial, own user like `auth.spec.ts`): seed a deterministic corpus
**directly via Drizzle in `beforeAll`** — never `bun run ingest` — ~30 items with
`source: "e2e"`, sourceIds `e2e-feed-0..29`, spread across the topics the test user will pick in
onboarding, mixing types; `imageUrl` a 1px data-URI GIF (no network flake — and it exercises the
happy image path, while a couple of `https://invalid.example/x.jpg` rows exercise the fallback).
`afterAll`: delete `seen_item`/`saved_item` rows for those items, then the items
(`where source = "e2e"`), then the user artifacts the way `auth.spec.ts` does. Tests:

1. Feed renders ≥ 8 tiles in two columns; zero console errors (the `home.spec.ts` pattern).
2. Scroll to bottom → tile count strictly grows (infinite page 2).
3. Long-press an image tile (`mouse.down()`, `waitForTimeout(550)`, `mouse.up()`) → sheet with
   "Closer Look" + "Save to collection"; picking a collection row → toast `Saved to`.
4. Tap an article tile → lands on `/i/{id}` (stub renders the title); Back link returns to
   `/feed?focus={id}`.
5. Pill bookmark → "Your collections" sheet opens.

Remember the recorded e2e flake pattern: a first-run failure after a code change is usually Next
compiling routes on demand, not a regression — re-run before debugging.

*Checkpoint: `bun run e2e` green (now 12-ish tests), `bun run check` green, `bun run build` green.*

### Step 9 — Docs + walkthrough

- `docs/PHASE5_WALKTHROUGH_5.6.md` — the house walkthrough: what shipped, deviations from this
  plan, findings, and the device-pass results.
- `docs/BUILD_PLAN.md` — 5.6's Done-note (and tick 5.5's box if its folded-in device pass is done).
- `SPEC.md` — fix §10's stale "typography plugin lands in Phase 5.4" note (plain text +
  `whitespace-pre-line`, no plugin); add the `/i/[itemId]` stub existence to wherever §7/§8
  tracks routes if applicable. No API-surface changes to record.
- `log.md` — per the repo convention, with the session-spend line.

---

## Copy table (exact strings)

| Where | Copy |
|---|---|
| Because eyebrow | `Because` |
| Because from-line | `you've been exploring {fromLabel}` |
| Because to-line | `{toLabel}` |
| Loader | `finding something interesting…` |
| End of feed | `You've reached the edge, for now.` |
| Empty corpus | `Nothing here yet. Check back soon.` |
| Item sheet action | `Closer Look` |
| Item sheet section label | `Save to collection` |
| Save toast | `Saved to {collectionName}` |
| Pill profile toast | `Profile is 5.10` |
| Broken image caption | `Image unavailable` |
| Stub back link | `← Back` |

---

## Hazards carried from 5.5 — read before debugging anything

- **`fixed`, not `absolute`** for pill/sheets/toast (already correct in the components) — and the
  same trap in observer form: the IO root is the viewport, never a ref'd scroller.
- **jsdom delivers no React `onAnimationEnd`** (no `AnimationEvent`); `BottomSheet` already
  listens natively — don't "fix" it back.
- **`animationend` bubbles** — target guard stays.
- Inline-arrow `onClose` in effect deps ⇒ teardown every parent render — keep callbacks in refs.
- Set exit-state **during render**, not in effects (`react-hooks/set-state-in-effect` is right).
- Sub-pixel borders measure 1px at DPR 1 in Chrome — check `devicePixelRatio` before declaring a
  hairline regression.
- A first-run e2e failure after edits is likely on-demand route compilation, not a regression.
- An unexplained `feed.page` request = hydration key mismatch or refetch policy hole — both burn
  corpus; fix the cause, never paper over with cache tweaks.

## Done bar (from BUILD_PLAN, plus the 5.5 carry-over)

Smooth infinite scroll of real DB content; taps and long-press correct **on a real phone** (via
the LAN dev origin — `next.config.js` already allows `192.168.1.168`; re-copy the IP from
`next dev`'s "Network:" line if DHCP moved it); the 5.5 pill/sheet device pass folded in; zero
client `feed.page` requests on first paint; `bun run check`, `bun run e2e`, `bun run build` all
green; walkthrough written.
