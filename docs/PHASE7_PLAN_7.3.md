# Phase 7.3 — Performance + images: detailed execution plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Companion to `docs/BUILD_PLAN.md` Phase 7.3 — same format as `PHASE7_PLAN_7.2.md`. **Written to run unattended** after 7.2 (see `docs/PHASE7_OVERNIGHT.md`); every task has a checkable done-bar and a written fallback.

**Goal:** settle BUILD_PLAN's ⚖️ image-delivery gate the way the evidence has been pointing since 6.2 — **proxy-with-cache** — and make it true: `/api/img/[itemId]` keeps its one-origin, itemId-only contract and gains a disk cache plus a resize-to-WebP step, so every source image is fetched from upstream **once**, ever, and served small. Then measure the feed (it is already under the 300 ms bar — 143 ms p50 on 08-27-26) and remove the over-fetch that would stop it staying there, and run Lighthouse on a throttled mobile profile against the production build, fixing the cheap findings and recording the rest.

**Architecture:** a new service module `src/server/services/image-cache.ts` owns the cache: `getOrFill(item)` → `{ bytes, contentType }`, backed by one file per item under `IMAGE_CACHE_DIR` (default `.cache/img`, already gitignored), with an in-process in-flight map so concurrent misses share one upstream fetch, an atomic temp-file-then-rename write, and `sharp` producing ≤1600 px WebP at fill time. The route handler becomes thin: rate-limit → look up item → `getOrFill` → respond. A warm-up script fills the cache politely per source (the `tile.loc.gov` budget, solved as a one-time slow fill instead of reader-driven bursts). Feed: `getTopicPools` returns a narrow `PoolItem` projection; `getFeedPage` hydrates the ~24 winners by id. A bench script records p50/p95 before and after.

**Tech Stack:** Next.js 16.2 / Bun 1.3 / TypeScript strict / Drizzle over Postgres 17 / `sharp` 0.34.5 (libvips 8.17) / Vitest 4 / Playwright 1.62 / Lighthouse CLI (via `bunx`, needs the installed Google Chrome).

**Status: ready to execute cold.** Written 08-27-26 by a session that measured the feed (11,366 items, 18 topics; 8 pages p50 143 ms, all under 155 ms), confirmed `sharp` 0.34.5 is already in `node_modules` (Next's dependency) and works under Bun (3000×2000 PNG → 1600 px WebP in 46 ms), and read every file named below.

## Global Constraints

- **Do not make the tests weaker to make the gates green.** Same rule as 7.1/7.2. `route.test.ts` is *extended*, never trimmed: every existing case (404 on missing/`data:`/non-http, 429, 502 on upstream failure, no-store on failures, the itemId-only contract) must still pass.
- **The proxy's security boundary stays the itemId.** The cache key is the item id; the URL still comes only from the DB. Nothing in this phase may accept a caller-supplied URL, path, or size.
- **Never hit a museum harder than today.** The warm-up script is rate-limited per host and is run overnight for **`loc` only** (376 images at 1/s); the full warm is Ben's to start. Ingest is untouched.
- **Repo conventions:** comment generously (CLAUDE.md); `bun run format:write` then `bun run check` green before each commit; conventional-commit subjects; plain branch `feat/7.3-images-perf` off `main` (which now contains 7.2), merged back with `--no-ff` (no worktrees).
- **Local dev:** port 3000 must be Ambit's; `docker compose up -d`; a red DB-touching test on a busy machine is usually load; a red `gallery.spec:193` alone → `bun run e2e:clean --confirm` and one re-run.
- **Never commit `.env`**, the cache directory, or Lighthouse's HTML reports (JSON summaries only — see T5).
- **Do not** use the Agent tool, workflows, or deep-research unless Ben asks.

---

## Before you start

```bash
cd ~/Dev/ambit && git checkout main && git pull && git checkout -b feat/7.3-images-perf
lsof -ti:3000 || echo "port 3000 free"
docker compose up -d
bun run check && bun run e2e:prod      # both green before the first edit — if not, stop and report
grep '"version"' node_modules/sharp/package.json    # expect 0.34.5
bun -e 'import sharp from "sharp"; console.log("sharp ok", sharp.versions.vips)'
ls /Applications/Google\ Chrome.app >/dev/null && echo "chrome present"   # Lighthouse needs it
```

**Decisions locked (do not relitigate — settled with Ben 08-27-26):**

- **D1 — Image delivery = proxy-with-cache, in the existing `/api/img` route.** Not `next/image` (each width/quality variant would re-fetch upstream through the proxy — 2–3 hits per image where LoC's budget wants 1 — and every `<img>` site, the SW rule and the share sheet would change), not hotlinking (AIC's referer block and LoC's per-IP budget are why the proxy exists). Closes the BUILD_PLAN gate row and SPEC §15's `tile.loc.gov` item.
- **D2 — One variant per item: ≤1600 px on the longest edge, WebP quality 82, EXIF-rotated, no enlargement.** 1600 covers a 3× phone at the hero's rendered width and the gallery's full-bleed; a second thumbnail variant is a future knob, not a 7.3 deliverable. SVG and GIF are rasterised too (first frame) — the corpus has effectively none, and one code path beats two.
- **D3 — Disk, not Postgres, not memory.** One file per item at `${IMAGE_CACHE_DIR}/${itemId}.webp`; default dir `.cache/img` (the `.cache/` pattern is already gitignored for the curator). No eviction in 7.3: ~11k items × ~120 KB ≈ 1.3 GB is fine on a VPS; **8.1 mounts the directory as a persistent volume** so deploys don't refill it. Record both in SPEC.
- **D4 — Cache only successes.** A 4xx/5xx/timeout upstream, or a byte stream `sharp` rejects, answers 502 `no-store` and writes nothing — a failure that sticks for a year is indistinguishable from a dead image (the existing comment's rule, kept).
- **D5 — Concurrent misses share one fill.** An in-process `Map<itemId, Promise<…>>`; a feed page requests ~24 images at once and the gallery rail re-requests the hero — without this, the first load of a page would double-fetch.
- **D6 — Feed: projection + hydrate, gated by the bench, revertable.** `getTopicPools` selects only what `composePage` reads (`id, topicId, source, curationScore, aestheticTags`); `ORDER BY id` stays (cursor stability). If the feed integration suite cannot be kept green within the task, revert the task and record it — the bar (p50 < 300 ms) is already met, so this is hygiene, not rescue.
- **D7 — Lighthouse is evidence, not a gate.** Record scores for `/` and `/i/[itemId]` (and `/feed` if a session cookie can be obtained by script), fix findings that are each under ~30 minutes and behaviour-neutral (hero `fetchPriority`, `decoding="async"`, a preload), re-measure, and stop. No numeric threshold; no layout changes.
- **D8 — Share/download filenames follow the served type.** The proxy now serves `image/webp`; `item-shell.tsx`'s `${itemId}.jpg` becomes an extension derived from `blob.type`.

**Verified facts (08-27-26) the plan is built on:**

| Fact | Where verified | Consequence |
|---|---|---|
| Corpus: 11,366 items across 18 topics; 376 with `tile.loc.gov` images; only Wikipedia rows carry a `body` (2,200 rows, avg 13 KB — 28.7 MB total). Score distribution: 7,839 rows ≥ 7; default `scoreFloor` is 4, so ~11,000 rows are eligible per page. | direct SQL, 08-27-26 | `getTopicPools` returns essentially the whole corpus, full rows, per page. T2. |
| Feed timing today: 8 consecutive pages for a real user, 136–155 ms, **p50 143 ms** — under the 300 ms bar. | `getFeedPage` bench, 08-27-26 | T1 records this as the baseline; T2 is hygiene (D6). |
| `composePage` reads `it.source`, `it.curationScore`, `it.aestheticTags` (taste boost), and pools are keyed by `topicId`; `FeedCard.item` is a full `Item` and goes to the client. | `src/server/services/feed.ts:296-320, 69, 417` | T2's `PoolItem` = `Pick<Item, "id" \| "topicId" \| "source" \| "curationScore" \| "aestheticTags">`; hydrate winners by id. |
| `sharp` 0.34.5 (libvips 8.17.3) is installed as Next's dependency with `@img/sharp-darwin-arm64`; under `bun -e` it resizes + encodes WebP. CI is linux-x64 — the platform package must be resolvable there, which a direct dependency + committed lockfile guarantees. | `node_modules/sharp`, `bun -e` run | T3.1 adds `sharp` as a direct dependency pinned to `0.34.5`. |
| Vitest runs under **Node** (its bin is `#!/usr/bin/env node`), Playwright's `webServer` runs `bun run --bun next start`. | `vitest.config.ts` header, `playwright.config.ts` | The cache module uses `node:fs/promises` + `Buffer` only — no `Bun.file`, no Bun-only APIs. |
| The route's tests mock `~/server/db/items` and `RateLimiter`, stub `fetch`, and assert status/headers per case. | `src/app/api/img/[itemId]/route.test.ts` | T3.4 extends this file; the cache dir per test is an `mkdtemp`. |
| `pwa.prod.spec.ts` seeds a same-origin `http://localhost:3000/icon-192.png` image so the proxy's 200 lands in the `ambit-images` SW cache; `e2e/support.ts`'s `PIXEL` is a `data:` URL that never reaches the proxy. | `e2e/pwa.prod.spec.ts:51`, `e2e/support.ts:72` | After T3 the spec still passes (a PNG in, WebP out, still a 200 cached by `isImageProxy`). |
| The SW caches `/api/img/*` cache-first (150 entries, 7 days); the share sheet and gallery fetch `/api/img/${itemId}` as a blob; `item-shell.tsx:14,29` name the file `${itemId}.jpg`. | `src/app/sw.ts:95`, `src/components/item/item-shell.tsx`, `gallery-screen.tsx:198` | Nothing but the filename changes (D8). |
| `image-tile.tsx` already has `loading="lazy"`; the hero (`image-item-body.tsx:55`) has no `fetchPriority`/`decoding`; the feed already prefetches the next page at `rootMargin: "500px"`. | those files | T5's fix list is short and known. |
| `.env.example` documents every variable with a comment; `src/env.js` (`@t3-oss/env-nextjs`) declares server vars in `server:` and mirrors them in `runtimeEnv:`. | those files | T3.2 adds `IMAGE_CACHE_DIR` in both places + `.env.example`. |
| Better Auth exposes `auth.api.signInEmail({ body: { email, password }, asResponse: true })` returning a `Response` whose `set-cookie` carries the session cookie. | Better Auth docs *basic-usage* (server-side API, `asResponse`) — **re-verify with Context7 before writing T5.2**; if it does not hold, skip the `/feed` Lighthouse run and say so. | T5.2's cookie script. |
| Lighthouse CLI runs from `bunx lighthouse@latest` (downloads on first use) and finds the installed Chrome via chrome-launcher; `--form-factor=mobile --screenEmulation.mobile --throttling-method=simulate --output=json --output=html --chrome-flags="--headless=new" --extra-headers '{"Cookie":"…"}'` are its documented flags. | Lighthouse README / `lighthouse --help` — run `--help` once before T5 | T5's command. |

---

## Tasks

### T1 — `scripts/bench-feed.ts`: the baseline, recorded

- [x] **1.1** New script (`"bench:feed": "bun run scripts/bench-feed.ts"` in `package.json`, alphabetical). Flags via the `flag()` helper pattern from `scripts/probe-feed.ts`: `--user <email>` (default: the first non-`ambit-%@example.com` user), `--pages N` (default 12). It (a) times `getFeedPage` for N consecutive pages via the returned cursor and prints min / p50 / p95 / max in ms; (b) separately times one `getTopicPools(<all topic ids>, { userId, anchor: new Date(), scoreFloor: 4, excludeIds: [] })` call and prints its wall time, the row count, and the approximate payload (`JSON.stringify(rows).length` in MB). Header comment: not a test; it hits the dev DB; numbers depend on the machine — always compare before/after on the same machine in the same minute.
- [x] **1.2** Run it; paste the output into `docs/PHASE7_WALKTHROUGH_7.3.md` (start the file now with the executed-against header) under **Baseline**. Expect p50 ≈ 140 ms and ~11k rows.
- [x] **1.3** `bun run check` green. Commit: `chore(scripts): bench-feed — feed page latency and pool payload`.

*Done = the walkthrough has a baseline block with p50/p95, rows, MB.*

### T2 — Feed pools as a projection; winners hydrated by id

- [x] **2.1** `src/server/db/feed.ts`: define and export `type PoolItem = Pick<Item, "id" | "topicId" | "source" | "curationScore" | "aestheticTags">`; change `getTopicPools` to `db.select({ id: item.id, topicId: item.topicId, source: item.source, curationScore: item.curationScore, aestheticTags: item.aestheticTags })` and return `Map<string, PoolItem[]>`. Keep `.orderBy(asc(item.id))` and the whole comment about why. Extend the comment: what the projection saves (the 28.7 MB of bodies the old `select()` dragged through on every page) and why the winners are hydrated afterwards.
- [x] **2.2** `src/server/db/items.ts`: add `getItemsByIds(ids: string[]): Promise<Map<string, Item>>` (`inArray`, empty-input guard like the file's existing one, returns a Map so callers preserve their own order).
- [x] **2.3** `src/server/services/feed.ts`: `composePage` and its helpers (`drawItem`/`weightedPick`/whatever the file names them) take `PoolItem`; it returns the same `FeedCard[]` shape but with `item: PoolItem` internally — then `getFeedPage` calls `getItemsByIds(cards.map(c => c.item.id))` and rebuilds `cards` with full `Item`s in the same order (a winner missing from the hydrate — impossible unless deleted mid-request — is dropped, not thrown). Keep `FeedCard.item: Item` as the exported type so the router and client are untouched; if that means an internal `ComposedCard` type, name it that and comment why the two exist. Debug fields (`why`, `curationScore`) unchanged.
- [x] **2.4** Tests: `feed.test.ts` fixtures are full `Item`s — they still satisfy `PoolItem` structurally; adjust types only where TS complains. `feed.integration.test.ts` and `routers.integration.test.ts` must stay green unchanged (they exercise `getFeedPage` end to end — cursor stability, seen-exclusion, page shape). Add one unit assertion: `composePage` output ids are exactly what `getFeedPage` hydrates (mock `getItemsByIds` in a small `getFeedPage` unit test if the file has one; otherwise rely on the integration suite and say so).
- [x] **2.5** `bun run bench:feed` again; paste under **After T2** in the walkthrough. Expect the pool payload to drop from tens of MB to ~1–2 MB and p50 to fall; if p50 did not improve, keep the change anyway (payload is the point on a VPS) and say so.
- [x] **2.6** `bun run check` green; `bun run e2e:prod` green. **Fallback (D6):** if the integration suite cannot be kept green in two diagnosed attempts, `git checkout -- src/server` for this task, record the failure in STATUS and the walkthrough, and continue with T3.
- [x] **2.7** Commit: `perf(feed): pools carry a projection; winners hydrated by id`.

*Done = bench shows the payload drop; every feed test green; the router's output shape is byte-for-byte the same (the e2e feed spec is the proof).*

### T3 — `image-cache.ts`: disk cache + resize behind `/api/img`

- [x] **3.1** `bun add sharp@0.34.5` (exact pin; commit `bun.lock` — CI installs with `--frozen-lockfile` and must resolve `@img/sharp-linux-x64`). `next.config.js`: no change needed — Next externalises `sharp` by default; say so in a comment next to `serverExternalPackages` rather than adding it.
- [x] **3.2** Env: `IMAGE_CACHE_DIR: z.string().min(1).default(".cache/img")` in `src/env.js` `server:` + `runtimeEnv:`; `.env.example` entry with a comment (what lives there, that it is safe to delete, that 8.1 mounts it as a volume). Resolve relative to `process.cwd()` in the service.
- [x] **3.3** `src/server/services/image-cache.ts` — exports:

```ts
export const MAX_EDGE = 1600;
export const WEBP_QUALITY = 82;
/** Upstream bytes beyond this are refused (502) rather than decoded — museum TIFFs exist. */
export const MAX_UPSTREAM_BYTES = 40 * 1024 * 1024;

export interface CachedImage { bytes: Buffer; contentType: "image/webp" }

export function cachePathFor(itemId: string, dir = env.IMAGE_CACHE_DIR): string
export async function readCached(itemId: string, dir?): Promise<CachedImage | null>
/** Fetch → sharp → atomic write. Rejects (with a typed `ImageFillError { kind: "upstream" | "decode" | "too-large" | "timeout" }`) instead of caching failures (D4). */
export async function fillCache(item: Pick<Item, "id" | "imageUrl">, opts?: { signal?: AbortSignal; dir?: string; fetchImpl?: typeof fetch }): Promise<CachedImage>
/** readCached ∥ in-flight dedupe ∥ fillCache (D5). */
export async function getOrFill(item, opts?): Promise<CachedImage>
```

  Implementation notes, each as a comment in the file: `fetch` with `USER_AGENT` from `sources/http.ts`, `Accept: image/*`, **no Referer** (the whole reason the proxy exists — keep the sentence), `AbortSignal.any([opts.signal, AbortSignal.timeout(15_000)])`; read the body with `arrayBuffer()` guarded by `content-length` and by the byte count; `sharp(buf, { failOn: "none" }).rotate().resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true }).webp({ quality: WEBP_QUALITY }).toBuffer()`; write to `${path}.${process.pid}.${random}.tmp` then `rename` (atomic on the same filesystem); `mkdir -p` the dir once (memoised promise); the in-flight map is module-level and entries are deleted in `finally`. The **reader-left** case: if `opts.signal` aborts mid-fill, let the fill *finish* for the cache's sake but resolve the caller's promise with the abort — a page the reader scrolled past is still worth caching once. (Simplest: don't pass the request signal into the upstream fetch at all; use only the timeout. Say which you chose and why.)
- [x] **3.4** Rewrite `src/app/api/img/[itemId]/route.ts` to: rate-limit (unchanged) → `getItemById` → the same 404 rules → `getOrFill(item)` → `200` with `Content-Type: image/webp`, `Content-Length`, the existing immutable `Cache-Control`; on `ImageFillError` → `502` `no-store` (429/404 unchanged). Rewrite the header comment: what the route is now, that 7.3 added the cache and resize the old comment reserved, and that the security boundary is still the itemId (keep that paragraph verbatim).
- [x] **3.5** Tests. `src/server/services/image-cache.test.ts` (unit; `mkdtemp` per test, `fetchImpl` injected returning a real PNG made with `sharp({ create: { width: 3000, height: 2000, … } }).png().toBuffer()`): fill writes exactly one `.webp`, no `.tmp` left behind; output starts with `RIFF` and contains `WEBP`; `sharp(bytes).metadata()` width ≤ 1600 and aspect preserved; second `getOrFill` does not call `fetchImpl`; two concurrent `getOrFill`s call `fetchImpl` once (D5); upstream 404 → `ImageFillError kind upstream`, no file (D4); garbage bytes → `kind decode`, no file; `content-length` over the cap → `kind too-large` without reading the body. Then extend `route.test.ts` (mock `~/server/services/image-cache` the way it mocks `rate-limit`): existing cases unchanged; a fill success → 200 `image/webp` with `Content-Length`; a fill error → 502 `no-store`.
- [x] **3.6** `src/components/item/item-shell.tsx`: derive the extension from `blob.type` (`image/webp` → `webp`, else `jpg`) for both the `File` name and the `download` name; comment D8. Any test that asserts `.jpg` is updated to assert the mapping.
- [x] **3.7** `bun run check` green; `bun run e2e:prod` green (watch `pwa.prod.spec.ts` — the seeded PNG now comes back as WebP; its `CACHES:` assertion is about the entry existing, not the type). Then, under `bun run start` with the real corpus: `curl -s -o /dev/null -w "%{http_code} %{content_type} %{size_download}\n" http://localhost:3000/api/img/<a real image item id>` twice — first fills, second is served from disk (add a `console.timeLog`-free way to tell: an `X-Ambit-Cache: hit|fill` response header, set by the route from `getOrFill`'s result; assert it in the route test too). Paste both lines and `du -sh .cache/img` into the walkthrough.
- [x] **3.8** Commit: `feat(images): /api/img caches to disk and serves ≤1600px WebP (proxy-with-cache decided)`.

*Done = one upstream fetch per item, proven by the unit test and the curl pair; every existing route test green; e2e:prod green.*

### T4 — `scripts/warm-images.ts`: fill the cache politely, per source

- [x] **4.1** New script (`"img:warm": "bun run scripts/warm-images.ts"`). Flags: `--source <id>` (repeatable; default all), `--rate <per-second>` (default 2), `--limit N`, `--dry-run` (default **off** — the script only writes cache files and calls third-party image servers, nothing destructive; say so in the header). It selects items with an `http(s)` `imageUrl` for the chosen sources, skips ones whose `cachePathFor()` exists, calls `fillCache` with a per-**host** interval of `1000/rate` ms, and prints a per-source table at the end: `filled · skipped(cached) · upstream-err · decode-err · too-large · seconds`, in the style of `scripts/ingest.ts`'s summary. Respect `SUSPENDED_SOURCES` (skip them — `aic` is behind a Cloudflare challenge; warming it is pointless).
- [x] **4.2** Run `bun run img:warm --source loc --rate 1` (376 items, ≈6–7 minutes). If a sustained 429 appears (the 6.2 finding), stop the run, note the count at which it started, and record it — the script must also stop itself on three consecutive upstream 429s from one host and say so. Paste the summary table into the walkthrough. **Do not** run the full warm overnight — leave the command for Ben in the walkthrough and STATUS.
- [x] **4.3** `bun run check` green. Commit: `chore(scripts): img:warm — rate-limited per-host cache fill`.

*Done = LoC's 376 images are on disk (or the 429 point is recorded); the summary is in the walkthrough.*

### T5 — Lighthouse on throttled mobile; the cheap fixes

- [x] **5.1** `bunx lighthouse@latest --help | head -50` once to confirm the flags in the Verified facts row. Create `docs/phase7.3-evidence/` (commit JSON summaries only — add `docs/phase7.3-evidence/*.html` to `.gitignore`).
- [x] **5.2** `scripts/lh-cookie.ts` (dev-only, ~30 lines): re-verify `asResponse` in Better Auth's docs (Context7: `/better-auth/better-auth`, query "auth.api signInEmail asResponse set-cookie"); if it holds, sign in the bench user (email from `--user`, password from `--password`) and print the `Cookie:` header value. If it does not hold, or the bench user's password is unknown, **skip `/feed`** and record why — do not invent a password reset flow for this.
- [x] **5.3** With `bun run build && bun run start` running, for each URL — `/`, `/i/<an image item id with a warmed LoC image>`, and `/feed` if 5.2 produced a cookie: `bunx lighthouse http://localhost:3000<path> --only-categories=performance,accessibility,best-practices --form-factor=mobile --screenEmulation.mobile --throttling-method=simulate --chrome-flags="--headless=new" --output=json --output=html --output-path=docs/phase7.3-evidence/before-<name>` (`--extra-headers '{"Cookie":"<value>"}'` for `/feed`). Extract into the walkthrough: the three category scores, LCP, CLS, TBT, and the top three opportunities/diagnostics by estimated savings.
- [x] **5.4** Fixes, each behaviour-neutral and each ≤ 30 min (D7) — do the ones the report actually names, skip the rest:
  - hero (`image-item-body.tsx`): `fetchPriority="high"` and `decoding="async"`; and in `/i/[itemId]/page.tsx`, `preload(`/api/img/${item.id}`, { as: "image" })` from `react-dom` when the item has a proxy image (this is the LCP element on the public page);
  - tiles (`image-tile.tsx`): `decoding="async"`;
  - landing slideshow: only if Lighthouse flags it — the slides are static `/landing/*.jpg`; if they are the LCP and oversized, note it as a 9.x follow-up rather than re-encoding assets overnight;
  - anything Lighthouse flags under best-practices that is a one-liner (e.g. a missing `<meta>`), if it is unambiguous.
- [x] **5.5** Rebuild, re-run 5.3 as `after-<name>`, paste the deltas. `bun run check` and `bun run e2e:prod` green.
- [x] **5.6** Commit: `perf(ui): hero fetch priority + preload; async decoding; Lighthouse evidence`.

*Done = before/after JSON in `docs/phase7.3-evidence/`, scores and top findings in the walkthrough, the cheap fixes in.*

### T6 — Docs, walkthrough, log, merge

- [x] **6.1** SPEC: §15 — strike the `tile.loc.gov` open item and the "image hosting" mentions as *settled 7.3 (proxy-with-cache; one fetch per item; `img:warm`)*; §11 — the proxy bullet gains "caches to disk under `IMAGE_CACHE_DIR`, serves WebP; the key is still the item id"; §8 or §6 (wherever the proxy is described) — a short **Image delivery** paragraph (D1–D5, the 1600/82 numbers, no eviction, 8.1 mounts the volume); §13 — the volume line for 8.1; §12 — `bench:feed` and the Lighthouse evidence dir.
- [x] **6.2** `docs/BUILD_PLAN.md`: tick 7.3, write its `*Done =*` paragraph (the decision, the numbers, what Lighthouse said), flip the **Image delivery** row in *Open decision gates* to **Settled (08-27-26)**, add the `img:warm` full-run and the 8.1 volume mount to 8.1's line. Update the "Next" pointer (Phase 5 status paragraph) and `CLAUDE.md`'s *Repository status* to **8.1**, mentioning 7.2 and 7.3 in one sentence each in the style of the existing 7.1 sentence. Add `IMAGE_CACHE_DIR` to CLAUDE.md's local-dev notes only if there is something non-obvious to say (e.g. "delete `.cache/img` to force refetch").
- [x] **6.3** Finish `docs/PHASE7_WALKTHROUGH_7.3.md`: executed-against header, **Baseline / After T2** bench blocks, the curl pair + `du`, the warm table, Lighthouse before/after, *What the plan got wrong*.
- [x] **6.4** `log.md`: extend the day's entry (or start one — one heading per day, newest on top), **Shipped / Decisions / Open-next** (the full `img:warm` run and the 8.1 volume are the open items), ending with the spend line from `python3 ~/.claude/scripts/session-spend.py --session <your-session-uuid>`; omit if it exits non-zero. If 7.2 wrote a spend line for this day already, add a second line — never edit the first.
- [x] **6.5** Gates: `bun run check`, `bun run e2e:prod`, `bun run e2e` all green. `git checkout main && git merge --no-ff feat/7.3-images-perf && git push`. Record in `OVERNIGHT_STATUS.md`.

---

## Verification (the done-bar, end to end)

1. `bun run check` green with `image-cache.test.ts` and the extended `route.test.ts`.
2. `bun run e2e:prod` green (42 + 7.2's spec), `pwa.prod.spec.ts` included.
3. Two curls to the same `/api/img/<id>`: `fill` then `hit`, both `image/webp`, the second with no upstream request (the unit test proves the mechanism; the header proves it live).
4. `bun run bench:feed`: p50 < 300 ms (was 143) and the pool payload in single-digit MB or less.
5. `docs/phase7.3-evidence/` has before/after JSON for at least `/` and `/i/[id]`.
6. BUILD_PLAN's gate table says the image decision is settled, and SPEC says how.

## Out of scope (resist)

- A second (thumbnail) variant, AVIF, `srcset`/`sizes` — one variant is D2; revisit with real device data in 9.x.
- Cache eviction, size caps, or a CDN in front of the proxy — D3; 8.1 mounts a volume, 8.2 can watch `du`.
- Running `img:warm` for every source overnight — `loc` only (Global constraints).
- Un-suspending `aic` — it is a Cloudflare challenge, not a proxy problem (`docs/HANDOFF_aic-images.md` §8).
- Any change to the ingest path, the curator's image download, or the `SourceAdapter` contract (cross-service agreement — CLAUDE.md).
- Making Lighthouse a CI job. Evidence dir only.
