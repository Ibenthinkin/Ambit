# Loupe hookup (Loupe Phase 4) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Execution state (09-07-26): all seven tasks done.** Tasks 2–5 on `feat/loupe-hookup` 09-06; Task 1 in Loupe (`dc55380`) the same evening; Tasks 6–7 09-07 in the `~/Dev/ambit-loupe` worktree after merging `feat/wild-tier-and-captionless` in (so the walk ran against the 99-topic classifier, as preferred below). Numbers and findings: `log.md` 09-07 and SPEC §6.1's `loupe` bullet. One correction to Task 6 Step 1: `stats:walk` prints no image-fetch tally — the bearer was proven with a forced single-item curate plus a 401/200 curl pair instead. And Step 4's "hero" does not exist on the public article page for any source; the proxy was proven by curl.

**Goal:** Ambit ingests Loupe's kept magazine clippings as a fifth corpus-walk source, with the two server-side image fetches carrying Loupe's bearer so every clip image is fetchable, and no per-user gate (Ben's decision, 09-06-26).

**Architecture:** Two halves that ship in order. **Part A (Tasks 1–3)** is the bearer: a tiny leaf helper `imageFetchHeaders(source)` that both server-side image fetches (the curator's ingest download and the image proxy's cache fill) merge into their request headers, plus one field Loupe's REST payload was missing. **Part B (Tasks 4–7)** is the adapter: a `CorpusWalkAdapter` over `GET /api/v1/articles` on the existing walk contract, registered like `pdr` (a walk source that is not a blog), then a measured local walk and the docs that record the verdict and the gate decision.

**Tech Stack:** Bun, TypeScript, Next.js App Router, Vitest (fixture tests; `bun run test`), Drizzle over Postgres. Loupe side: Bun + Next.js + Vitest against `TEST_DATABASE_URL`.

**Spec:** There is no single spec file. The contract is on record in three places the executor should read once before starting:
- `~/vaults/Memory-Palace/05 Projects/Ambit-Admin/Roadmap & Backlog.md` line 14 (the Phase 4 item and its four requirements) and `Ecosystem Architecture.md` §"Two blessed source-integration patterns" (corpus-walk) and §"Planned: per-user content pools".
- `~/Dev/loupe/SPEC.md` §8.2 (the REST contract) and `~/Dev/loupe/web/server/rest/articles.ts` (the payload shape, authoritative).
- This repo: `src/server/services/sources/types.ts` (`CorpusWalkAdapter`), `src/server/services/sources/pdr.ts` and `src/server/config/pdr.ts` (the one existing walk source that is not a blog — the registration pattern to copy), `docs/PHASE6_DESIGN_6.3.md` §4 (walk lane).

**Decisions already made (do not re-open):**
1. **No per-user gate.** Ben, 09-06-26: Loupe items go into the general feed of an invite-only app whose users he knows personally. The gate (per-user content pools) is deferred indefinitely; `item.source` is a not-null column and the feed already filters by source (`getTopicPools` in `src/server/db/feed.ts` uses `notInArray(item.source, SUSPENDED_SOURCES)`), so gating later is a filter, not a migration. Task 7 records this in the vault so the next reader does not treat the old "only to users granted those pools" line as a blocker.
2. **`sourceId` is a position key, never Loupe's `article.id`.** Loupe article ids are deleted and re-inserted when a page is corrected (Loupe log 08-15-26; the vault's "never dedupe on Loupe `id`" requirement). The stable identity of a kept clipping is *where it is*: `<iaIdentifier>:<pageNumber>:<readingOrder>`. Under that key a corrected page upserts in place (title/body/image update; `upsertItem` in `src/server/db/items.ts` rewrites those columns) and vanished positions are removed by `--prune` on a complete walk. Accepted consequence: a corrected item keeps its old `curation_score` (the curation cache is keyed by `source:sourceId`); corrections after triage are rare and a re-score is a deliberate `PROMPT_VERSION` bump, same as every other source.
3. **The bearer is sent by source, not by URL.** `imageFetchHeaders("loupe")` returns the bearer; every other source gets `{}`. Loupe's `imageUrl` values are produced by Loupe's own server (Ben's service), so trusting them is trusting Loupe, which Ambit already does by ingesting from it. No allowlist of hosts.
4. **Loupe is registered like `pdr`, not like a blog.** It is not a designated blog (no link-card posture, `body` is stored for articles), so it gets `src/server/config/loupe.ts` and a named exception in `blogs.test.ts`, exactly as `pdr` did.
5. **No robots check, no politeness delay.** `assertCrawlAllowed` and the 500 ms spacing are third-party etiquette. Loupe is Ben's own service on his own machine.
6. **Tags are Loupe's tags only.** No synthetic publication tag. Loupe's `article.tags` is what a human clicked; that is the "vocabulary the world answers in" and it is what `bun run mine:topics` reads.
7. **Body is stored for `article` items only.** An illustration's caption is already its `summary`; `body` stays null for images (the `pdr` collection-preamble case does not apply).

## Global Constraints

- **Branch:** `feat/loupe-hookup` off `main`. Ben prefers plain branches; use a worktree only if another session holds the checkout (`git status` in `~/Dev/ambit` will tell you — if it is on a different feature branch with a dirty tree, use `git worktree add ../ambit-loupe -b feat/loupe-hookup main`).
- **Sequencing against `docs/PLAN_caption-less-and-wild.md`:** Part A has no overlap with that plan and can run any time. Part A's Task 3 touches `src/server/services/curator.ts`, but a different function (`imageAsDataUrl`) from that plan's floor and classify edits, and `scripts/ingest.ts` is untouched here, so a merge conflict is at worst one import line. **Prefer running Part B after that plan's Task 4 ("the classifier lists every topic in the database") has merged**, so the Task 6 verdict is measured against the vocabulary Loupe will actually live with. If it has not merged, run Part B anyway and note it in the verdict; a re-walk is free (curation cache).
- **Loupe must be running locally for Tasks 5 (fixture recording, optional) and 6 (the walk).** Loupe's dev server and its `imageUrl` values default to `localhost:3000`, which **Ambit must own**. Run Loupe on 3100:
  ```sh
  cd ~/Dev/loupe/web
  docker compose up -d                        # Loupe's Postgres; on this host it is mapped to 5433 by a local, uncommitted compose edit (web/README.md)
  MEDIA_BASE_URL=http://localhost:3100/media bunx next dev -p 3100
  ```
  A shell variable on the command line wins over Loupe's `.env`, so this changes nothing on disk. Verify before continuing:
  ```sh
  curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $LOUPE_API_TOKEN" 'http://localhost:3100/api/v1/articles?limit=1'   # 200
  curl -s -H "Authorization: Bearer $LOUPE_API_TOKEN" 'http://localhost:3100/api/v1/articles?limit=1' | jq -r '.data[0].imageUrl'      # http://localhost:3100/media/...
  ```
  `LOUPE_API_TOKEN` is the value in `~/Dev/loupe/web/.env`. Never commit it; never print it into a log or a doc.
- **Ambit `.env` additions** (Task 2 adds them to `.env.example`; Ben fills the real file): `LOUPE_URL=http://localhost:3100`, `LOUPE_API_TOKEN=<same token as Loupe's .env>`.
- **Every `.ts` file this plan creates carries a header comment in the repo's teaching voice** (see any file in `src/server/services/sources/`): what the file is, why it is shaped this way, what a future reader would otherwise re-derive. Ben is a returning web developer and the repo is a teaching tool.
- **Never render unsanitized source HTML** — `title` and `summary` go through `htmlToText()` (the 8.1 rule); `body` paragraphs too.
- **Store `attribution` and `license` verbatim from the wire.** Loupe's license string is a rights statement (`"No open license — rights retained by original authors; personal use only."`) and must not be softened. It is a cross-service constant; do not re-hard-code it in Ambit.
- Test commands: `bun run test` (Vitest, ~35 s; DB-backed suites skip without `DATABASE_URL`), `bun run typecheck`, `bun run lint`. Before trusting a red run after any `bun add`, `rm -rf node_modules/.vite node_modules/.cache/vite` (CLAUDE.md). Playwright is not needed for this plan.
- Commit after every task with a conventional message. Do not push unless Ben says to.

---

## Part A — the bearer

### Task 1: Loupe exposes `readingOrder` on `/api/v1/articles` (Loupe repo)

The position key (decision 2) needs `readingOrder`, and `ArticleListItem` does not carry it today. One field, one test assertion, one SPEC line. This is a change to a cross-service contract, so the SPEC and the vault both record it (Task 7 does the vault).

**Files:**
- Modify: `~/Dev/loupe/web/server/rest/articles.ts` (the `ArticleListItem` interface and the `data` map)
- Modify: `~/Dev/loupe/web/server/rest/articles.test.ts` (the "walks every article exactly once" test, around line 226)
- Modify: `~/Dev/loupe/SPEC.md` §8.2, "Item shape" bullet
- Modify: `~/Dev/loupe/log.md` (top entry)

**Interfaces:**
- Produces: `ArticleListItem.readingOrder: number` — `article.reading_order`, the 0-based position of the clipping within its page in reading order. Ambit's Task 5 consumes it.

- [x] **Step 1: Write the failing assertion**

In `articles.test.ts`, inside the test `"walks every article exactly once across multiple issues, in the documented order"`, the loop collects `seenTitles`. Add a sibling collector and assertion. Change the loop body and add one expectation after the `EXPECTED_ORDER` assertion:

```ts
    const seenTitles: string[] = [];
    const seenOrders: number[] = [];
    // ... (existing cursor loop) ...
      for (const item of result.data) {
        seenTitles.push(item.title);
        seenOrders.push(item.readingOrder);
      }
    // ... after the existing expect(seenTitles).toEqual(EXPECTED_ORDER):
    // readingOrder is the third leg of Ambit's position key (Ambit docs/PLAN_loupe-hookup.md,
    // decision 2); it must be on the wire, 0-based, and match the clip's own reading_order.
    expect(seenOrders).toEqual([0, 1, 0, 0, 1]);
```

- [x] **Step 2: Run it to verify it fails**

Run (Loupe's Postgres must be up; `TEST_DATABASE_URL` as in `web/README.md`):
```sh
cd ~/Dev/loupe/web && TEST_DATABASE_URL=postgres://loupe:loupe@localhost:5433/loupe_test bunx vitest run server/rest/articles.test.ts
```
Expected: FAIL — TypeScript error `Property 'readingOrder' does not exist on type 'ArticleListItem'` (Vitest surfaces it as a failed transform), or at runtime `expected [ undefined, … ] to equal [ 0, 1, 0, 0, 1 ]`.

- [x] **Step 3: Add the field**

In `articles.ts`, in `ArticleListItem` after `pageNumber: number;`:
```ts
  /** 0-based position of the clipping within its page, in reading order. On the wire because it
   *  is the third leg of Ambit's stable key for a clipping (`<ia>:<page>:<order>`) — article ids
   *  are re-issued on every correction and must not be used for identity downstream. */
  readingOrder: number;
```
In the `data` map after `pageNumber: row.pageNumber,`:
```ts
    readingOrder: row.readingOrder,
```
(`row.readingOrder` is already selected — it seeds the cursor.)

- [x] **Step 4: Run the test again**

Same command. Expected: PASS. Then run the whole Loupe suite the same way (`bunx vitest run`) and `bunx tsc --noEmit`; both clean.

- [x] **Step 5: SPEC + log**

In `SPEC.md` §8.2, the bullet beginning **Item shape** lists "three fields Ambit's `Item` needs". Add a fourth sub-bullet after `license`:
```
  - `readingOrder` — `article.reading_order`, added 2026-09-06 for Ambit's adapter: article ids are re-issued on every correction (Phase 3 out-of-scope note), so Ambit keys a clipping on `<iaIdentifier>:<pageNumber>:<readingOrder>` and needs the third leg on the wire.
```
In `log.md`, add a dated entry at the top of the current month in the file's house style (one paragraph: what changed, why, that Ambit's adapter is the consumer). No session-spend line is needed for a Loupe entry written from an Ambit session.

- [x] **Step 6: Commit (Loupe repo)**

```sh
cd ~/Dev/loupe && git add web/server/rest/articles.ts web/server/rest/articles.test.ts SPEC.md log.md
git commit -m "feat(rest): articles carry readingOrder — the third leg of Ambit's position key"
```

---

### Task 2: `imageFetchHeaders()` — the one place the Loupe bearer is decided

**Files:**
- Create: `src/server/services/image-auth.ts`
- Create: `src/server/services/image-auth.test.ts`
- Modify: `src/env.js` (two schema lines, two runtimeEnv lines, next to `ARCHIVE_*`)
- Modify: `.env.example` (one block, after the `ARCHIVE_*` block)

**Interfaces:**
- Produces: `imageFetchHeaders(source: string): Record<string, string>` — `{ Authorization: "Bearer <LOUPE_API_TOKEN>" }` when `source === "loupe"` and the token is set; `{}` otherwise. Reads `process.env` at call time (never imports `~/env`) for the same reason `sources/archive.ts` and `curator.ts` do: importing `~/env` runs full Zod validation and would fail unit tests.

- [x] **Step 1: Write the failing test**

`src/server/services/image-auth.test.ts`:
```ts
// The bearer decision is a pure function of (source, env), so it is unit-tested here and the two
// fetch sites (curator.ts, image-cache.ts) only test that they *merge* what it returns.
import { afterEach, describe, expect, it, vi } from "vitest";

import { imageFetchHeaders } from "./image-auth";

describe("imageFetchHeaders", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("sends the Loupe bearer for a loupe item", () => {
    vi.stubEnv("LOUPE_API_TOKEN", "tok-123");
    expect(imageFetchHeaders("loupe")).toEqual({
      Authorization: "Bearer tok-123",
    });
  });

  it("sends nothing for every other source, token or no token", () => {
    vi.stubEnv("LOUPE_API_TOKEN", "tok-123");
    expect(imageFetchHeaders("met")).toEqual({});
    expect(imageFetchHeaders("archive")).toEqual({});
    expect(imageFetchHeaders("pdr")).toEqual({});
  });

  it("sends nothing for loupe when the token is unset — the upstream 401 is the report", () => {
    vi.stubEnv("LOUPE_API_TOKEN", "");
    expect(imageFetchHeaders("loupe")).toEqual({});
  });
});
```

- [x] **Step 2: Run it to verify it fails**

```sh
bunx vitest run src/server/services/image-auth.test.ts
```
Expected: FAIL — `Cannot find module './image-auth'`.

- [x] **Step 3: Implement**

`src/server/services/image-auth.ts`:
```ts
// Which server-side image fetches carry credentials, decided in one place.
//
// Ambit makes exactly two image requests of its own: the curator downloads each image at ingest
// (curator.ts imageAsDataUrl — the model is handed bytes, never a URL) and the image proxy fills
// its disk cache on first view (image-cache.ts fillCache; Phase 7.3). Every museum answers a bare
// GET. Loupe does not: its `/media/*` is gated on Ben's session cookie OR a static bearer
// (Loupe SPEC §12, since 2026-09-05), and the bearer is the server-to-server path. So both fetch
// sites merge whatever this function returns into their headers, and this is the only file that
// knows a token exists.
//
// Decided by SOURCE, not by URL host: a loupe item's imageUrl is minted by Loupe's own server,
// so trusting the URL is the same trust as ingesting from Loupe at all. No host allowlist.
//
// `process.env` is read at call time rather than through `~/env` — importing `~/env` runs the
// full Zod validation (DATABASE_URL, the Better Auth pair, …) and would fail this file's unit
// tests, the same reason sources/archive.ts and curator.ts read their keys the same way.
//
// When the token is unset the loupe case returns `{}` rather than throwing: the adapter's walk()
// already refuses to run without it (no loupe rows exist without config), so this path is only
// reachable for rows that pre-date a lost env var, and the upstream 401 then surfaces where every
// other fetch failure does (the curator's onImageFetchFailure tally; the proxy's 502 and
// `img:warm`'s per-host tally).

// The literal rather than `LOUPE.id` from config/loupe.ts: that file lands in Task 4 and this
// helper must stand alone before it (and image-cache.ts stays free of the sources layer).
export function imageFetchHeaders(source: string): Record<string, string> {
  if (source !== "loupe") return {};
  const token = process.env.LOUPE_API_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
```

- [x] **Step 4: Run the test again**

Same command. Expected: PASS (3 tests).

- [x] **Step 5: Register the env vars**

`src/env.js`, in the server schema directly after the `ARCHIVE_API_KEY` line:
```js
    // Loupe, Ben's magazine-clipping bench (the loupe repo; docs/PLAN_loupe-hookup.md). Optional
    // for exactly the archive's reasons: ingest-only, and a clone without Loupe running must
    // still boot and ingest everything else. sources/loupe.ts reads both at walk() time and
    // throws its own "not configured" error; services/image-auth.ts reads the token for the two
    // server-side image fetches (Loupe's /media/* is bearer-gated).
    LOUPE_URL: z.string().url().optional(),
    LOUPE_API_TOKEN: z.string().min(1).optional(),
```
And in `runtimeEnv`, after `ARCHIVE_API_KEY: process.env.ARCHIVE_API_KEY,`:
```js
    LOUPE_URL: process.env.LOUPE_URL,
    LOUPE_API_TOKEN: process.env.LOUPE_API_TOKEN,
```

`.env.example`, after the `ARCHIVE_API_KEY=` line:
```sh

# Loupe, Ben's magazine-clipping bench (the loupe repo) — a corpus-walk source over
# GET /api/v1/articles, and the one source whose IMAGES need auth: Loupe's /media/* is gated on a
# static bearer, which Ambit attaches on its two server-side image fetches (docs/PLAN_loupe-hookup.md).
# LOUPE_URL is the service origin (dev: http://localhost:3100 — Loupe's own default of 3000
# collides with Ambit, so run it as `MEDIA_BASE_URL=http://localhost:3100/media bunx next dev -p 3100`);
# LOUPE_API_TOKEN is copied from loupe/web/.env. Both optional: unset, the loupe source is
# simply unavailable to ingest and the token is never sent.
LOUPE_URL=
LOUPE_API_TOKEN=
```

- [x] **Step 6: Typecheck and commit**

```sh
bun run typecheck && bun run lint
git add src/server/services/image-auth.ts src/server/services/image-auth.test.ts src/env.js .env.example
git commit -m "feat(images): imageFetchHeaders() — the Loupe bearer, decided in one place"
```

---

### Task 3: Both server-side image fetches merge the headers

**Files:**
- Modify: `src/server/services/image-cache.ts:155-170` (`fillCache` signature + fetch headers) and `:272-275` (`getOrFill` signature)
- Modify: `src/server/services/image-cache.test.ts:40` (the shared `item` fixture) + one new test
- Modify: `src/server/services/curator.ts:177-180` (`imageAsDataUrl` signature) and `:358` (the call)
- Modify: `src/server/services/curator.test.ts` (one new test in the `"curateItems image-fetch reporting"` describe)

**Interfaces:**
- Consumes: `imageFetchHeaders` from Task 2.
- Produces: `fillCache(item: Pick<Item, "id" | "imageUrl" | "source">, opts?)` and `getOrFill(item: Pick<Item, "id" | "imageUrl" | "source">, opts?)`. Both existing callers already pass rows that carry `source` (`src/app/api/img/[itemId]/route.ts` passes the full item from `getItemById`; `scripts/warm-images.ts` reads `row.source` already), so no caller changes.
- Produces: `imageAsDataUrl(url: string, headers: Record<string, string> = {})` (module-private in curator.ts).

- [x] **Step 1: Write the failing image-cache test**

In `image-cache.test.ts`, change the shared fixture at line 40 to carry a source:
```ts
const item = {
  id: "item-abc",
  imageUrl: "https://museum.test/plate.png",
  source: "met",
};
```
Add inside `describe("fillCache", …)`:
```ts
  it("sends the Loupe bearer for a loupe item and no Authorization for a museum", async () => {
    vi.stubEnv("LOUPE_API_TOKEN", "tok-123");
    try {
      const calls: RequestInit[] = [];
      const bytes = await png();
      const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
        calls.push(init ?? {});
        return new Response(bytes, { headers: { "content-type": "image/png" } });
      }) as unknown as typeof fetch;

      await fillCache({ ...item, id: "loupe-1", source: "loupe" }, { dir, fetchImpl });
      await fillCache({ ...item, id: "met-1", source: "met" }, { dir, fetchImpl });

      const headersOf = (init: RequestInit) => init.headers as Record<string, string>;
      expect(headersOf(calls[0]!).Authorization).toBe("Bearer tok-123");
      expect(headersOf(calls[1]!).Authorization).toBeUndefined();
      // The defaults survive the merge on both.
      expect(headersOf(calls[0]!)["User-Agent"]).toBeTruthy();
      expect(headersOf(calls[1]!).Accept).toBe("image/*");
    } finally {
      vi.unstubAllEnvs();
    }
  });
```
(`png()` and `dir` already exist in that file — `png()` returns a real PNG Buffer via sharp, `dir` is a per-test `mkdtemp`; `vi` is already imported.)

- [x] **Step 2: Run it to verify it fails**

```sh
bunx vitest run src/server/services/image-cache.test.ts
```
Expected: FAIL — `expected undefined to be 'Bearer tok-123'` (and a type error on `source` if the pick is enforced).

- [x] **Step 3: Implement in image-cache.ts**

Add the import next to the `USER_AGENT` import:
```ts
import { imageFetchHeaders } from "~/server/services/image-auth";
```
Change both signatures from `Pick<Item, "id" | "imageUrl">` to `Pick<Item, "id" | "imageUrl" | "source">` (`fillCache` at ~155, `getOrFill` at ~272). Change the fetch at ~167:
```ts
    upstream = await doFetch(url, {
      // Spread last so a source that authenticates (only Loupe, today — image-auth.ts) adds its
      // header without ever dropping the defaults. Still no Referer: see the doc comment above.
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "image/*",
        ...imageFetchHeaders(item.source),
      },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      redirect: "follow",
    });
```
Amend the `fillCache` doc comment's "**No `Referer`, ever**" paragraph with one sentence: *"The one header a source may add is a bearer (Loupe; `image-auth.ts`), merged after the defaults."*

- [x] **Step 4: Run the image-cache tests**

Same command. Expected: PASS, including every pre-existing test (the fixture gained a field; nothing else changed).

- [x] **Step 5: Write the failing curator test**

In `curator.test.ts`, inside `describe("curateItems image-fetch reporting", …)` (which already stubs `OPENROUTER_API_KEY` and restores globals/envs in `afterEach`), add:
```ts
  it("attaches the Loupe bearer to a loupe image download and nothing to a museum's", async () => {
    vi.stubEnv("LOUPE_API_TOKEN", "tok-123");
    const seen = new Map<string, Record<string, string>>();
    vi.stubGlobal("fetch", (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("openrouter.ai")) return Promise.resolve(okCompletion);
      seen.set(url, (init?.headers ?? {}) as Record<string, string>);
      // A 404 keeps the item on the "judge from text" path — this test is about the request,
      // not the response, and it must not need a real image.
      return Promise.resolve({ ok: false, status: 404 });
    });
    await curateItems(
      [
        makeItem({
          source: "loupe" as never,
          sourceId: "walka00unse:1:0",
          type: "image",
          imageUrl: "http://localhost:3100/media/walka00unse/a.jpg",
        }),
        makeItem({
          source: "met",
          sourceId: "curator-test-met",
          type: "image",
          imageUrl: "https://images.metmuseum.org/b.jpg",
        }),
      ],
      { force: true },
    );
    expect(seen.get("http://localhost:3100/media/walka00unse/a.jpg")?.Authorization).toBe(
      "Bearer tok-123",
    );
    expect(seen.get("https://images.metmuseum.org/b.jpg")?.Authorization).toBeUndefined();
    expect(seen.get("https://images.metmuseum.org/b.jpg")?.["User-Agent"]).toBeTruthy();
  });
```
(`source: "loupe" as never` is needed only until Task 5 adds `"loupe"` to `SourceId`; Task 5 Step 8 removes the cast.)

- [x] **Step 6: Run it to verify it fails**

```sh
bunx vitest run src/server/services/curator.test.ts
```
Expected: FAIL — `expected undefined to be 'Bearer tok-123'`.

- [x] **Step 7: Implement in curator.ts**

Add the import next to `USER_AGENT`'s:
```ts
import { imageFetchHeaders } from "./image-auth";
```
Change `imageAsDataUrl` (~line 177):
```ts
async function imageAsDataUrl(
  url: string,
  headers: Record<string, string> = {},
): Promise<string | null> {
  for (const candidate of [url, encodeURI(url)]) {
    try {
      const res = await fetch(candidate, {
        // Spread last: a source that authenticates (Loupe, via image-auth.ts) adds to the
        // defaults, never replaces them.
        headers: { "User-Agent": USER_AGENT, ...headers },
      });
```
and the call at ~358:
```ts
    const dataUrl = await imageAsDataUrl(
      item.imageUrl,
      imageFetchHeaders(item.source),
    );
```
Add one sentence to `imageAsDataUrl`'s doc comment: *"`headers` exists for the one source whose images are bearer-gated (Loupe; `image-auth.ts` decides)."*

- [x] **Step 8: Run the full suite, typecheck, lint**

```sh
bun run test && bun run typecheck && bun run lint
```
Expected: all green. `src/app/api/img/[itemId]/route.test.ts` still passes (it mocks `getOrFill` and passes the whole item).

- [x] **Step 9: Commit**

```sh
git add src/server/services/image-cache.ts src/server/services/image-cache.test.ts src/server/services/curator.ts src/server/services/curator.test.ts
git commit -m "feat(images): both server-side image fetches carry the Loupe bearer"
```

**Part A is done.** Every Loupe image is now fetchable by Ambit's own two fetches once a loupe row exists. Nothing else in the app changed behaviour (every non-loupe source merges `{}`).

---

## Part B — the adapter

### Task 4: `config/loupe.ts` and the registries

The id has to exist in four type-level places before an adapter can compile against them: `SourceId`, `WALK_SOURCES`, the `walkers` record (Task 5 fills it), and the two tests that pin "every walk source is a blog, except…". This task makes the hole and the next one fills it — but they must land in the **same commit** or `walkers` fails to compile between them. Do Task 4 and Task 5 on one branch without committing in between; the commit is at the end of Task 5.

**Files:**
- Create: `src/server/config/loupe.ts`
- Modify: `src/server/services/sources/types.ts` (the `SourceId` union — add after `"pdr"`)
- Modify: `src/server/config/topics.ts` (`WALK_SOURCES` — add after `"pdr"`; edit the doc comment's "loupe will too")
- Modify: `src/server/config/blogs.test.ts:17-21` (the exception list)
- Modify: `src/lib/source-label.ts` (one entry after `[PDR.id]: PDR.label`)

**Interfaces:**
- Produces: `LOUPE = { id: "loupe", label: "Loupe", defaultUrl: "http://localhost:3100", pageSize: 200 } as const` from `src/server/config/loupe.ts`. Import-safe for client components (plain data, no I/O), like `config/pdr.ts`.

- [x] **Step 1: Make the `blogs.test.ts` exception fail first**

Change the test at lines 17–21 to name Loupe as the second non-blog walker:
```ts
  // Every blog is a walk source, and every walk source is a blog — except the two that walk
  // without being blogs: the Public Domain Review (config/pdr.ts) and Loupe (config/loupe.ts).
  // Named here so a third non-blog walker is a deliberate edit to this list, not a silent hole.
  it("lists every walk source that is not PDR or Loupe", () => {
    expect([...BLOGS.map((b) => b.id), PDR.id, LOUPE.id].sort()).toEqual(
      [...WALK_SOURCES].sort(),
    );
  });
```
with `import { LOUPE } from "./loupe";` next to the `PDR` import.

- [x] **Step 2: Run it to verify it fails**

```sh
bunx vitest run src/server/config/blogs.test.ts
```
Expected: FAIL — `Cannot find module './loupe'`.

- [x] **Step 3: Create `config/loupe.ts`**

```ts
// Loupe as a source (Loupe Phase 4, built 09-06-26; docs/PLAN_loupe-hookup.md). Plain data, no
// I/O — imported by src/lib/source-label.ts, which client components render, so it must stay
// import-safe there, like config/pdr.ts.
//
// **Why this is not a row in blogs.ts.** Loupe is Ben's own magazine-clipping bench (the loupe
// repo; Ambit-Admin's Ecosystem Architecture). Its material is Internet Archive scans with no open
// license — "personal use only" — which Ambit shows in full (an article's OCR text is its body)
// rather than as a link card, so the blog posture does not apply. It is the second walk source
// that is not a blog, after `pdr`.
//
// **Rights and audience.** The per-user content-pool gate the ecosystem doc planned for Loupe
// material is deferred indefinitely (Ben, 09-06-26): Ambit is invite-only and every reader is
// someone Ben knows. `item.source` is the column a future gate filters on; nothing here forecloses
// it. The license string is Loupe's own and travels through toItem() verbatim — a rights
// statement, not UI copy.
//
// **No robots check, no delay.** Those are third-party etiquette; this is a service on Ben's own
// machine that exists to be walked.
export const LOUPE = {
  id: "loupe",
  /** The credit-line eyebrow. The issue and publication are in each item's `attribution`. */
  label: "Loupe",
  /** Where `LOUPE_URL` points in dev. Loupe's own default is :3000, which Ambit must own —
   *  run it as `MEDIA_BASE_URL=http://localhost:3100/media bunx next dev -p 3100`. */
  defaultUrl: "http://localhost:3100",
  /** `/api/v1/articles` caps `limit` at 200 (Loupe SPEC §8.2). The corpus is ~135 kept
   *  articles today, so a full walk is one request. */
  pageSize: 200,
} as const;
```

- [x] **Step 4: Add the id to the two unions**

`types.ts`, in `SourceId` after the `| "pdr"` line:
```ts
  // Loupe (docs/PLAN_loupe-hookup.md, 09-06-26): Ben's magazine-clipping bench, the fifth walk
  // source and the second that is not a blog (config/loupe.ts). The only source whose IMAGES
  // are bearer-gated — services/image-auth.ts.
  | "loupe"
```
`topics.ts`, `WALK_SOURCES` after `"pdr",`:
```ts
  "loupe",
```
and in the doc comment above it change `Blogs live here; loupe will too.` to `Blogs live here; so does loupe (config/loupe.ts).`

- [x] **Step 5: Credit-line label**

`src/lib/source-label.ts`: add `import { LOUPE } from "~/server/config/loupe";` and, after the `[PDR.id]: PDR.label,` line:
```ts
  [LOUPE.id]: LOUPE.label,
```
(The fallback would render "Loupe" anyway; naming it keeps the rule that every walk source has a real label, which `blogs.test.ts` enforces for blogs and this line extends by convention.)

- [x] **Step 6: Do not run typecheck yet**

`walkers` in `sources/index.ts` is `Record<WalkSourceId, …>` and now lacks a `loupe` key, so `bun run typecheck` fails until Task 5 Step 6. Go straight to Task 5.

---

### Task 5: The `loupe` adapter

**Files:**
- Create: `src/server/services/sources/loupe.ts`
- Create: `src/server/services/sources/__fixtures__/loupe.json`
- Create: `src/server/services/sources/loupe.test.ts`
- Modify: `src/server/services/sources/index.ts` (import + `walkers` entry after `pdr,`)
- Modify: `src/server/services/sources/source-invariants.test.ts` (import + `fixturesByWalker` entry)
- Modify: `src/server/services/curator.test.ts` (remove the `as never` cast from Task 3 Step 5)

**Interfaces:**
- Consumes: `CorpusWalkAdapter`, `WalkPage`, `FetchOpts`, `NormalizedItem` from `./types`; `fetchJson` from `./http`; `htmlToText`, `toLede`, `uniqueTags` from `./normalize`; `LOUPE` from `~/server/config/loupe`; `ArticleListItem` shape from Loupe (`readingOrder` from Task 1).
- Produces: `export const loupe: CorpusWalkAdapter<LoupeRaw>`; `export interface LoupeRaw` (the wire item, verbatim); `export function loupeSourceId(raw): string`; `export function bodyText(s: string): string`.

- [x] **Step 1: The fixture**

Preferred: record three real records from the running Loupe (Global Constraints) and **scrub nothing** — the payload contains no secrets, and real OCR text is what the tests should see:
```sh
curl -s -H "Authorization: Bearer $LOUPE_API_TOKEN" 'http://localhost:3100/api/v1/articles?limit=200' \
  | jq '[ (.data | map(select(.type == "image")) | .[0]),
          (.data | map(select(.type == "article" and (.tags | length) > 0)) | .[0]),
          (.data | map(select(.type == "article" and .summary == null)) | .[0]) ] | map(select(. != null))' \
  > src/server/services/sources/__fixtures__/loupe.json
```
Then open the file and confirm it has an image item and at least one article. If any of the three selectors found nothing, that is fine — the tests below select by `type`, and Step 2 says what to do when a case is absent.

Fallback if Loupe is not running: write this file by hand. It is the shape of `ArticleListItem` in `~/Dev/loupe/web/server/rest/articles.ts` plus Task 1's `readingOrder`:
```json
[
  {
    "id": "art_illus01",
    "type": "image",
    "title": "Geodesic dome, Pacific High School",
    "summary": "Photograph of a dome under construction, students on the frame.",
    "body": null,
    "imageUrl": "http://localhost:3100/media/lastwholeearthca00unse/archive/whole-earth-catalog/1971-lastwholeearthca00unse/0115-002-geodesic-dome-pacific-high-school.jpg",
    "sourceUrl": "https://archive.org/details/lastwholeearthca00unse/page/n115",
    "attribution": "The Last Whole Earth Catalog (1971), via Internet Archive",
    "license": "No open license — rights retained by original authors; personal use only.",
    "publication": { "slug": "whole-earth-catalog", "title": "Whole Earth Catalog" },
    "issue": { "iaIdentifier": "lastwholeearthca00unse", "title": "The Last Whole Earth Catalog", "date": "1971-06-01" },
    "pageNumber": 115,
    "readingOrder": 2,
    "regionType": "illustration",
    "confidence": 0.91,
    "corrected": true,
    "tags": ["shelter", "domes"]
  },
  {
    "id": "art_text01",
    "type": "article",
    "title": "Nomadics",
    "summary": "On living lightly and moving often: the tools, the vehicles, the books that make a rolling household possible.",
    "body": "We have been asked many times about the best way to live on the road.\n\nThe short answer is: with less. The long answer fills this section — vehicles, stoves, the <i>Whole Earth</i> way of packing a truck.\n\nSee also SHELTER, page 92.",
    "imageUrl": "http://localhost:3100/media/lastwholeearthca00unse/archive/whole-earth-catalog/1971-lastwholeearthca00unse/0198-000-nomadics.jpg",
    "sourceUrl": "https://archive.org/details/lastwholeearthca00unse/page/n198",
    "attribution": "The Last Whole Earth Catalog (1971), via Internet Archive",
    "license": "No open license — rights retained by original authors; personal use only.",
    "publication": { "slug": "whole-earth-catalog", "title": "Whole Earth Catalog" },
    "issue": { "iaIdentifier": "lastwholeearthca00unse", "title": "The Last Whole Earth Catalog", "date": "1971-06-01" },
    "pageNumber": 198,
    "readingOrder": 0,
    "regionType": "text",
    "confidence": 0.88,
    "corrected": true,
    "tags": ["nomadics", "personal-narrative"]
  },
  {
    "id": "art_text02",
    "type": "article",
    "title": "Owner-built homes",
    "summary": null,
    "body": "A house you build yourself is a house you understand. This book walks through footings, framing and the mistakes everyone makes the first time, with drawings on nearly every page.\n\nRecommended by three readers this year.",
    "imageUrl": "http://localhost:3100/media/lastwholeearthca00unse/archive/whole-earth-catalog/1971-lastwholeearthca00unse/0092-001-owner-built-homes.jpg",
    "sourceUrl": "https://archive.org/details/lastwholeearthca00unse/page/n92",
    "attribution": "The Last Whole Earth Catalog (1971), via Internet Archive",
    "license": "No open license — rights retained by original authors; personal use only.",
    "publication": { "slug": "whole-earth-catalog", "title": "Whole Earth Catalog" },
    "issue": { "iaIdentifier": "lastwholeearthca00unse", "title": "The Last Whole Earth Catalog", "date": "1971-06-01" },
    "pageNumber": 92,
    "readingOrder": 1,
    "regionType": "text",
    "confidence": 0.8,
    "corrected": false,
    "tags": []
  }
]
```

- [x] **Step 2: Write the failing tests**

`src/server/services/sources/loupe.test.ts`:
```ts
// Fixture tests for the loupe adapter — see __fixtures__/loupe.json (recorded from a local Loupe
// on 09-06-26, or hand-written to the shape of loupe/web/server/rest/articles.ts when Loupe was
// not running; either way it is the wire shape plus `readingOrder`).
//
// What is pinned: the POSITION KEY (never Loupe's article id — docs/PLAN_loupe-hookup.md
// decision 2), body-for-articles-only, the license string passing through untouched, and the
// HTML-safety rule every adapter has carried since 8.1.
//
// No walk() test, consistent with every other adapter: I/O is not the unit-test surface.
import { describe, expect, it } from "vitest";

import fixtures from "./__fixtures__/loupe.json";
import { bodyText, loupe, loupeSourceId, type LoupeRaw } from "./loupe";

const raws = fixtures as unknown as LoupeRaw[];
const first = (type: LoupeRaw["type"]) => {
  const found = raws.find((r) => r.type === type);
  if (!found) throw new Error(`fixture has no ${type} item`);
  return found;
};

describe("loupe.toItem", () => {
  it("keys an item on <ia>:<page>:<order>, never on Loupe's article id", () => {
    const raw = first("article");
    const item = loupe.toItem(raw);
    expect(item.source).toBe("loupe");
    expect(item.sourceId).toBe(
      `${raw.issue.iaIdentifier}:${raw.pageNumber}:${raw.readingOrder}`,
    );
    expect(item.sourceId).not.toContain(raw.id);
  });

  it("maps an illustration to an image item with no body", () => {
    const raw = first("image");
    const item = loupe.toItem(raw);
    expect(item.type).toBe("image");
    expect(item.body).toBeNull();
    expect(item.imageUrl).toBe(raw.imageUrl);
  });

  it("maps a text region to an article whose body is the OCR text in paragraphs", () => {
    const raw = first("article");
    const item = loupe.toItem(raw);
    expect(item.type).toBe("article");
    expect(item.body).toBe(bodyText(raw.body ?? ""));
    expect(item.body).toBeTruthy();
    expect(item.body!.split("\n\n").length).toBeGreaterThan(1);
  });

  it("derives a summary from the body when Loupe has none", () => {
    const raw = raws.find((r) => r.type === "article" && r.summary === null);
    if (!raw) return; // the recorded fixture may not have this case; the hand-written one does
    const item = loupe.toItem(raw);
    expect(item.summary.length).toBeGreaterThan(0);
    expect(item.summary.length).toBeLessThanOrEqual(400);
    expect(item.body!.startsWith(item.summary.slice(0, 20))).toBe(true);
  });

  it("passes attribution, license, sourceUrl and tags through verbatim", () => {
    const raw = first("article");
    const item = loupe.toItem(raw);
    expect(item.attribution).toBe(raw.attribution);
    expect(item.license).toBe(raw.license);
    expect(item.license).toMatch(/personal use only/);
    expect(item.sourceUrl).toBe(raw.sourceUrl);
    expect(item.tags).toEqual(raw.tags);
  });

  it("lets no HTML tag through title, summary or body", () => {
    for (const raw of raws) {
      const item = loupe.toItem(raw);
      expect(item.title).not.toMatch(/<[a-z][^>]*>/i);
      expect(item.summary).not.toMatch(/<[a-z][^>]*>/i);
      expect(item.body ?? "").not.toMatch(/<[a-z][^>]*>/i);
    }
  });
});

describe("loupe helpers", () => {
  it("loupeSourceId is the three-part position key", () => {
    expect(
      loupeSourceId({
        issue: { iaIdentifier: "x00y" },
        pageNumber: 7,
        readingOrder: 3,
      }),
    ).toBe("x00y:7:3");
  });

  it("bodyText keeps paragraph breaks, strips tags and collapses inner whitespace", () => {
    expect(bodyText("One  <i>two</i>\n\n\nThree\n  four")).toBe("One two\n\nThree four");
    expect(bodyText("")).toBe("");
  });
});
```

- [x] **Step 3: Run them to verify they fail**

```sh
bunx vitest run src/server/services/sources/loupe.test.ts
```
Expected: FAIL — `Cannot find module './loupe'`.

- [x] **Step 4: Implement the adapter**

`src/server/services/sources/loupe.ts`:
```ts
// Loupe as a corpus-walk source (Loupe Phase 4; docs/PLAN_loupe-hookup.md; Ambit-Admin's
// Ecosystem Architecture names this the corpus-walk pattern's canonical case). Loupe is Ben's
// magazine-clipping bench — Internet Archive scans of the Whole Earth Catalog, segmented into
// articles and illustrations, triaged by hand; `GET /api/v1/articles` serves only what he KEPT,
// oldest issue first, over a keyset cursor (Loupe SPEC §8.2). Ambit walks it in full.
//
// **The thinnest walker in the repo, on purpose.** Loupe was built to meet this contract from the
// other side: every NormalizedItem field is on the wire under its own name, already plain text
// or already null. There is no rights re-check (the license is one honest constant Loupe owns),
// no image derivation (every clip has exactly one), no robots check and no politeness delay (a
// service on Ben's own machine that exists to be walked). What is left for toItem() is three
// decisions, each pinned in loupe.test.ts:
//
//   1. **Identity is position, never `id`.** Loupe re-issues article ids whenever a page is
//      corrected (delete + reinsert), so `(source, source_id)` keyed on `id` would duplicate every
//      corrected clipping. A kept clipping's stable identity is where it sits:
//      `<iaIdentifier>:<pageNumber>:<readingOrder>`. Under that key a correction upserts in place,
//      and a position that no longer exists is removed by `--prune` on a complete walk.
//   2. **Body for articles only.** A text region's OCR is its body (paragraphs, the shape
//      lib/reader-blocks.ts typesets); an illustration's caption is already its summary.
//   3. **Summary falls back to the body's lede** when Loupe's is null — the structural floor's
//      thin-summary rule reads `summary`, and an article with a body is not thin.
//
// **Auth.** Every request carries `Authorization: Bearer <LOUPE_API_TOKEN>`; a 401/403 ends the
// walk on the first response (fetchJson's noRetryOn — the requirement Loupe's own SPEC put on this
// adapter before it existed). The images behind `imageUrl` are gated the same way, and the two
// server-side image fetches attach the same token via services/image-auth.ts — without that half,
// every loupe item would curate blind and fill the proxy with 401s.
import { LOUPE } from "~/server/config/loupe";
import { fetchJson } from "./http";
import { htmlToText, toLede, uniqueTags } from "./normalize";
import type {
  CorpusWalkAdapter,
  FetchOpts,
  NormalizedItem,
  WalkPage,
} from "./types";

/** How much of a body becomes the fallback blurb. */
const LEAD_MAX = 400;

/** One item of `/api/v1/articles`, verbatim (loupe/web/server/rest/articles.ts ArticleListItem
 *  plus `readingOrder`). Every field is kept so the fixture on disk is the wire shape. */
export interface LoupeRaw {
  /** Loupe's article id — NOT stable across corrections; read for nothing but the fixture. */
  id: string;
  type: "image" | "article";
  title: string;
  summary: string | null;
  body: string | null;
  /** Absolute, under Loupe's MEDIA_BASE_URL; bearer-gated (image-auth.ts). */
  imageUrl: string;
  /** Deep link to the Internet Archive page. */
  sourceUrl: string;
  attribution: string;
  license: string;
  publication: { slug: string; title: string };
  issue: { iaIdentifier: string; title: string; date: string | null };
  pageNumber: number;
  readingOrder: number;
  regionType: string;
  confidence: number;
  corrected: boolean;
  tags: string[];
}

interface LoupeEnvelope {
  data: LoupeRaw[];
  nextCursor: string | null;
}

// ── pure helpers (the unit-test surface) ─────────────────────────────────────────────────────

/** Pure: the position key. Typed on the three fields it reads so a test can call it bare. */
export function loupeSourceId(
  raw: Pick<LoupeRaw, "pageNumber" | "readingOrder"> & {
    issue: Pick<LoupeRaw["issue"], "iaIdentifier">;
  },
): string {
  return `${raw.issue.iaIdentifier}:${raw.pageNumber}:${raw.readingOrder}`;
}

/**
 * Pure: OCR text as plain paragraphs separated by one blank line — the shape
 * src/lib/reader-blocks.ts typesets. Loupe's body is already text, but the 8.1 rule (no source
 * HTML, ever) is cheap to keep, and htmlToText also collapses the ragged whitespace hOCR leaves.
 * Returns "" for an empty body so the caller can store null without a special case.
 */
export function bodyText(s: string): string {
  return s
    .split(/\n\s*\n/)
    .map((p) => htmlToText(p))
    .filter(Boolean)
    .join("\n\n");
}

// ── the walk ─────────────────────────────────────────────────────────────────────────────────

function config(): { base: string; token: string } {
  // process.env at call time, not ~/env at module top — see sources/archive.ts for why.
  const base = (process.env.LOUPE_URL ?? "").replace(/\/+$/, "");
  const token = process.env.LOUPE_API_TOKEN;
  if (!base || !token) {
    // Thrown, never an empty page: a missing config that reads as "corpus exhausted" would let a
    // --prune run delete every loupe row as "gone" (the archive adapter's own reasoning, sharpened
    // by --prune existing now).
    throw new Error(
      `loupe adapter not configured — set LOUPE_URL (dev: ${LOUPE.defaultUrl}) and LOUPE_API_TOKEN in .env`,
    );
  }
  return { base, token };
}

/**
 * One page of Loupe's keyset walk. The cursor is Loupe's own `nextCursor` string, passed back
 * untouched (opaque, per the CorpusWalkAdapter rule). No filters are sent, so the cursor's
 * "repeat every filter on every request" caveat (Loupe SPEC §8.2) cannot bite.
 */
async function walk(
  cursor?: string,
  opts?: FetchOpts,
): Promise<WalkPage<LoupeRaw>> {
  const { base, token } = config();
  const limit = Math.max(1, Math.min(opts?.limit ?? LOUPE.pageSize, LOUPE.pageSize));
  const url =
    `${base}/api/v1/articles?limit=${limit}` +
    (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
  const page = (await fetchJson(url, {
    headers: { Authorization: `Bearer ${token}` },
    noRetryOn: [401, 403],
  })) as LoupeEnvelope;
  return {
    raw: page.data,
    ...(page.nextCursor ? { next: page.nextCursor } : {}),
  };
}

/** Pure projection — see the header for the three decisions it makes. */
function toItem(raw: LoupeRaw): NormalizedItem {
  const body = raw.body ? bodyText(raw.body) : "";
  const summary = htmlToText(raw.summary ?? "") || toLede(body, LEAD_MAX);
  return {
    source: "loupe",
    sourceId: loupeSourceId(raw),
    type: raw.type,
    title: htmlToText(raw.title),
    summary,
    body: raw.type === "article" && body ? body : null,
    imageUrl: raw.imageUrl,
    sourceUrl: raw.sourceUrl,
    // Both verbatim. The license is Loupe's rights statement — a cross-service constant Ambit
    // must not re-spell (loupe/web/server/rest/articles.ts ARTICLE_LICENSE).
    attribution: raw.attribution,
    license: raw.license,
    tags: uniqueTags(raw.tags),
  };
}

export const loupe: CorpusWalkAdapter<LoupeRaw> = {
  source: "loupe",
  walk,
  toItem,
};
```

`uniqueTags` (`normalize.ts:27`) trims and dedupes without changing case, and Loupe already stores tags trimmed and lowercase (Loupe SPEC §5.4), so the `tags` equality test in Step 2 holds for any fixture.

- [x] **Step 5: Run the adapter tests**

Same command as Step 3. Expected: PASS (8 tests, or 7 if the recorded fixture lacks a null-summary article — that test returns early).

- [x] **Step 6: Register the walker and its fixture**

`src/server/services/sources/index.ts`: add `import { loupe } from "./loupe";` (alphabetical, after `loc`) and in `walkers` after `pdr,`:
```ts
  // Loupe (docs/PLAN_loupe-hookup.md): Ben's clipping bench, the second non-blog walker.
  loupe,
```
`source-invariants.test.ts`: add `import loupeFixtures from "./__fixtures__/loupe.json";` beside the pdr import and `loupe: loupeFixtures,` in `fixturesByWalker` after `pdr: pdrFixtures,`. Also extend the header comment's parenthetical: *"Walk sources that are not blogs (`pdr`, …; `loupe`, whose articles carry their OCR text as body by design) are outside D5"*.

- [x] **Step 7: Remove the cast from Task 3's curator test**

In `curator.test.ts`, change `source: "loupe" as never,` to `source: "loupe",`.

- [x] **Step 8: Full suite, typecheck, lint**

```sh
bun run test && bun run typecheck && bun run lint
```
Expected: all green. Pay attention to: `blogs.test.ts` (Task 4 Step 1 now passes), `source-invariants.test.ts` ("every registered walker has a fixture here"), `source-label.test.ts`.

- [x] **Step 9: Commit (Tasks 4 + 5 together)**

```sh
git add src/server/config/loupe.ts src/server/config/topics.ts src/server/config/blogs.test.ts \
  src/lib/source-label.ts src/server/services/sources/types.ts src/server/services/sources/index.ts \
  src/server/services/sources/loupe.ts src/server/services/sources/loupe.test.ts \
  src/server/services/sources/__fixtures__/loupe.json src/server/services/sources/source-invariants.test.ts \
  src/server/services/curator.test.ts
git commit -m "feat(sources): loupe — corpus-walk adapter over /api/v1/articles, keyed on position"
```

---

### Task 6: The measured walk and the first write

Nothing here is code. It is the verdict every source gets before rows land (`docs/source-candidates.md`'s trial loop), scaled to a corpus of ~135. Requires Loupe running (Global Constraints) and Ambit's `.env` carrying `LOUPE_URL` + `LOUPE_API_TOKEN`. Ambit's Postgres must be up (`docker compose up -d` in `~/Dev/ambit`; note Loupe's Postgres is a different container on 5433 — do not stop either).

- [x] **Step 1: Prove the walk reaches Loupe and the images come back**

```sh
bun run stats:walk loupe --quota 200
```
Expected output shape (numbers will differ): `offered ~135 · floored N (by rule) · curated N @ avg X · classified N / un-homed N`, plus the un-homed tag histogram. **Read the curator's image-fetch failure tally**: it must be **0 for loupe**. A non-zero tally means the bearer is not reaching Loupe — check `LOUPE_API_TOKEN` matches Loupe's `.env` (and that no shell `export` shadows it: `env | grep LOUPE`), and that `imageUrl` values point at `:3100` (the `MEDIA_BASE_URL` override in Global Constraints). Do not proceed until it is 0.

Record the whole summary block verbatim; Task 7 pastes it.

- [x] **Step 2: Dry-run the ingest lane**

```sh
bun run ingest --source loupe --dry-run
```
Expected: the walk + classify path runs end to end, prints what it *would* write, writes nothing. Check the "walk items not written" line is 0 and that the un-homed count matches Step 1.

- [x] **Step 3: Write the rows**

```sh
bun run ingest --source loupe
```
Then confirm in Postgres:
```sh
psql "$DATABASE_URL" -c "select type, count(*), round(avg(curation_score),2) avg, count(topic_id) homed, count(body) with_body from item where source='loupe' group by 1;"
```
Expected: two rows (`image`, `article`); `with_body` equals the article count; `homed` + un-homed equals the total.

- [x] **Step 4: See one on screen**

Start Ambit (`bun run dev`, port 3000 free — `lsof -ti:3000`), sign in, open `/i/<id>` for one loupe article and one loupe image (ids from `select id, type, title from item where source='loupe' limit 5`). Check: the hero image renders (that is the proxy fill with the bearer — the first request fills `.cache/img/<id>.webp`, the second is a hit); the credit eyebrow reads **LOUPE** and links to the archive.org page; the article's body renders as paragraphs; no HTML shows as text. Then open `/feed` and scroll until a loupe card appears (or use `/dev/feed` with the source readout) — it should draw like any other walk source.

- [x] **Step 5: Warm the rest**

```sh
bun run img:warm --source loupe --rate 4
```
Expected: every loupe image fetched once, 0 failures in the per-host tally for `localhost:3100`. (Loupe is local; the rate is only there to keep the command's shape.)

- [x] **Step 6: Commit nothing; note the numbers**

No files changed in this task. Keep the Step 1 summary and the Step 3 query result for Task 7.

---

### Task 7: Docs — SPEC, CLAUDE.md, log, and the vault

**Files:**
- Modify: `SPEC.md` §6.1 (a new bullet after the `pdr` bullet, ~line 279)
- Modify: `CLAUDE.md` (the "Repository status" paragraph — one sentence; the Ecosystem section's corpus-walk bullet — one sentence)
- Modify: `log.md` (extend today's entry, or create it; session-spend line per CLAUDE.md)
- Modify: `~/vaults/Memory-Palace/05 Projects/Ambit-Admin/Roadmap & Backlog.md` line 14, `Ecosystem Architecture.md` (line 92 area and the status table ~line 121), `log.md` (new entry)

- [x] **Step 1: SPEC §6.1 bullet**

After the `pdr` bullet, in the same voice, one bullet: **`loupe` — Loupe**, the fifth walk source and second non-blog; mechanism (`GET /api/v1/articles?limit=200&cursor=`, bearer, keyset cursor passed back opaque, one request for today's corpus); the position key and why (`id` re-issued on correction; `--prune` removes vanished positions; a corrected clipping keeps its old score until a `PROMPT_VERSION` bump); the bearer on the two image fetches (`services/image-auth.ts`, decided by source); the rights posture (license string verbatim, personal use only, **no per-user gate by Ben's 09-06-26 decision**, `item.source` is the future gate's column); and the Task 6 numbers verbatim (offered / floored / curated avg / homed / un-homed, rows written by type).

- [x] **Step 2: CLAUDE.md**

In the Repository status paragraph, after the PDR sentence, add one sentence: *"**Loupe is hooked up as of 09-06-26** (`docs/PLAN_loupe-hookup.md`): the fifth walk source, keyed on `<ia>:<page>:<order>` never Loupe's `id`, with the Loupe bearer on both server-side image fetches (`services/image-auth.ts`); N rows locally, no per-user gate by Ben's decision — `item.source` is where a future gate filters."* In the Ecosystem section's corpus-walk bullet, change *"loupe's adapter uses it"* to *"loupe's adapter (`sources/loupe.ts`) uses it"*, and in the Two-rights-postures bullet nothing changes.

- [x] **Step 3: `log.md`**

Extend today's entry (or create `### [[09-06-26 Sat]] — …` under `## 2026-09`): **Shipped** (Part A + Part B in one line each), **Decisions** (no gate; position key; bearer by source; Loupe gained `readingOrder`), **Findings** (the Task 6 numbers; anything the walk surfaced — floor hits, un-homed tags, any mojibake seen in a body), **Open / next** (the gate is deferred indefinitely; production needs `LOUPE_URL`/`LOUPE_API_TOKEN` in Coolify **and** a reachable Loupe, which does not exist yet — Loupe has no production host, so `loupe` must be added to `SUSPENDED_SOURCES` **before the next production deploy** or the nightly ingest will print a "not configured" error for it every night. Say which of those two Ben chose, or that it is his to choose). End with the session-spend line from `python3 ~/.claude/scripts/session-spend.py --session <uuid>`; omit it if the script exits non-zero.

- [x] **Step 4: The vault**

The no-gate decision, the position key, and the `readingOrder` contract change are **already recorded** in the vault (09-06-26, from the planning session): `Roadmap & Backlog.md` line 14 carries an "Update 2026-09-06" paragraph, `Ecosystem Architecture.md` has an "Amended 2026-09-06" sentence in the pools section and a rewritten `Ambit ← Loupe` status row, and `log.md` has the 09-06 entry. Do not restate any of it. What remains is marking the work built:

`Roadmap & Backlog.md` line 14: change the leading `- [ ]` to `- [x] 2026-09-06 —` and append one sentence at the very end of the item: *"**Built <date>** on both sides — Loupe exposes `readingOrder`; Ambit's `services/image-auth.ts` + `sources/loupe.ts`; N rows locally (Task 6 numbers). Production still needs a reachable Loupe."*

`Ecosystem Architecture.md` status table, `Ambit ← Loupe` row: replace the leading **Planned in full 09-06-26, not yet built on Ambit's side** with **Built <date>** and keep the rest.

`log.md` (vault): a short dated entry in the file's house style — one paragraph: built on both sides, the Task 6 numbers, and that production still needs a reachable Loupe (`loupe` suspended until then).

- [x] **Step 5: Commit**

```sh
cd ~/Dev/ambit && git add SPEC.md CLAUDE.md log.md docs/PLAN_loupe-hookup.md
git commit -m "docs: loupe hookup — SPEC §6.1 bullet, status, log, and the no-gate decision"
```
The vault is not a git repo Ambit controls; leave its files saved. Do not push Ambit or Loupe unless Ben says to.

---

## Verification (end to end)

1. `bun run test && bun run typecheck && bun run lint` green on `feat/loupe-hookup`.
2. Loupe: `bunx vitest run` and `bunx tsc --noEmit` green in `~/Dev/loupe/web`.
3. `select count(*) from item where source='loupe'` ≈ Loupe's kept count (`curl … /api/v1/articles?limit=200 | jq '.data | length'`).
4. `ls .cache/img | wc -l` grew by that count after `img:warm`; the image-fetch failure tally for loupe is 0 in both `stats:walk` and `img:warm`.
5. A loupe article page renders body paragraphs and a hero; a loupe image page renders the clip; both credit lines link to archive.org.
6. `git status -sb` shows the branch ahead of `main` by four commits (Tasks 2, 3, 4+5, 7) and Loupe's `main` ahead by one (Task 1).

## Risks and known limits

- **Production is not covered by this plan.** Loupe has no production host, so a deployed Ambit cannot reach it. Until it can, `loupe` belongs in `SUSPENDED_SOURCES` on the branch that next deploys (one line + a paragraph in that file's house style), or the nightly ingest prints a "not configured" error for it every night. The rows, once written on production by some future path, would be gated the same way.
- **A corrected page keeps stale scores** until a `PROMPT_VERSION` bump (decision 2). Corrections after triage are rare.
- **Positions that vanish** (a merge leaves fewer clippings on a page) linger until `bun run ingest --source loupe --prune` on a complete walk. Run it after any Loupe triage session.
- **The thin-summary floor may drop illustrations** whose Loupe summary is null or short; `stats:walk` prints the count. `docs/PLAN_caption-less-and-wild.md` Task 1 exempts walk images from that rule; once it merges, a re-walk (free) brings them in.
- **A gate later is three filters, not one:** `getTopicPools` (already filters by source), the public `items.byId` / `/i/[itemId]` resolver, and `/api/img/[itemId]`. Recorded here so the future task is scoped honestly.
