# Phase 5.9 — Saved + collections UI: detailed execution plan

**Status: ready to execute.** Companion to BUILD_PLAN.md Phase 5, same format as PHASE5_PLAN_5.8.md.
Written to be executed cold, by a session that has not read the research behind it. **Where it says
"verified", the claim was checked against the repo at plan time (08-23-26, `main` @ 47064aa), not
inherited.** If the repo has moved since, re-verify line numbers before editing — the *shapes*
described here are the contract, not the line numbers.

**Prerequisites (Ben):** none. No new services, no new env vars, no migration. Local Postgres up
(`docker compose up -d`) so integration tests actually run rather than self-skip. Clear port 3000
(`lsof -ti:3000`) before dev/e2e runs.

**No mid-phase stop.** The scope calls (chips = collections, grid = shared masonry, share-collection
deferred) were settled at plan time — BUILD_PLAN's 5.9 entry itself made them. Execute straight
through on `feat/5.9-saved-collections-ui` (plain branch off `main`, merged back when green).

**What this phase is:** the `/saved` screen — the last place a save currently goes to die. 5.5 built
the whole backend (collections, counts, unsave); 5.6–5.8 built every rendering primitive it needs.
5.9 is pure UI assembly: title + count line, horizontally scrolling collection chips with live
counts, the shared masonry, an unsave badge + toast, empty state, image tap → gallery, article tile
→ reader, pill bookmark filled-white.

---

## 1. Context

- **Where this sits:** next Phase 5 screen in journey order (feed 5.6 ✅ → item 5.7 ✅ → gallery 5.8 ✅ → **Saved 5.9** → profile/settings 5.10). Scope is `docs/BUILD_PLAN.md` §5.9.
- **This is pure UI over 5.5's backend.** The `saves` router (`src/server/api/routers/saves.ts`) already has every procedure this screen needs — `collections` (with per-collection `itemCount`, lazily seeding the Articles/Art/Photos defaults), `list` (optional `collectionId` filter, most-recent-first — its own doc comment says it backs "5.9's chips"), `count`, `unsave`, `forItem`, `saveToCollection` (verified). **No new procedures, no schema changes, no changes to `db/saves.ts` or `db/collections.ts`.** `saves.list` has no pagination; accepted for v1 (a personal saves list is small; noted in §7).
- **The route is already anticipated everywhere** (verified): `src/proxy.ts`'s matcher includes `/saved/:path*`; `CollectionsSheet` (the pill's bookmark sheet on the feed) already pushes `/saved` and `/saved?collection={id}` — those links currently 404. `PillToolbar` already has the `"on-saved"` white-filled bookmark state with a doc comment reserving it for this screen. `Chip`'s header comment (`src/components/ui/chip.tsx:11-13`) reserves a small `size` variant for "the Saved screen's filter chip (5.9)". `gallery-origin.ts`'s comment says "in 5.9 it will also be Saved" — and BUILD_PLAN.md:239 confirms the marker is entry-agnostic, so **the gallery needs zero changes**.
- **Prototype:** `docs/design_handoff_ambit_pwa/Ambit - Saved.dc.html`. The UI spec in §4 is distilled from it — do not open the prototype during execution.

### Two scope reinterpretations, both made by BUILD_PLAN itself (state them in code comments)

1. **Chips are collections, not All/Images/Reading.** The prototype (and README §5) has a 3-way type filter (All / Images / Reading). BUILD_PLAN's 5.9 entry — written after the prototypes, with the 5.5 backend in hand — says "collection chips with live counts", and `saves.list`'s `collectionId` filter was built for exactly that. Chips = **"All · N"** + one chip per collection **"{name} · N"**. The prototype still governs the chips' *visual* treatment (sizes, fills, active state).
2. **The grid is the 5.6 shared masonry, not the prototype's 2-column caption grid.** The prototype has rounded-16 fixed-150px image tiles with title/attribution captions and full-width article cards. BUILD_PLAN says "the shared masonry from 5.6" — square-cornered full-bleed `ImageTile` + `ArticleCard`, `packColumns`/`buildTiles`, `grid-cols-2 gap-1 px-1`. The prototype supplies what the feed masonry lacks: the **unsave badge overlay**, the header, chips, empty state, and toast copy. (Consequence: no per-tile "Open in reader →" link — the whole article tile is the tap target, which is BUILD_PLAN's "article tile → reader".)

## 2. Decisions locked in this plan

| # | Decision | Rationale |
|---|---|---|
| 1 | **Filter state lives in the URL** (`/saved?collection={collectionId}`). Chips call `router.replace(...)`; active chip derives from `useSearchParams()`. | Single source of truth. `CollectionsSheet` already navigates to `/saved?collection={id}` from anywhere, and a reload/share of a filtered view must land filtered. A duplicate `saves.list` fetch is harmless (idempotent read — *unlike* `feed.page`, no corpus is burned), so there is no fragile hydration contract per chip tap. |
| 2 | **Image tap → gallery** via `markGalleryOrigin(item.id)` + `router.push("/g/" + item.id)` — byte-for-byte the `HeroGalleryLink` pattern. | 5.8's close gesture then pops back to `/saved`; entry-agnostic by design (BUILD_PLAN:239). |
| 3 | **Article tap → reader** via plain `router.push("/i/" + item.id)`, **no origin marker**. | `feed-origin` semantically means "the *feed* is one entry down"; writing it from Saved would make the item page's pill "Feed" button pop back to Saved under a Feed label. Accepted seam: the reader's swipe-back from a Saved entry pushes `/feed?focus=` (browser back still returns to Saved). Comment this at the call site. |
| 4 | **Leaving Saved uses a new `saved-origin` marker** mirroring `feed-origin`/`gallery-origin` (third small file, same deliberate non-abstraction). Marked by `CollectionsSheet` before pushing to `/saved`; the header back-arrow and the pill's Feed button both call a shared `leaveSaved()` = marked ? `router.back()` : `router.push("/feed")`. | Pushing `/feed` rebuilds a dynamic feed and burns two pages of corpus per trip (measured 08-20-26, 24 items/tap) — the exact defect 5.6/5.7 fixed for item pages. `/saved` is bookmarkable, so an unconditional `back()` could exit the app on a cold open. |
| 5 | **Pill on Saved:** `bookmark="on-saved"` (white-filled), `onBookmark` opens the existing `CollectionsSheet`, `onHome={leaveSaved}`, **no `onShare`** (same rationale as the feed: no single referent — and public share-collection is out of scope, §7). | |
| 6 | **Unsave is optimistic** on the visible list (`utils.saves.list.setData` filter for the active input in `onMutate`), with `invalidate` of `saves.list` + `saves.collections` + `saves.count` on settle (the invalidation trio copied from `item-sheet.tsx:66-68`). Toast "Removed from Saved". | Prototype: "Unsave is immediate". |
| 7 | **No long-press / no ItemSheet on Saved tiles** (prototype has none; the badge replaces it). `onLongPress` becomes optional on `ImageTile`/`ArticleCard` (their `usePress` already accepts `undefined`). | |
| 8 | Count line always shows the **total** (`saves.count`), not the filtered count — it captions the title, as in the prototype. Chip counts carry the per-collection numbers. | |

## 3. Files

### New

| File | Contents |
|---|---|
| `src/app/saved/page.tsx` | RSC shell (pattern: `src/app/feed/page.tsx`). Session guard → `redirect("/")` (no onboarding redirect — Saved doesn't need topics; comment why it diverges from `/feed`). Reads `searchParams: Promise<{ collection?: string }>`. Fire-and-forget prefetches byte-matching the client inputs: `void api.saves.list.prefetch(collection ? { collectionId: collection } : {})`, `void api.saves.collections.prefetch()`, `void api.saves.count.prefetch()`; wrap `<SavedScreen />` in `<HydrateClient>`. `export const metadata = { title: "Saved · Ambit" }`. Comment that here (unlike `/feed`) a missed hydration handoff costs a round trip, not corpus. |
| `src/components/saved/saved-screen.tsx` | `"use client"`. The screen: queries (`api.saves.list.useQuery(activeId ? { collectionId: activeId } : {})`, `api.saves.collections.useQuery()`, `api.saves.count.useQuery()`), header (§4), `CollectionChips`, masonry, empty states, `PillToolbar`, `CollectionsSheet`, `Toast` (`raised`, `durationMs={1700}`), error branch with retry (copy the feed's `isError` block, text "Couldn't load your saved things."). Masonry: wrap each `Item` as a synthetic `FeedCard` `{ item, tier: "CORE" as const, topicId: item.topicId }` (types line up — superjson preserves `Item` across tRPC), then `packColumns(buildTiles([{ cards }], {}))` — CORE never produces Because tiles, so reuse is exact; comment this. Render via `SavedTile`. `activeId` = raw `?collection=` param (used verbatim for the query input; chip highlighting tolerates an unknown id — comment the hand-edited-URL edge). |
| `src/components/saved/saved-tile.tsx` | `"use client"`. One saved tile: `<div className="relative" data-saved-id={item.id}>` wrapping either `<ImageTile card={card} aspectClass={...} onTap={openGallery}/>` or `<ArticleCard card={card} onTap={openReader}/>` (no `onLongPress`), plus the absolutely-positioned unsave badge (§4) — a sibling overlay, so its clicks never reach the tile's press handlers; still add `onPointerDown={(e) => e.stopPropagation()}` per the pill-button precedent. `aria-label="Remove from Saved"`. Wrapped in `<Rise>` (no stagger — prototype rises tiles individually at 0.4s; `animate-rise` is the house version). |
| `src/components/saved/collection-chips.tsx` | `"use client"`. Horizontally scrolling row: `flex gap-2 overflow-x-auto` with an edge-bleed (`-mx-5 px-5`) so chips scroll under the header's own padding. First chip **"All"** (`selected` when no `?collection=`), then `collections.data` in order (already `createdAt asc`). Labels append `" · " + count` only when count > 0 (prototype rule); All's count = `saves.count`. Tap → `router.replace(id ? `/saved?collection=${encodeURIComponent(id)}` : "/saved")`. Uses `Chip size="sm"`. |
| `src/components/saved/saved-origin.ts` | `"use client"`. Mirror of `src/components/feed/feed-origin.ts` (copy its structure, comments pointing at it — "a deliberate parallel, not an abstraction", same wording precedent as `gallery-origin.ts`). Key `"ambit.savedOrigin.v1"`, value `"1"` (no item id needed). Exports `markSavedOrigin(): void` and `cameToSavedFromApp(): boolean`, both try/catch-wrapped for Lockdown-mode Safari. |
| `src/components/saved/saved-screen.test.tsx` | Component tests (§6.1). |
| `e2e/saved.spec.ts` | E2E (§6.3). |

### Modified

| File | Change |
|---|---|
| `src/components/ui/chip.tsx` | Add `size?: "md" \| "sm"` (default `"md"`). `"sm"`: `px-[15px] py-2 text-[12.5px]` and **no** `animate-chip-pop` on selected (the Saved prototype's chips transition colors only — `transition ... duration-200` already present covers the prototype's 0.18s intent). Update the header comment (it promised exactly this prop). |
| `src/components/ui/chip.test.tsx` | Add cases: `size="sm"` renders the small classes; selected sm chip has `aria-pressed=true` and no `animate-chip-pop`. |
| `src/components/feed/image-tile.tsx`, `src/components/feed/article-card.tsx` | `onLongPress?: () => void` (optional in props; pass through unchanged — `usePress` already treats `undefined` as "never arm the timer", which also leaves iOS's callout undisturbed on Saved, same reasoning as `hero-gallery-link.tsx`). No behavior change for the feed. |
| `src/components/sheets/collections-sheet.tsx` | In `go()`: when `href.startsWith("/saved")`, call `markSavedOrigin()` immediately before `router.push` (comment: the Saved screen's back-arrow pops instead of rebuilding the feed — see `saved-origin.ts`). |
| `src/components/sheets/sheets.test.tsx` | Add one case: picking a collection row writes `sessionStorage["ambit.savedOrigin.v1"]` before pushing (existing `pushMock` assertions at lines 358/362 stay untouched). |
| `src/server/api/routers/routers.integration.test.ts` | Add the chip-count test (§6.2) inside the existing `describe("saves.collections + saveToCollection + list + unsave")`. |

**Do not touch:** the saves router, `db/*`, gallery code, `masonry.ts`, `use-press.ts`, `pill-toolbar.tsx`, `toast.tsx`.

## 4. UI spec (distilled from `Ambit - Saved.dc.html` — do not open the prototype)

Translate prototype values to theme tokens: `#161411`→`bg-bg`, `#EFEBE0`→`text-ink`, `#F3EFE5`→`text-ink-hi`, `rgba(239,235,224,α)`→`ink/α`, accent hex→`accent`/`text-on-accent`, Newsreader→**Sora** (the app's single typeface; serif sizes keep their px, weight 600, per every shipped screen).

**Header** — `GlassHeader` (`src/components/ui/glass-header.tsx`) with `className="flex-col items-stretch"` (overrides its default row layout):
- Row 1: back button — `IconButton` size 34 with `ChevronLeft` size 16, `aria-label="Back to feed"`, `onClick={leaveSaved}` — then a 12px gap, then a stacked title block: **"Saved"** `text-ink-hi text-[26px] leading-none font-semibold`; count line `mt-[5px] text-[12px] tracking-[0.15px] text-ink/45`, copy: `0 → "Your quiet collection"`, `1 → "1 thing kept"`, `n → "${n} things kept"`.
- Row 2 (only when total > 0): `CollectionChips`, `mt-4`.

**Chips** (small `Chip`): unselected `bg-ink/5 border-ink/12 text-ink/82`; selected `bg-accent border-accent text-on-accent` (Chip already does both). 12.5px/500, `px-[15px] py-2`, pill radius, `whitespace-nowrap`.

**Grid**: identical to the feed — `grid grid-cols-2 items-start gap-1 px-1`, columns are `flex flex-col gap-1`, content starts right under the sticky header (add `pt-2`), and an `h-24` spacer at the bottom clears the pill.

**Unsave badge** (overlay, top-right of every tile):
- On image tiles: 30×30 circle at `top-[9px] right-[9px]`, `bg-bg-app/62 backdrop-blur-[8px] border-hairline border-ink/16` (prototype: `rgba(12,11,9,0.62)`, blur 8, 0.5px border at 0.16), containing `<Bookmark filled size={14} className="text-accent" />`.
- On article tiles: 28×28 circle at `top-[12px] right-[12px]`, `bg-ink/5 border-hairline border-ink/10`, `<Bookmark filled size={13} className="text-accent" />`.

**Empty state** (total === 0; replaces grid *and* chips): centered column, `px-10 py-[90px]`, wrapped in `Rise`. 66×66 circle `bg-ink/5 border-hairline border-ink/10` containing an **outline** `<Bookmark size={28} className="text-accent" />`; `mt-[22px]` title "Nothing kept yet" `text-ink-hi text-[23px] font-semibold`; `mt-[9px]` body `max-w-[250px] text-center text-[15px] leading-[1.5] text-ink/55`: **"Tap the bookmark on anything that catches you. It'll wait for you here — no rush, no expiry."**; `mt-[26px]` CTA `Button` (accent pill — reuse `~/components/ui/button` primary/pill variant) "Back to exploring" → `leaveSaved()`.

**Filtered-empty state** (total > 0 but active collection has nothing — reachable via a 0-count chip or stale URL): centered muted line, feed-empty styling (`text-ink/40 text-[14px] py-24`): **"Nothing in this collection yet."** — flag in a comment as an addition; the prototype's filters can't hit this state.

**Loading**: while `list.isPending`, centered `Spinner` (`py-24`). **Toast**: existing `Toast`, `raised`, text **"Removed from Saved"**, `durationMs={1700}` (prototype's hold).

## 5. Implementation order

1. `chip.tsx` size prop + its tests.
2. `onLongPress` optional on `image-tile.tsx` / `article-card.tsx` (run `bun run typecheck` — feed callers unaffected).
3. `saved-origin.ts`; `collections-sheet.tsx` marker line; sheet test.
4. `collection-chips.tsx`, `saved-tile.tsx`, `saved-screen.tsx`, then `src/app/saved/page.tsx`.
5. `saved-screen.test.tsx`; integration test addition.
6. `e2e/saved.spec.ts`.
7. `bun run check` (typecheck + lint + format + vitest), then `bun run e2e`.

Comment generously throughout, in the repo's explanatory house style (why, not what — every existing file above is the model).

## 6. Testing

### 6.1 Component tests — `src/components/saved/saved-screen.test.tsx`
`// @vitest-environment jsdom`, mocks modeled on `src/components/feed/feed-screen.test.tsx` (`vi.hoisted` state holders; mock `~/trpc/react` with `saves.list/collections/count.useQuery`, `saves.unsave.useMutation`, `useUtils`; mock `next/navigation` `useRouter`/`useSearchParams`). Cases:
1. Renders both tile kinds from `saves.list` data inside two columns, each with `data-saved-id`.
2. Header count line: "2 things kept" / "1 thing kept"; chips render "All · 2", "Articles · 1", zero-count collection renders bare label; All chip `aria-pressed=true` with no param; with `?collection=c1`, that chip is pressed and the list query received `{ collectionId: "c1" }`.
3. Chip tap calls `router.replace("/saved?collection=c1")`; All chip tap → `router.replace("/saved")`.
4. Unsave badge click fires `unsave` with the tile's `itemId`; success path shows the "Removed from Saved" toast and invalidates `saves.list`/`collections`/`count`.
5. Image tile tap pushes `/g/{id}` **and** writes `sessionStorage["ambit.galleryOrigin.v1"] === id`; article tile tap pushes `/i/{id}` and does **not** write `ambit.feedOrigin.v1`.
6. `count === 0` renders the empty state copy + CTA and no chips; total > 0 with an empty filtered list renders "Nothing in this collection yet."
7. The pill renders with the bookmark filled white (`on-saved`) and no Share button.

### 6.2 Router integration — `src/server/api/routers/routers.integration.test.ts`
One new `it` in the existing saves describe, e.g. `"5.9 — the chips' arithmetic: every collection count matches its filtered list, and All matches the unfiltered list"`: save item 1 → Articles, item 2 → Art; for each row of `caller.saves.collections()`, assert `(await caller.saves.list({ collectionId: c.id })).length === c.itemCount`; assert `(await caller.saves.list()).length === await caller.saves.count()`. (This is the done bar's "chip counts match router integration tests" — the counts the chips display are provably the lists the chips filter to.) Follow the file's existing cleanup/user conventions.

### 6.3 E2E — `e2e/saved.spec.ts`
Copy `e2e/feed.spec.ts`'s scaffolding wholesale: `test.describe.serial`, timestamped `EMAIL`, `connect()` env-then-dynamic-import, seeded corpus of ~12 items under `sourceId` prefix **`e2e-saved-%`** (topics astronomy/botany/music, `PIXEL` data-URI images, `curationScore: 9`), `afterAll` cleanup scoped to that prefix children-first. **Do not** model anything on `e2e/gallery.spec.ts`'s multi-screen doorway test (its :193 neighborhood is environment-flaky); keep each test's navigation chain short. Tests:
1. **Sign-up + empty state** — full sign-up → onboarding → `/feed` (feed.spec lines 118-136 verbatim), then `goto("/saved")`: "Nothing kept yet" visible, no chips; "Back to exploring" lands on `/feed`.
2. **The done-bar round trip** — `onFeed()`; long-press the first tile (feed.spec 189-195 mechanics); pick "Articles"; capture the tile's `data-feed-id`; pill "Save to collection" → sheet → "Everything kept" → `waitForURL(/\/saved/)`; expect `[data-saved-id="${id}"]` visible, "1 thing kept", chips "All · 1" and "Articles · 1"; click `Remove from Saved` within that tile; expect toast "Removed from Saved", the tile gone, and the empty state back.
3. **Chips filter, counts live** — via Drizzle, insert two `savedItem` rows for this user (look up the user row by `EMAIL`, the Articles collection row created in test 2): one seeded *image* item into Articles, one seeded *article* item with `collectionId: null`; `goto("/saved")`: "2 things kept", "All · 2", "Articles · 1"; tap "Articles" → URL has `?collection=`, only the image tile remains; tap a zero-count chip ("Art") → "Nothing in this collection yet."; tap "All" → both back.
4. **Tile navigation** — from `/saved`: click the image tile → `waitForURL("/g/{imageItemId}")`; `page.goBack()` (returns to `/saved`); click the article tile → `waitForURL("/i/{articleItemId}")`, `h1` visible.
5. **Leaving Saved keeps the feed intact** — `onFeed()`, record `data-feed-id`s; pill → "Everything kept" → `/saved`; install the request listener from feed.spec 240-245; click "Back to feed"; `waitForURL(/\/feed$/)`; same ids, zero `feed.page`/route draws.

## 7. Deferred / flagged (record in the walkthrough, not code)

- **Public share-collection `/c/{collection}`: deferred entirely.** No share affordance anywhere on `/saved` (pill has no Share, matching the feed's "share what?" rationale). Nothing to degrade — no prototype screen exists for it either.
- **Collection creation lives in 5.10** (`docs/BUILD_PLAN.md` 5.10 entry). Chips therefore show only the three seeded defaults plus any collections that acquire saves; the sheet's "New collection" signpost row already points at `/profile`.
- **Reachability (open question — flag, don't fix):** Saved remains two hops from the feed (pill bookmark → sheet → row). 5.9 does not add a nav entry — possibly intentional restraint per BUILD_PLAN; 5.10's Settings adds a "Saved with live count" shortcut card. Surface this to Ben in the walkthrough.
- **No `saves.list` pagination** — accepted for v1; revisit only if a real account's list gets slow.
- **Reader-entry back seam** (Decision 3): swipe-back from a Saved-opened item page goes to a fresh `/feed?focus=`, not Saved. Known, commented, cheap to revisit if the device pass dislikes it.

## 8. Done-bar verification

- `bun run check` green (typecheck, eslint, prettier, vitest — expect ~15 new tests).
- `bun run e2e` green across the whole suite (the new spec plus no regressions in `feed`/`item`/`gallery`/`auth`), ideally three consecutive runs per house convention. Environment note: a red `e2e/gallery.spec.ts:193` is a known dev-DB flake, not evidence about this branch (see CLAUDE.md).
- `bun run build` clean.
- Manual: hard-reload `/saved` with the Network tab open — the masonry paints filled with no client `saves.list` request (hydration handoff), and chip taps issue exactly one.

## 9. Wrap-up (house conventions)

- Write `docs/PHASE5_WALKTHROUGH_5.9.md` (same format as 5.8's), including the deferred/flagged list from §7.
- Update `docs/BUILD_PLAN.md` (check off 5.9, note the two scope reinterpretations + deferrals) and extend `log.md` per its format — including the session-spend line from `python3 ~/.claude/scripts/session-spend.py --session <session-uuid>` (never estimate; omit if the script exits non-zero).
- Merge `feat/5.9-saved-collections-ui` back to `main` when green.

### Critical files for implementation
- `src/components/feed/feed-screen.tsx` (the screen pattern being mirrored: queries, masonry render, pill/sheet/toast wiring)
- `src/server/api/routers/saves.ts` (the complete backend contract this UI sits on)
- `src/components/feed/masonry.ts` (`buildTiles`/`packColumns`/`IMAGE_ASPECTS` reused verbatim)
- `src/components/sheets/collections-sheet.tsx` (existing `/saved?collection=` links; gains the saved-origin marker)
- `e2e/feed.spec.ts` (the scaffolding, seeding, and no-redraw assertion patterns the new spec copies)
