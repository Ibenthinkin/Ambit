# Phase 5.7 — Item pages: detailed execution plan

**Status: ready to execute.** Written to be executed cold, by a session that has not read the
research behind it. Everything you need is in this document; where it says "verified", the claim
was checked against the repo, the prototypes, or the docs at plan time (08-20-26), not inherited.
You should not need to open the prototypes — every px/ms value they contribute is inlined below.

**What this phase is.** The `/i/[itemId]` stub (shipped in 5.6 so feed taps had somewhere to land)
is replaced wholesale by the real item pages: an **image variant** and a **reader variant** keyed
on `item.type`, a param-driven shared-by row, a "where Ambit would wander next" teaser backed by a
new public tRPC procedure over the topic graph, a join CTA for signed-out visitors, OG/Twitter
metadata, and a horizontal swipe-back with rubber-band follow. Riding along, by explicit prior
decision: the **image proxy** (`/api/img/[itemId]`) that lifts the AIC suspension and powers the
share sheet's Save-image row; the **seen-on-receipt** fix to `feed.page`; and the generalized
`from: <source>` **credit line** on every item, every source (the 08-20-26 BUILD_PLAN addendum).
5.8's gallery is *entered from* these pages, so this phase also leaves that doorway (as a no-op
for now).

**Source of truth.** `docs/BUILD_PLAN.md` 5.7 for scope; the prototypes
`docs/design_handoff_ambit_pwa_redesign/Ambit - Item Image.dc.html` and `Ambit - Item Text.dc.html`
for design, under the standing convention that **prototypes win over the README** — with one
deliberate exception: the prototypes' navigation mechanism (always `location.href` push) loses to
the measured evidence that back must **pop** history (see T7). Recreate, don't port.

**Done bar (BUILD_PLAN, verbatim):** incognito visit renders both variants + teaser; OG preview
correct; no user data leaks; swipe-back works on iOS.

**Reference reading before you start** (~15 minutes):

- `src/app/i/[itemId]/page.tsx` — the stub you're replacing; its header comment lists what 5.7 owes.
- `src/components/feed/feed-origin.ts` + `src/components/item/back-to-feed.tsx` — the pop-vs-push
  back logic you'll generalize (and then delete the component).
- `src/server/services/feed.ts` — top-of-file types + the cursor design note (T4 rewrites it) +
  `hop()` (T5 mirrors its softmax weighting).
- `src/components/ui/pill-toolbar.tsx`, `src/components/sheets/save-to-collection-sheet.tsx`,
  `share-sheet.tsx` — the primitives the item shell wires together.
- `docs/HANDOFF_aic-images.md` — why the proxy exists and what it must (not) send.
- `docs/PHASE5_WALKTHROUGH_5.6.md` — the hazards list from the adjacent screen.

---

## Decisions locked with Ben (do not relitigate)

1. **Reader body = stored `body` + backfill.** The ingester stores Wikipedia bodies with
   `exsectionformat=plain` (verified: `src/server/services/sources/wikipedia.ts` line ~179), so
   existing rows carry **no** `== heading ==` markers. Switch the adapter to
   `exsectionformat=wiki` going forward and backfill existing rows; the reader parses wiki-format
   headings from stored text. No runtime Wikipedia dependency.
2. **Image proxy ships now** (`/api/img/[itemId]`), not at 7.3. It lifts the AIC suspension
   (1,338 images / 17.5% of corpus, localhost-referer 403) and enables the Save-image row
   deferred from 5.5. Resizing/IIIF/CDN caching stay at 7.3.
3. **Signed-out visitors get NO pill toolbar** — content + credit line + shared-by + teaser +
   join CTA only. The pill renders solely for authenticated users; no protected query ever fires
   for anon.
4. **Seen-marking moves from render-time to receipt** (log.md 08-20: "carry it into the 5.7
   plan") — `getFeedPage` stops writing `seen_item` during server renders whose output can be
   discarded; a client ack mutation marks items seen.

## Design decisions taken at plan time (flagged, with rationale — keep unless Ben objects)

- **Teaser on BOTH variants.** The redesign prototype has it image-only, but the BUILD_PLAN Done
  bar ("both variants + teaser") is authoritative. Teaser rows are `<Link>`s to `/i/{id}`
  (prototype rows were inert).
- **Shared-by param is `?from=`** (`/i/abc?from=Mara`), capped at 40 chars, text-only render
  (React escapes), no persistence — BUILD_PLAN calls it "param-driven".
- **Join CTA drops the "Keep browsing without an account →" link** — there is no public browse
  surface (`/feed` is auth-gated), so it would dead-end at the landing redirect. "Get your
  invite" links `/`. Signed-in users see no CTA at all.
- **Hero image tap is a no-op until 5.8** (no handler, no cursor-pointer). A tap affordance that
  goes nowhere is worse than none; 5.8 wires the gallery.
- **`BackToFeed` is deleted**; its pop-vs-push logic becomes a shared `useLeaveToFeed` hook used
  by both the swipe gesture and the pill's Feed button. Back must **pop** history when the visit
  came from the feed (`cameFromFeed`) and only **push** `/feed?focus={id}` for cold-opened links —
  a pushed navigation to the dynamic `/feed` burns ~24 corpus items (measured, log.md 08-20).
- **Credit line** `from: <source>` is a shared component under the title on both variants,
  linking `item.sourceUrl`, label via `sourceLabel()` (`src/lib/source-label.ts`) — every source,
  not just blogs. Blog extras (blurb, prominent link-out styling) are 6.3, NOT now.
- **Proxy rate limiting**: a separate, generous `RateLimiter` instance (600/min per IP). It must
  NOT share the tRPC limiter instance (120/min — one feed page loads ~24 images and would starve
  the API).
- **`data:` image URLs bypass the proxy client-side** (the e2e corpus seeds base64 pixels as
  `imageUrl`; branching in the client beats teaching the proxy to fetch `data:`).
- **Wander-next falls back to the item's own topic** when neighbor-topic pools are empty
  (mirrors `pickDrift`'s no-bridge fallback), so the teaser renders deterministically in e2e/CI.
- **Save image** row: try `navigator.share({ files })` when `navigator.canShare` allows (the real
  iOS camera-roll path); fall back to a same-origin `<a download>` on `/api/img/{id}`.

## House rules that apply throughout (verified)

- `bun run check` is the full gate; e2e via `bun run e2e` (Playwright outputDir
  `./.playwright/test-results` — load-bearing, don't change it).
- Plain `<img>` always, never `next/image`. Tailwind v4 CSS-first tokens live in
  `src/styles/globals.css` (`--radius-tile` 18px is literally labeled "item-page hero image";
  `.border-hairline`; `animate-rise` + the `Rise` primitive; 4-accent knob via `data-accent`).
  Sora font.
- DB repo files dynamic-import `./client` (envless CI); integration tests self-skip without
  `DATABASE_URL`.
- `/i/*` stays ungated in `src/proxy.ts` — do not add it to the matcher.
- Component tests: jsdom via a first-line `// @vitest-environment jsdom` docblock; patterns in
  `src/components/item/back-to-feed.test.tsx` (next/navigation + next/link mocks),
  `src/components/feed/feed-screen.test.tsx` (tRPC react mock),
  `src/server/api/routers/routers.test.ts` (`createCaller` + `anonContext()`/authed context).
- Comment generously — the repo teaches.

---

## Tasks

T1–T5 are mutually independent (disjoint files) — any order, each its own commit with
`bun run check` green. T6 needs T1+T3+T5. T7 needs T6. T8 needs T7. T9 last.

### T1 — Reader-blocks parser (pure lib)

**Create** `src/lib/reader-blocks.ts` + `reader-blocks.test.ts`.

```ts
export interface ReaderBlock { kind: "heading" | "subheading" | "paragraph"; text: string }
export function parseReaderBlocks(body: string): ReaderBlock[]
```

Port the prototype parser (`Ambit - Item Text.dc.html` ~lines 333–350):

- Split on `\n`, trim, drop empties.
- Heading: `/^(=+)\s*(.+?)\s*=+$/`; depth (count of `=`) ≤2 → `heading`, deeper → `subheading`.
- A heading matching
  `/^(see also|references|further reading|external links|notes|bibliography|citations)$/i`
  starts a dropped region: that heading and every line until the next non-matching heading are
  discarded.
- Non-heading lines: drop if `line.replace(/[\s=+\-*/^(){}[\]|,.]/g, "").length < 3`
  (degenerate formula fragments — single glyphs, bare operators, stray digits).

Tests (node env, pure): both heading depths; References section + its body dropped; drop region
ends at the next kept heading; degenerate-line drop; plain-format body (no markers) degrades to
all-paragraphs; empty/whitespace body → `[]`.

### T2 — Wikipedia adapter change + backfill script

**Modify** `src/server/services/sources/wikipedia.ts` (`fetchBody`, ~line 179):
`exsectionformat=plain` → `exsectionformat=wiki`; update the doc comment (bodies now carry
`== Heading ==` markers consumed by `parseReaderBlocks`). Add a `fetchBody` unit test (mock
`fetchJson` from `./http`): asserts the request URL contains `exsectionformat=wiki` and the
50 000-char truncation.

**Create** `scripts/backfill-wikipedia-bodies.ts` (Bun, in `scripts/ingest.ts` style — flag
parsing, summary table):

- Select `id, sourceId` from `item` where `source = 'wikipedia'`. Flags `--limit N`, `--dry-run`.
- Sequentially `fetchBody(Number(sourceId))` (its built-in 120ms delay + retry is the politeness
  layer); on success update **only** `body` (never `fetchedAt` or anything else); on null, warn
  and continue. Progress log every 50 rows; final summary (updated / skipped / errors / elapsed).
- Never calls the curator or `upsertItem` — this is a body-only refresh.
- Header note: one-off for existing rows (going-forward ingests get wiki-format automatically);
  run manually after merge, never in tests/CI.

### T3 — Image proxy + wiring + AIC un-suspension

**Create** `src/app/api/img/[itemId]/route.ts` + `route.test.ts`. **Modify**
`src/components/feed/image-tile.tsx`, `src/server/config/suspended-sources.ts`, plus any
`feed-screen.test.tsx` assertions that pin `<img src>` to `item.imageUrl` (fixtures there use
`https://example.test/...` — search that file for `imageUrl`).

Route `GET(req, { params: Promise<{ itemId }> })`:

1. Rate limit first: module-level `new RateLimiter({ limit: 600, windowMs: 60_000 })` keyed on
   `trustedClientIp(new Headers(req.headers)) ?? "unknown"` (both from
   `~/server/services/rate-limit`); exceeded → `429` + `Cache-Control: no-store`. Comment: a
   deliberately separate instance from the tRPC limiter (120/min) — one feed page is ~24 images.
2. `getItemById(itemId)`; no item / no `imageUrl` / not `http(s):` → `404` + `no-store`.
   **itemId lookup only — the route never accepts a URL** (this is the SSRF/open-proxy boundary;
   say so in a comment).
3. Upstream `fetch(item.imageUrl, { headers: { "User-Agent": USER_AGENT, Accept: "image/*" },
   signal: AbortSignal.timeout(15_000) })` — `USER_AGENT` from `~/server/services/sources/http`.
   Send **no Referer** — the server-side omission is exactly what defeats AIC's localhost-referer
   403 (`docs/HANDOFF_aic-images.md` §2.2).
4. Non-OK / throw → `502` + `no-store` (failures must never be cached). Success → stream
   `upstream.body` with content-type passthrough (default `image/jpeg`) +
   `Cache-Control: public, max-age=31536000, immutable`. Comment: `imageUrl` can change on
   re-ingest and the long TTL accepts that staleness; resizing (HANDOFF §2.4 / IIIF `!843,843`)
   is deliberately deferred to 7.3.

**Wire consumers:** in `image-tile.tsx`,
`const src = item.imageUrl.startsWith("data:") ? item.imageUrl : \`/api/img/${item.id}\`` in the
`<img>`; keep the retry machinery, the fallback tile, and the dev diagnostic label showing the
ORIGINAL host (`new URL(item.imageUrl).hostname` — that label exists for exactly this diagnosis);
update the two stale "until the image proxy lands in 5.7" comments. The item hero, OG image, and
Save-image row (T6/T7) also use `/api/img/{id}`.

**Un-suspend AIC:** `SUSPENDED_SOURCES: SourceId[] = []` in
`src/server/config/suspended-sources.ts`. Keep the machinery; rewrite the aic paragraph as
history (suspended 08-20-26, lifted by 5.7's proxy; the phone-path second cause, HANDOFF §Q2, is
what the 5.7 device pass verifies).

**Route tests** (node env; `vi.mock("~/server/db/items")` + stub `global.fetch`): unknown id →
404; no `imageUrl` → 404; `data:` URL → 404 (proxy is http(s)-only); happy path → 200 + immutable
cache header + content-type passthrough; upstream 403 → 502 `no-store`; upstream called with the
stored URL, the Ambit UA, and no `Referer`; the 429 branch (a small-limit override or an
`allow()` loop — keep it simple; the `RateLimiter` class itself is already covered in
`rate-limit.test.ts`).

### T4 — Seen-marking moves to receipt (`feed.markSeen`)

**Modify** `src/server/services/feed.ts`, `src/server/api/routers/feed.ts`,
`src/components/feed/feed-screen.tsx`, `src/server/db/schema.ts` (comment only) + tests:
`feed.test.ts`, `feed.integration.test.ts`, `routers.test.ts`, `routers.integration.test.ts`,
`feed-screen.test.tsx`.

**Why the cursor anchor math survives (write this into the code comments):** today exclusion =
`served_at < anchor` ∪ `prev`. With receipt marking, acks land at `T_ack > servedAt`; page N's
ids are excluded from page N+1 via `prev`, and pages ≤ N−1 were acked before page N was composed,
so their `served_at < anchor(N+1)`. Refetching cursor N excludes only `served_at < anchor(N)`,
and page N's own ack timestamps are later than that anchor — so the identical page reproduces.
The one new failure mode: a lost/slow ack racing a fast scroll can repeat one page — cosmetic and
self-limiting, vs. 1,116 items burned in six minutes (log.md 08-20).

1. **`getFeedPage`** (~line 519–523): delete the `markSeen` call + its import; keep capturing
   `servedAt` as the next cursor's anchor (now purely "the page-boundary instant"). Rewrite the
   cursor design note and step 4 of the orchestration doc comment. `db/feed.ts`'s `markSeen`
   stays — it's now the mutation's repo call. Update `schema.ts`'s `seenItem.servedAt` comment
   (the "same JS Date value" story becomes the receipt story above).
2. **Router:** `markSeen: protectedProcedure.input(z.object({ itemIds:
   z.array(z.string()).min(1).max(64) })).mutation(...)` → `markSeen(ctx.user.id, input.itemIds,
   new Date())`; a static import is safe (`db/feed.ts` dynamic-imports its client internally).
   Cap 64 mirrors `MAX_CURSOR_PREV` — comment why. Return `{ ok: true } as const`.
3. **Client** (`feed-screen.tsx` — it already has `const pages = React.useMemo(...)` at ~line
   73): `api.feed.markSeen.useMutation()` + an effect that acks each page exactly once per mount,
   keyed by the first card's item id in a `useRef(new Set<string>())`. Comment: re-acking after a
   back-pop remount is deliberate and harmless (`onConflictDoNothing`, first-write-wins keeps
   timestamps stable); the byte-identical `feed.page` prefetch-input constraint is untouched — a
   mutation is not part of the query input.
4. **Tests:** `feed.test.ts` — flip the markSeen assertions to "getFeedPage never calls
   markSeen" (keep the mock to prove the negative). `feed.integration.test.ts` — the sequential
   tests now ack (call `markSeen` from `~/server/db/feed`) after receiving each page, before
   requesting the next; the refetch-stability test (fetch → ack → refetch same cursor → identical)
   is the new load-bearing one. `routers.test.ts` — anon UNAUTHORIZED (join the existing list);
   authed forwards `(userId, ids)`. `routers.integration.test.ts` — markSeen writes rows readable
   back; `feed.page` no longer inserts `seen_item` (count before/after). `feed-screen.test.tsx` —
   extend the tRPC mock with `feed: { markSeen: { useMutation: ... } }`; one `mutate` per page
   with that page's ids, no duplicate ack on re-render. e2e `feed.spec.ts` stays green as-is (its
   back-test request filter matches `feed.page` and `/feed` only; `feed.markSeen` doesn't trip it).

### T5 — New procedures: `items.wanderNext` + `saves.forItem`

**Create** `src/server/services/wander.ts` + `wander.test.ts`. **Modify** `src/server/db/items.ts`,
`src/server/db/saves.ts`, `src/server/api/routers/items.ts`, `src/server/api/routers/saves.ts` +
router/integration tests.

1. **`drawFromTopic`** (`db/items.ts` ~line 165) gains the suspended-source filter:
   `notInArray(item.source, SUSPENDED_SOURCES)` when non-empty — same guard shape + "retroactive
   switch" comment as `db/feed.ts` lines 81–83. (Currently only `getTopicPools` filters; wander
   must too, and probe-feed benefits.)
2. **`wander.ts`**, mirroring feed.ts's pure-core/impure-shell split:
   - Pure `pickWanderTopics(topicId, graph, rng, count = 3)`: up to 2 distinct topics from the
     positive-sim head of the graph row (softmax with `DEFAULT_KNOBS.temp` via the same
     `Math.exp(sim / temp)` weighting as feed.ts's `hop()` — a small local copy with a pointer
     comment beats exporting `hop`) + 1 from the bottom half of the row
     (`row.slice(Math.floor(row.length / 2))`, uniform). Dedupe; never return the start topic.
   - Impure `getWanderNext(itemId, rng = Math.random): Promise<{id, title, reason}[]>`:
     `getItemById` (missing → `[]`); per picked topic
     `drawFromTopic(topic, { scoreFloor: DEFAULT_KNOBS.scoreFloor, excludeIds: [itemId,
     ...picked], limit: 1, rng })`; **fallback**: while fewer than 3 rows, draw from the item's
     OWN topic (excluding itemId + picks). Reasons via topic labels from `TOPICS`
     (`~/server/config/topics`): drift → `a drift from X into Y`; jump → `a longer leap, from X
     to Y`; own-topic → `more from X`. The copy may be polished but must stay topic-anchored,
     never user-anchored — **it renders for anon; no user data by construction**. Return only
     `{ id, title, reason }` — nothing else crosses the wire.
   - Tests: pinned rng (`mulberry32`/`hashSeed` from `~/server/services/random`, as
     `feed.test.ts` does); no graph row → own-topic fallback; missing item → `[]`; reason string
     shapes; mocked `db/items` for the shell.
3. **`items.wanderNext`** in `routers/items.ts`:
   `publicProcedure.input(z.object({ itemId: z.string() })).query(...)`. Comment: the
   second-ever public procedure; public because the teaser renders for incognito (SPEC §8.1's
   share target); rate-limited by the shared middleware like `items.byId`.
4. **`saves.forItem`**: add `getSavedItemCollection(userId, itemId)` to `db/saves.ts` (select
   `collectionId` where user+item, limit 1; `undefined` = unsaved); router (protected) returns
   `{ saved: true, collectionId } | { saved: false, collectionId: null }`.
5. **Router tests:** `saves.forItem` anon UNAUTHORIZED; `items.wanderNext` **works anon** (the
   boundary test in the other direction — mock the service). Integration: wanderNext on a seeded
   item → ≤3 rows, none the item itself, no suspended sources; forItem round trip across
   save/unsave.

### T6 — The page: RSC, OG metadata, variants, credit line, teaser, CTA

**Rewrite** `src/app/i/[itemId]/page.tsx`. **Create** server components (no `"use client"`) in
`src/components/item/`: `credit-line.tsx`, `shared-by-row.tsx`, `wander-next.tsx`,
`join-cta.tsx`, `image-item-body.tsx`, `reader-item-body.tsx`. **Keep `BackToFeed` mounted this
task** (deleted in T7 together with the e2e rewrite) so the suite is green after every commit.

`page.tsx`:

- `const getItem = cache(getItemById)` (React `cache`) — dedupes between `generateMetadata` and
  the page render.
- `generateMetadata`: `metadataBase: new URL(env.BETTER_AUTH_URL)` (verified in `src/env.js`);
  title `` `${item.title} · Ambit` ``; description = summary clamped to ~200 chars; `openGraph`
  (title, description, `url: /i/${id}`, `siteName: "Ambit"`, `type: "article"`,
  `images: ["/api/img/{id}"]` **only** when `imageUrl` exists and isn't `data:` — scrapers can't
  use a proxy 404); `twitter.card` = `summary_large_image` with image, else `summary`. **Built
  purely from the item row — no user data in metadata, ever.**
- Body: `await params` / `await searchParams` (both Promises in Next 16); `notFound()` on miss;
  `auth.api.getSession({ headers: await headers() })` (`auth` from `~/lib/auth`, same as
  `feed/page.tsx` — the page is public; session only decides pill/CTA);
  `const wander = await api.items.wanderNext({ itemId })` via the server caller
  (`~/trpc/server`) — the teaser costs anon visitors zero client requests.
- Compose inside T7's `<ItemShell>`: a `pt-[68px] px-[22px] pb-[110px]` column on `bg-bg`
  (bottom padding clears the pill), sections staggered with `Rise` (~0/50/120/160ms):
  1. `SharedByRow` — only when the `from` param is a non-empty string ≤40 chars: 24px accent
     circle (`bg-accent text-on-accent`, Sora 600 12px, first char uppercased) +
     `"{from} shared this with you"` 12.5px `text-ink/50`. Never rendered otherwise.
  2. Variant by `item.type`:
     - **image** (`image-item-body.tsx`): hero `<img>` (`data:` bypass else `/api/img/{id}`)
       `h-[300px] w-full rounded-tile object-cover`, `alt={item.title}`, **no tap handler**;
       title Sora 28px/1.16 `text-ink-hi` — keep it the page's `<h1>` (an e2e assertion relies
       on it); maker line `item.attribution ?? sourceLabel(item.source)` 13px `text-ink/50`;
       `CreditLine`; body = `item.summary` 17px/1.6 `text-ink/72`.
     - **article** (`reader-item-body.tsx`): eyebrow `sourceLabel(source)` uppercase 10.5px/600
       tracked `text-accent`; `<h1>` Sora 600 30px/1.16 `text-ink-hi`; `CreditLine`; lede =
       summary 17px/1.5 `text-ink/62`; 0.5px hairline; `parseReaderBlocks(item.body ?? "")`
       mapped — heading Sora 600 19px/1.3 `text-ink-hi` mt-[26px] mb-[10px]; subheading 15px/600
       `text-ink/72` tracking-[0.4px]; paragraph 16px/1.72 `text-ink/78` mb-4; no body → nothing
       extra (the lede already shows). Then the generalized link-out:
       `Read on {sourceLabel(source)} →` in accent, `href={item.sourceUrl}` `target="_blank"
       rel="noopener"`.
  3. `WanderNext` (both variants; hidden entirely when `wander.length === 0`): accent rule
     20×0.5px @50% opacity + eyebrow `WHERE AMBIT WOULD WANDER NEXT` 11px/600 tracking-[1.2px]
     `text-ink/40` uppercase + rows as `<Link href={/i/${id}}>` cards (`bg-ink/3 border-hairline
     border-ink/7 rounded-[14px] px-[15px] py-[13px]`, `Diamond` icon from `~/components/icons`
     `text-accent` size 9, title 16px `text-ink`, reason 11.5px `text-ink/44`).
  4. `JoinCta` — **signed-out only**: radius-22 hairline `Card`, centered. Image variant:
     "Curiosity, without the doomscroll." 24px/1.22 + support copy + accent pill
     `Get your invite` (`bg-accent text-on-accent rounded-pill`) → `/`. Article variant: the
     reduced card (22px heading, shorter copy, quiet accent link `Get your invite →` → `/`).
     No "Keep browsing" link. Signed-in: render nothing.
- `CreditLine`: `from: <a href={sourceUrl}>{sourceLabel(source)}</a>` — 13px `text-ink/50`, link
  in accent.

Tests (jsdom docblock + next/link mock, pattern `back-to-feed.test.tsx`): `reader-item-body`
renders headings + drops References (thin over T1, proves wiring); `WanderNext` hidden-when-empty
/ reasons / hrefs; `JoinCta` variant copy; `SharedByRow` initial derivation.

### T7 — Client layer: shell, pill, sheets, swipe-back

**Create** `src/components/item/item-shell.tsx` (client), `src/hooks/use-swipe-back.ts` + test,
`src/hooks/use-leave-to-feed.ts` + test. **Modify** `src/components/sheets/share-sheet.tsx` +
`sheets.test.tsx`, `src/components/icons/index.tsx` (add `Download`). **Delete**
`src/components/item/back-to-feed.tsx` + its test; rewrite the one e2e test **in the same
commit**.

1. **`useLeaveToFeed(itemId)`** → returns `leave()`:
   `cameFromFeed(itemId) ? router.back() : router.push(\`/feed?focus=${itemId}\`)`. This is THE
   back path — pop when the visit came from the feed, push `?focus=` only for cold opens (see the
   measured-cost comment in `feed-origin.ts`). Migrate `back-to-feed.test.tsx`'s cases: marker
   present → `back()`; absent → push; marker for another item → push. (`vi.mock("next/navigation")`
   with hoisted mocks, `sessionStorage` + real `markFeedOrigin`.)
2. **`useSwipeBack({ onCommit })`** → returns a ref for the content wrapper. Pointer events only
   (not the prototype's double touch+pointer registration): `pointerdown` records `x0,y0`;
   `pointermove` (never `preventDefault`) abandons when `|dy| > |dx|` (clear transform), else
   `el.style.transform = translateX(dx * 0.35px)` — the rubber-band follow;
   `pointerup`/`pointercancel` sets `transition: transform .22s ease`, clears the transform, and
   commits `onCommit()` when `|dx| > 70 && |dy| < 70`. The wrapper carries
   `touch-action: pan-y` (the scroller is the window, as on `/feed`). Native listeners on the
   ref'd node, cleaned up on unmount. jsdom tests: 0.35× follow, vertical abandon, >70px commit,
   sub-threshold snap-back without commit.
3. **`ItemShell`** props `{ itemId, title, hasImage, authed, appUrl, children }` (all from the
   RSC; `appUrl = env.BETTER_AUTH_URL`; `viewerName` = first token of `session.user.name` when
   authed):
   - Wraps `children` in the swipe wrapper: `useSwipeBack({ onCommit: leave })` with
     `leave = useLeaveToFeed(itemId)`.
   - **Authed only**: `PillToolbar` with `onHome={leave}` (NOT the default `/feed` push — that is
     the corpus-burning path), `onShare`/`onBookmark` opening the sheets, `bookmark` from
     `api.saves.forItem.useQuery({ itemId }, { enabled: authed })` (`saved` → `"saved"`, else
     `"idle"`). Signed-out: no pill, no sheets, no protected queries — nothing renders.
   - `SaveToCollectionSheet` with `currentCollectionId={saved.data?.collectionId ?? undefined}`;
     `onSaved` → toast `Saved to {name}` + `utils.saves.forItem.invalidate()`; `onError` → toast.
   - `ShareSheet` with `url={\`${appUrl}/i/${itemId}${viewerName ?
     \`?from=${encodeURIComponent(viewerName)}\` : ""}\`}`, `title`, `imageContext={hasImage}`,
     `onSaveImage` (below), `onCopied` → toast `Link copied`, `onShareUnavailable` → toast.
     `Toast raised`.
4. **Save-image row in `ShareSheet`**: wire the reserved `imageContext` prop (verified: exists,
   unused, comment says it was reserved for exactly this) + a new optional
   `onSaveImage?: () => void`; render only when both are present, below an `mx-[18px]` hairline
   divider: `Download` icon (add to icons: 24-grid, paths `M12 3v13` / `M8 12l4 4 4-4` /
   `M4 19h16`, strokeWidth 1.9, `currentColor`; rendered `text-accent` size 18), "Save image"
   14.5px/500 + "Adds the full-resolution image to your camera roll" 11.5px `text-ink/42`.
   Handler (in `ItemShell`): fetch `/api/img/{id}` → blob → `File`; if
   `navigator.canShare?.({ files: [file] })` → `navigator.share({ files: [file] })` (AbortError
   = silent, like the existing share path); else `<a download>` + object URL; success/failure
   toasts. `sheets.test.tsx`: the row renders only with `imageContext && onSaveImage`; the
   article share sheet must not show it.
5. **e2e `feed.spec.ts`**: the test "returning from an item page restores the same feed without
   drawing new items" now triggers via `page.getByRole("button", { name: "Feed" })` (the pill;
   the e2e user is authed) instead of the deleted `← Back` link; every other assertion unchanged
   (waitForURL `/\/feed$/`, identical `data-feed-id` sets, zero new draws). Its
   `getByRole("heading")` assertion holds because the item title stays an `<h1>`.

### T8 — e2e: `e2e/item.spec.ts`

Copy `feed.spec.ts`'s scaffolding (dynamic Drizzle connect after `process.loadEnvFile`,
`source: "e2e"` seeding, timestamped user, afterAll cleanup children-first). Seed: one **article**
with a wiki-format body fixture (`== A section ==`, `=== A subsection ===`, a paragraph,
`== References ==` + a line under it); one **image** item (data-uri PIXEL); optionally a third
imageless article for the twitter-card case. `curationScore: 9`, real topic ids (e.g.
`astronomy`).

1. **Incognito image variant** (default context, never signed in): `/i/{imageId}` → h1 visible;
   credit line with `href` = the seeded `sourceUrl`; hero `<img>` visible; teaser eyebrow "Where
   Ambit would wander next" visible (the own-topic fallback guarantees rows); "Get your invite"
   visible; **no pill** (`Save to collection` / `Share` button counts 0).
2. **Incognito reader variant**: section heading rendered; the References line **absent**;
   `Read on E2e →` link (`sourceLabel`'s title-case fallback) with correct href; reduced CTA;
   no pill.
3. **OG meta**: `meta[property="og:image"]` content ends `/api/img/{imageId}`; `og:title`
   contains the title; `twitter:card` = `summary_large_image` (image item) / `summary` (imageless
   article).
4. **No user-data leak**: incognito `page.content()` contains neither the e2e account's email nor
   name; "shared this with you" absent without the param; with `?from=Mara`, exactly
   "Mara shared this with you".
5. **Authed**: sign in (`support.ts`'s `signIn`), tap a feed tile, pill renders (Share button
   present — count 1, unlike the feed's 3-control pill), bookmark → save sheet → pick row →
   toast; reopen → "Already saved here".
6. **Proxy**: `request.get("/api/img/does-not-exist")` → 404 (the happy path is unit-tested in
   T3; e2e items use data-URIs, which bypass the proxy by design).
7. **Console-errors smoke** on both variants (mirror feed.spec's pattern).

Spec header note: the swipe gesture is unit-tested and verified in the phase's iOS device pass —
Playwright's mouse API doesn't compose these pointer events reliably.

### T9 — Docs

- **SPEC §7 table**: add `items.wanderNext` (query, `{itemId}`, public, `{id,title,reason}[]`),
  `saves.forItem` (query, protected), `feed.markSeen` (mutation, protected, `{itemIds}` max 64).
  Grep for "only public" / "one public" / "sole" — there are now **two** public procedures
  (§7 bullets, §11, `trpc.ts`/`items.ts` header comments all need the update).
- **SPEC §7 cursor paragraph + §9.4**: seen-marking is receipt-based as of 5.7; document the
  anchor-survival argument from T4.
- **SPEC §8.1**: `/i/[itemId]` as built (variants, credit line, `?from=`, teaser, CTA,
  swipe-back); add `/api/img/[itemId]` with the itemId-only SSRF contract + rate-limit note.
- **BUILD_PLAN 5.7**: status + the decisions taken (teaser both variants, CTA link omission,
  gallery-tap no-op → 5.8, `?from=`, `BackToFeed` → `useLeaveToFeed`, wander fallback) + the
  device-pass status.
- **`docs/HANDOFF_aic-images.md`**: dated postscript — proxy shipped, suspension lifted; device
  pass verdict on the phone-path second cause (Q2); production-origin question (Q3) open until
  deploy.
- **`log.md`** per its trigger rules (session-spend script; never estimate).

---

## Verification

1. Per task: `bun run check` green before each commit (T1–T5 independently committable; T6 keeps
   `BackToFeed` so e2e stays green mid-phase; T7 swaps the e2e back-test in the same commit that
   deletes it).
2. After T8: `bun run e2e` — three consecutive green runs (the repo's flake bar).
3. Backfill: `bun scripts/backfill-wikipedia-bodies.ts --limit 5 --dry-run` first, then the full
   run against the dev DB; spot-check a Wikipedia item's reader page renders styled headings with
   References dropped.
4. Manual dev pass: `/i/{imageId}` and `/i/{articleId}` in normal + incognito windows — both
   variants + teaser render incognito, no pill incognito, pill + sheets authed, credit line links
   out, AIC images now load through the proxy on the feed.
5. **iOS device pass** (the Done bar names it): swipe-back rubber-band follow + commit; back from
   a feed-tapped item restores the exact feed (pop, not push); Save image lands in the camera
   roll via the share sheet; AIC images on the phone (HANDOFF Q2 verdict).
6. OG preview: paste an `/i/{id}` URL into a preview debugger (or curl the HTML) — `og:image`
   resolves through `/api/img/`, no user data present.

## Out of scope (resist)

- Blog link-card extras (blurb, prominent link-out styling) — 6.3.
- Gallery entry from the hero tap, `sheet-gallery` animation — 5.8.
- Image resizing / IIIF sizing / proxy-with-cache CDN work — 7.3.
- The 60 items stuck with `topic_id = test-feed-topic-*` (separate cleanup, noted in log 08-20).
