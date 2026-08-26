# Phase 6.3 — Blog source adapters: detailed execution plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** doorofperception.com live in Ambit as link cards — one item per post, credited and linked out — via a new corpus-walk adapter shape, with the blog's images retired from ambit-archive so every one of them carries its credit or isn't there.

**Architecture:** A `CorpusWalkAdapter` sibling to `SourceAdapter` (untouched); a designated-blog registry; the first walker over WordPress's REST API; a walk lane in `scripts/ingest.ts` that bypasses collision resolution and joins the shared skip → floor → curate → upsert path; topic classification as a prompt variant of the existing curator, confined to the walk path; a `LinkOutRow` on the two item text surfaces; a `--prune` flag and a retire script for the two deletion cases.

**Tech Stack:** Next.js 16 / Bun / TypeScript (strict, `noUncheckedIndexedAccess`) / Drizzle over Postgres / Vitest (+ jsdom for components) / Playwright. OpenRouter (`google/gemini-2.5-flash-lite`) for curation.

**Spec:** `docs/PHASE6_DESIGN_6.3.md` — the approved design. This plan argues from it; read it first (10 minutes). `docs/PHASE6_DESIGN_HANDOFF_6.3.md` has the probes behind every number.

**Status: ready to execute cold.** Written 08-25-26 by a session that verified every "verified" claim against the repo and live APIs that day.

## Global Constraints

- **Rights posture (SPEC §6.1, CLAUDE.md):** blog items are link cards. `body` is `null` for every blog item, always. License string is exactly `Rights retained by original authors — displayed with credit and link`. No fair-use claim in any string, comment, or doc.
- **`SourceAdapter` in `src/server/services/sources/types.ts` is a cross-service agreement** (ambit-archive built to it). Add beside it; change nothing in it.
- **`CURATOR_PROMPT` is a product artifact.** Its text is not edited. `PROMPT_VERSION` stays `1`. The default-mode cache key format stays byte-identical so no museum item is ever re-billed.
- **Never render source HTML.** Adapter output is plain text (`normalize.ts` helpers).
- **Etiquette:** shared `USER_AGENT` from `http.ts`; ≥500 ms between requests to a blog; `robots.txt` checked at the start of every walk; 401/403 never retried.
- **Repo conventions:** comment generously (Ben is a returning webdev; the codebase teaches); every task ends green on `bun run check`; commit per task with a conventional-commit subject. Plain branch `feat/6.3-blog-adapters` off `main`, merged back with `--no-ff` at the end (no worktrees).
- **Local dev:** Ambit must own port 3000 (`lsof -ti:3000 | xargs kill` if squatted). Integration tests self-skip without `DATABASE_URL`; run them with `docker compose up -d`. A red Postgres-touching test on a busy machine is usually load, not code (CLAUDE.md).
- **Do not** use the Agent tool, workflows, or deep-research unless Ben asks.

---

## Before you start

```bash
cd ~/Dev/ambit && git checkout main && git pull && git checkout -b feat/6.3-blog-adapters
lsof -ti:3000 || echo "port 3000 free"
docker compose up -d
bun run check          # must be green before the first edit — if not, stop and report
```

**Decisions locked (do not relitigate — from the design):** D1 one item per post using `featured_media`; D2 archive stops serving doorofperception, Ambit deletes those rows, ordered *after* the blog is live; D3 corpus-walk as a sibling contract; D4 LLM classify-or-null in the curator; D5 one blurb in `summary`, `body` always null; Q7 blog items go through the normal floor + curator. Approach A for pipeline integration (walk lane joins at the existing-row skip).

**File map (what this plan creates or modifies):**

| File | Role |
|---|---|
| `src/server/services/sources/types.ts` | + `WalkPage`, `CorpusWalkAdapter`; `SourceId` + `"doorofperception"` |
| `src/server/config/topics.ts` | + `WALK_SOURCES`, `WalkSourceId` |
| `src/server/config/blogs.ts` (new) | designated-blog registry, `isBlogSource`, `BLOG_LICENSE` |
| `src/lib/source-label.ts` | labels from the registry |
| `src/server/services/sources/index.ts` | + `walkers`, `ALL_SOURCE_IDS`; `adapters` keyed by `SearchSourceId` |
| `src/server/services/sources/http.ts` | + `fetchJsonResponse`, `noRetryOn`, `HttpRefusedError` |
| `src/server/services/sources/normalize.ts` | + `htmlToText`; numeric entities in `decodeEntities` |
| `src/server/services/sources/robots.ts` (new) | `robotsDisallowsAll`, `assertCrawlAllowed` |
| `src/server/services/sources/doorofperception.ts` (new) | the walker |
| `src/server/services/curator.ts` | classify mode |
| `src/server/services/ingest-plan.ts` | + `topicHistogram`, `planPrune` |
| `scripts/ingest.ts` | walk lane, `--prune`, summary |
| `scripts/probe-adapter.ts`, `scripts/recurate.ts` | know about walkers |
| `scripts/retire-source-rows.ts` (new) | D2's Ambit side |
| `src/components/item/link-out-row.tsx` (new) | the prominent link-out |
| `src/components/item/image-item-body.tsx`, `src/components/gallery/gallery-details-sheet.tsx` | render it; attribution dedupe |
| `src/server/services/sources/source-invariants.test.ts` (new) | D5 as a test |
| `e2e/item.spec.ts` | one blog-item test |
| `SPEC.md`, `docs/BUILD_PLAN.md`, `docs/source-candidates.md`, `CLAUDE.md`, `log.md`, `docs/PHASE6_WALKTHROUGH_6.3.md` | docs |
| Ambit-Admin vault (`~/vaults/Memory-Palace/05 Projects/Ambit-Admin/`) | cross-repo record |

---

## Tasks

### T1 — Contracts and registries

**Files:**
- Modify: `src/server/services/sources/types.ts`
- Modify: `src/server/config/topics.ts` (after `SEED_SOURCES`, line ~58)
- Create: `src/server/config/blogs.ts`, `src/server/config/blogs.test.ts`
- Modify: `src/lib/source-label.ts`
- Modify: `src/server/services/sources/index.ts`
- Modify: `src/server/config/topics.test.ts`
- Modify: `scripts/probe-adapter.ts`, `scripts/recurate.ts`, `scripts/ingest.ts` (only the `knownSources` lines — the walk lane is T6)

**Interfaces:**
- Produces: `WalkPage<Raw>`, `CorpusWalkAdapter<Raw>`, `SourceId` (now includes `"doorofperception"`), `SearchSourceId`, `WALK_SOURCES`, `WalkSourceId`, `BLOGS`, `BlogConfig`, `BLOG_LICENSE`, `blogConfig(id)`, `isBlogSource(source)`, `walkers`, `ALL_SOURCE_IDS`. Every later task imports from these.

- [ ] **Step 1: Write the failing registry tests**

`src/server/config/blogs.test.ts`:

```ts
// Guards the agreement between the designated-blog registry and the three places a blog's id has
// to be recognized: WALK_SOURCES (which tier it ingests under), SourceId (the DB's open set), and
// SOURCE_LABELS (what the credit line prints). A blog missing from any one of them is either
// un-ingestable or mis-credited — and the credit line is the claim an item makes about where it
// came from, so "Doorofperception" (the title-case fallback) is a wrong claim, not a cosmetic one.
import { describe, expect, it } from "vitest";

import { sourceLabel } from "~/lib/source-label";
import { BLOG_LICENSE, BLOGS, blogConfig, isBlogSource } from "./blogs";
import { WALK_SOURCES } from "./topics";

describe("designated-blog registry", () => {
  it("lists exactly the walk sources, and every walk source is a blog", () => {
    expect(BLOGS.map((b) => b.id).sort()).toEqual([...WALK_SOURCES].sort());
  });

  it("gives every blog a real credit-line label, never the title-case fallback", () => {
    for (const b of BLOGS) {
      expect(sourceLabel(b.id)).toBe(b.label);
      expect(b.label).not.toBe(b.id.charAt(0).toUpperCase() + b.id.slice(1));
    }
  });

  it("uses the one honest license string on every blog", () => {
    for (const b of BLOGS) expect(b.license).toBe(BLOG_LICENSE);
    expect(BLOG_LICENSE).not.toMatch(/fair use/i);
  });

  it("records an https base URL with no trailing slash and a dated robots check", () => {
    for (const b of BLOGS) {
      expect(b.baseUrl).toMatch(/^https:\/\/[^/]+$/);
      expect(b.robotsCheckedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("answers isBlogSource for blogs only", () => {
    expect(isBlogSource("doorofperception")).toBe(true);
    expect(isBlogSource("met")).toBe(false);
    expect(isBlogSource("archive")).toBe(false);
    expect(blogConfig("doorofperception")?.label).toBe("Door of Perception");
    expect(blogConfig("met")).toBeUndefined();
  });
});
```

Add to `src/server/config/topics.test.ts`, inside `describe("seed queries", …)`, after the "names only known sources" test:

```ts
  // Phase 6.3: a walk source (a blog) has no seed queries at all — it is ingested by walking its
  // whole corpus and classifying each item, not by searching it per topic. A cell naming one is
  // therefore always a mistake, and the three tiers must not overlap or a source would be both
  // searched and walked.
  it("gives walk sources no cells, and keeps the three source tiers disjoint", () => {
    for (const t of TOPICS) {
      for (const source of WALK_SOURCES) {
        expect(t.seedQueries, `${t.id}/${source}`).not.toHaveProperty(source);
      }
    }
    const seed = new Set<string>(SEED_SOURCES);
    for (const source of WALK_SOURCES) expect(seed.has(source)).toBe(false);
  });
```

and extend that file's import line to `import { SEED_SOURCES, TOPICS, TRIAL_SOURCES, V1_SOURCES, WALK_SOURCES } from "./topics";`.

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test src/server/config/`
Expected: FAIL — `./blogs` cannot be resolved; `WALK_SOURCES` is not exported.

- [ ] **Step 3: Add the contract types**

In `src/server/services/sources/types.ts`, add `| "doorofperception"` to `SourceId` after `| "poetrydb";` with this comment above it:

```ts
  // Phase 6.3: the first designated blog (docs/PHASE6_DESIGN_6.3.md). Blogs are corpus-WALK
  // sources — see CorpusWalkAdapter below — and are registered in server/config/blogs.ts, which
  // is also where their credit-line label and license string live.
  | "doorofperception";
```

Append to the end of the file:

```ts
/**
 * One page of a corpus walk. `next` is the cursor for the following page and is ABSENT (not
 * null, not "") when the corpus is exhausted — ingest loops `while (next)`.
 */
export interface WalkPage<Raw> {
  raw: Raw[];
  next?: string;
}

/**
 * The second blessed adapter shape (Phase 6.3; Ambit-Admin's Ecosystem Architecture calls it
 * "corpus-walk"): a source with no search capability, ingested in full and topic-assigned on
 * Ambit's side by the curator's classify mode. Blogs are the first walk sources; loupe is the
 * next. A sibling of SourceAdapter, deliberately — that interface is a cross-service agreement
 * and adding a method to it would change what ambit-archive promised to implement.
 *
 * Two rules the ingest lane relies on:
 *   - `cursor` is opaque and adapter-defined (a WP page number, an RSS offset, a Tumblr start
 *     index). Ingest never inspects it; it only passes back what it was given.
 *   - A 401/403 must fail the walk immediately, never retry (fetchJson's `noRetryOn`). A blog
 *     that refuses us is a blog we stop asking — the artvee/50watts rule, at the wire.
 */
export interface CorpusWalkAdapter<Raw = unknown> {
  source: SourceId;
  walk(cursor?: string, opts?: FetchOpts): Promise<WalkPage<Raw>>;
  /** Pure and synchronous, fixture-tested — the same rule as SourceAdapter.toItem. */
  toItem(raw: Raw): NormalizedItem;
}
```

- [ ] **Step 4: Add the walk tier to topics config**

In `src/server/config/topics.ts`, after `export const SEED_SOURCES = […] as const;` add:

```ts
/** Phase 6.3's third tier: sources ingested by WALKING their whole corpus rather than searching
 *  it per topic (docs/PHASE6_DESIGN_6.3.md §4). They have NO seed cells — each item gets its
 *  topic from the curator's classify mode at ingest — so they are deliberately absent from
 *  SEED_SOURCES and SeedQueries. Blogs live here; loupe will too. */
export const WALK_SOURCES = ["doorofperception"] as const;

export type WalkSourceId = (typeof WALK_SOURCES)[number];
```

- [ ] **Step 5: Create the registry**

`src/server/config/blogs.ts`:

```ts
// The designated-blog registry (Phase 6.3, docs/PHASE6_DESIGN_6.3.md §4.2). One entry per blog
// Ambit shows as link cards. This is config a blog's walker reads instead of hard-coding, and the
// one place a blog's credit-line label and license string are decided.
//
// **What a blog is, under Ambit's roof.** Not an open-license source. Its images and text belong
// to the blog's authors; Ambit displays one image + the blog's own excerpt + a visible credit + a
// prominent link to the post, in the shape of a social link preview, and never a republished
// article (CLAUDE.md's 08-20-26 rights decision). `license` below is the honest statement of that.
// There is no fair-use claim anywhere, and removal on request is the standing policy.
//
// **What is NOT here, on purpose (YAGNI until blog #2):** per-blog rate limits, per-blog
// walk options, tag→topic maps. `walk` names the flavour only so the next blog — which will be
// RSS or Tumblr, not WordPress (the handoff's F7) — has a place to say so.
import type { WalkSourceId } from "./topics";

/** The one license string every blog shares. Truthful rather than permissive. */
export const BLOG_LICENSE =
  "Rights retained by original authors — displayed with credit and link";

export interface BlogConfig {
  id: WalkSourceId;
  /** The credit line's text: `from: Door of Perception`. Also `item.attribution`. */
  label: string;
  /** Origin only — no path, no trailing slash. The walker builds its own URLs from it. */
  baseUrl: string;
  license: typeof BLOG_LICENSE;
  /** ISO date of the last human check of `/robots.txt` — the etiquette rule made into data. The
   *  walker re-checks on every run; this records that a person also looked before designating. */
  robotsCheckedOn: string;
  walk: "wp-rest";
}

export const BLOGS: readonly BlogConfig[] = [
  {
    id: "doorofperception",
    label: "Door of Perception",
    baseUrl: "https://doorofperception.com",
    license: BLOG_LICENSE,
    // Verified 08-25-26: `User-agent: * / Disallow:` (allow-all) plus a Yoast block and a sitemap.
    // No AI block list. See docs/PHASE6_DESIGN_HANDOFF_6.3.md F1.
    robotsCheckedOn: "2026-08-25",
    walk: "wp-rest",
  },
];

export function blogConfig(id: string): BlogConfig | undefined {
  return BLOGS.find((b) => b.id === id);
}

/** What display code keys the link-out treatment on. A plain string in, because `item.source`
 *  is an open set in the schema and components see it as `string`. */
export function isBlogSource(source: string): boolean {
  return blogConfig(source) !== undefined;
}
```

- [ ] **Step 6: Feed the labels from the registry**

In `src/lib/source-label.ts`, add `import { BLOGS } from "~/server/config/blogs";` at the top, and inside `SOURCE_LABELS` after `poetrydb: "PoetryDB",` add:

```ts
  // Phase 6.3: blogs name themselves in the registry — one source of truth for the credit line,
  // the attribution column, and the link-out row's copy.
  ...Object.fromEntries(BLOGS.map((b) => [b.id, b.label])),
```

- [ ] **Step 7: Register the walker slot and split the key types**

Replace the body of `src/server/services/sources/index.ts` (keep the existing imports; add the new ones) with:

```ts
import { aic } from "./aic";
import { archive } from "./archive";
import { cma } from "./cma";
import { doorofperception } from "./doorofperception";
import { loc } from "./loc";
import { met } from "./met";
import { nasaImages } from "./nasa-images";
import { poetrydb } from "./poetrydb";
import { smithsonian } from "./smithsonian";
import type { CorpusWalkAdapter, SourceAdapter, SourceId } from "./types";
import { wellcome } from "./wellcome";
import { wikipedia } from "./wikipedia";
import type { WalkSourceId } from "~/server/config/topics";

/** Every SourceId that is NOT a walk source — the keys `adapters` must cover exhaustively. */
export type SearchSourceId = Exclude<SourceId, WalkSourceId>;

export const adapters: Record<SearchSourceId, SourceAdapter<unknown>> = {
  wikipedia,
  met,
  aic,
  cma,
  wellcome,
  archive,
  smithsonian,
  loc,
  "nasa-images": nasaImages,
  poetrydb,
};

/** Phase 6.3: the corpus-walk registry, beside — never inside — the search registry. The two
 *  Record key types are complementary halves of SourceId, so a source in both (or neither) is a
 *  compile error here rather than a runtime surprise in ingest. */
export const walkers: Record<WalkSourceId, CorpusWalkAdapter<unknown>> = {
  doorofperception,
};

/** For CLIs that validate a `--source` flag: everything ingest knows how to reach. */
export const ALL_SOURCE_IDS: SourceId[] = [
  ...(Object.keys(adapters) as SearchSourceId[]),
  ...(Object.keys(walkers) as WalkSourceId[]),
];

export type {
  CorpusWalkAdapter,
  NormalizedItem,
  SourceAdapter,
  SourceId,
  FetchOpts,
  WalkPage,
} from "./types";
```

This will not compile until T4 creates `./doorofperception`. To keep T1 independently green, create a **stub** `src/server/services/sources/doorofperception.ts` now — T4 replaces it entirely:

```ts
// STUB — replaced in full by Phase 6.3 T4. Exists so the registry compiles before the walker does.
import type { CorpusWalkAdapter, NormalizedItem } from "./types";

export const doorofperception: CorpusWalkAdapter<unknown> = {
  source: "doorofperception",
  walk: () => Promise.reject(new Error("doorofperception walker not built yet (T4)")),
  toItem: (): NormalizedItem => {
    throw new Error("doorofperception walker not built yet (T4)");
  },
};
```

- [ ] **Step 8: Point the CLIs at the right lists**

In `scripts/ingest.ts` change `const knownSources = Object.keys(adapters) as SourceId[];` to:

```ts
const knownSources = ALL_SOURCE_IDS;
```

and its import to `import { adapters, ALL_SOURCE_IDS, walkers } from "~/server/services/sources";` (`walkers` is used in T6; leave it imported now — eslint's unused-import rule would flag it, so if `bun run lint` complains, add `// eslint-disable-next-line @typescript-eslint/no-unused-vars` on that line and remove the directive in T6). In `scripts/probe-adapter.ts` and `scripts/recurate.ts`, every `Object.keys(registry)` / `Object.keys(adapters)` that builds a `knownSources` list becomes `ALL_SOURCE_IDS` (import it). In `probe-adapter.ts`, the `registry[source as SourceId]` lookup must now be guarded — replace the `const adapter = registry[source as SourceId];` line with:

```ts
if (source in walkers) {
  console.error(
    `"${source}" is a corpus-walk source — probe it with: bun run probe:walk ${source}`,
  );
  process.exit(1);
}
const adapter = registry[source as SearchSourceId];
```

importing `SearchSourceId` and `walkers` from `~/server/services/sources`. (`probe:walk` is added in T4.)

- [ ] **Step 9: Typecheck, test, lint**

Run: `bun run typecheck && bun run test src/server/config/ && bun run lint`
Expected: all green. `recurate.ts` compiles because it only uses the id list, not the adapter map, for a blog source — if it *does* index `adapters[source]`, guard it the same way as probe (a blog row can be re-curated by the classify mode later; not this phase).

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "feat(sources): CorpusWalkAdapter contract, walk tier, designated-blog registry"
```

---

### T2 — `fetchJson`: headers out, no-retry-on-refusal in

**Files:**
- Modify: `src/server/services/sources/http.ts`
- Create: `src/server/services/sources/http.test.ts`

**Interfaces:**
- Produces: `fetchJsonResponse(url, opts) → Promise<{ data: unknown; headers: Headers }>`; `fetchJson` unchanged in signature, now accepting `noRetryOn?: number[]`; `class HttpRefusedError extends Error { status: number }`.

- [ ] **Step 1: Write the failing tests**

`src/server/services/sources/http.test.ts`:

```ts
// fetchJson's retry policy, pinned. Every source adapter goes through it, so a change here is a
// change to how Ambit treats every host on the internet — worth a test even though the function
// is twenty lines. Fake timers make the 1s → 3s → 9s backoff instantaneous.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchJson, fetchJsonResponse, HttpRefusedError } from "./http";

function stub(responses: { ok: boolean; status: number; body?: unknown }[]) {
  const calls: string[] = [];
  let i = 0;
  vi.stubGlobal("fetch", (input: string | URL) => {
    calls.push(String(input));
    const r = responses[Math.min(i++, responses.length - 1)]!;
    return Promise.resolve({
      ok: r.ok,
      status: r.status,
      headers: new Headers({ "x-wp-totalpages": "4" }),
      json: () => Promise.resolve(r.body ?? {}),
    });
  });
  return calls;
}

describe("fetchJson", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("retries a non-ok response up to four attempts, then throws", async () => {
    const calls = stub([{ ok: false, status: 503 }]);
    const p = fetchJson("https://example.test/a");
    // Attach the rejection handler BEFORE advancing timers, or the rejection is unhandled.
    const outcome = expect(p).rejects.toThrow("HTTP 503");
    await vi.runAllTimersAsync();
    await outcome;
    expect(calls).toHaveLength(4);
  });

  it("does NOT retry a status listed in noRetryOn — a refusal is final", async () => {
    const calls = stub([{ ok: false, status: 403 }]);
    await expect(
      fetchJson("https://example.test/a", { noRetryOn: [401, 403] }),
    ).rejects.toBeInstanceOf(HttpRefusedError);
    expect(calls).toHaveLength(1);
  });

  it("still retries a 403 when noRetryOn is not given (the Met's rate limit looks like one)", async () => {
    const calls = stub([{ ok: false, status: 403 }]);
    const p = fetchJson("https://example.test/a");
    const outcome = expect(p).rejects.toThrow("HTTP 403");
    await vi.runAllTimersAsync();
    await outcome;
    expect(calls).toHaveLength(4);
  });

  it("fetchJsonResponse hands back the headers alongside the parsed body", async () => {
    stub([{ ok: true, status: 200, body: [{ id: 1 }] }]);
    const { data, headers } = await fetchJsonResponse("https://example.test/a");
    expect(data).toEqual([{ id: 1 }]);
    expect(headers.get("x-wp-totalpages")).toBe("4");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `bun run test src/server/services/sources/http.test.ts`
Expected: FAIL — `fetchJsonResponse` / `HttpRefusedError` not exported.

- [ ] **Step 3: Implement**

Replace everything in `http.ts` from `/**\n * GET a JSON endpoint` to the end of `fetchJson` with:

```ts
/**
 * A non-ok status the caller told us never to retry. Distinct class so the retry loop can let it
 * through untouched, and so a walker can distinguish "refused" from "flaky" in its own error path.
 */
export class HttpRefusedError extends Error {
  constructor(
    public readonly status: number,
    url: string,
  ) {
    super(`HTTP ${status} for ${url} — refused; not retried`);
    this.name = "HttpRefusedError";
  }
}

export interface FetchJsonOpts {
  delayMs?: number;
  headers?: Record<string, string>;
  /**
   * Statuses that end the call on the first attempt instead of entering the backoff loop. Added
   * in Phase 6.3 for corpus-walk sources: a 401/403 from a blog is a refusal, and a bot that
   * retries a refusal four times with backoff is exactly the bot robots.txt exists to keep out.
   * (Also the loupe adapter requirement on record in Ambit-Admin.) Left unset, every non-ok
   * response is retryable — the Met's rate limit surfaces as a 403 that clears after a pause.
   */
  noRetryOn?: number[];
}

/**
 * GET a JSON endpoint and return the parsed body *and* the response headers. Retry-with-backoff
 * on failure (see the module header): the retry exists chiefly for the Met, whose rate limit
 * surfaces as an HTTP 403 that looks exactly like a permanent denial but clears after a short
 * pause (phase0/NOTES.md) — so any non-ok response is treated as retryable, not just network
 * errors, unless `noRetryOn` says otherwise.
 *
 * Headers are returned because WordPress paginates by header (`x-wp-totalpages`), and a walker
 * that can't read it has to guess when the corpus ends. Most callers want `fetchJson` below.
 */
export async function fetchJsonResponse(
  url: string,
  opts?: FetchJsonOpts,
): Promise<{ data: unknown; headers: Headers }> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      if (opts?.delayMs) await sleep(opts.delayMs);
      const res = await fetch(url, {
        // Spread last so a caller can add headers (never drop the defaults). This exists for
        // the archive adapter (Phase A.5), the first source that authenticates — it needs an
        // `x-archive-key` on every request. Routing that through fetchJson rather than a bare
        // fetch is the whole point: the keyed source inherits the retry/backoff and the
        // User-Agent instead of quietly reimplementing half of them.
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
          ...opts?.headers,
        },
      });
      if (!res.ok) {
        if (opts?.noRetryOn?.includes(res.status))
          throw new HttpRefusedError(res.status, url);
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      return { data: await res.json(), headers: res.headers };
    } catch (err) {
      if (err instanceof HttpRefusedError) throw err;
      lastErr = err;
      // Exponential backoff (1s → 3s → 9s) plus up to 500ms of jitter so concurrent adapters
      // don't all retry in lockstep — same shape phase0/harvest.ts and phase0/curate.ts both use.
      if (attempt < 4)
        await sleep(1000 * 3 ** (attempt - 1) + Math.random() * 500);
    }
  }
  throw lastErr;
}

/** The common case: just the body. Identical policy to fetchJsonResponse. */
export async function fetchJson(
  url: string,
  opts?: FetchJsonOpts,
): Promise<unknown> {
  return (await fetchJsonResponse(url, opts)).data;
}
```

- [ ] **Step 4: Run the whole suite**

Run: `bun run test`
Expected: green — every adapter still goes through the same loop. Then `bun run typecheck && bun run lint`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(http): fetchJsonResponse with headers; noRetryOn for refusals"
```

---

### T3 — `normalize.ts`: HTML to text, numeric entities

**Files:**
- Modify: `src/server/services/sources/normalize.ts`, `src/server/services/sources/normalize.test.ts`

**Interfaces:**
- Produces: `htmlToText(html: string): string`. `decodeEntities` now also decodes `&#NNNN;` and `&#xHHHH;`.

- [ ] **Step 1: Write the failing tests**

Append to `normalize.test.ts` (match its existing import of the helpers; add `htmlToText`):

```ts
describe("htmlToText", () => {
  // WordPress's `title.rendered` and `excerpt.rendered` (Phase 6.3): a <br> inside a title, a <p>
  // wrapper with a trailing newline, and numeric entities for curly quotes and dashes.
  it("turns a WP-rendered title with a <br> into one clean line", () => {
    expect(htmlToText("The Geologic Atlas<br>of the Moon")).toBe(
      "The Geologic Atlas of the Moon",
    );
  });

  it("strips the <p> wrapper and collapses whitespace on an excerpt", () => {
    expect(
      htmlToText(
        "<p>The palette exists so that four billion years can be told apart at a glance.</p>\n",
      ),
    ).toBe(
      "The palette exists so that four billion years can be told apart at a glance.",
    );
  });

  it("decodes numeric entities, decimal and hex, and leaves &amp; for last", () => {
    expect(htmlToText("Rock &#8217;n&#8217; roll &#x2014; &amp;c.")).toBe(
      "Rock ’n’ roll — &c.",
    );
    // A double-escaped sequence resolves ONE level, never two.
    expect(htmlToText("&amp;#8217;")).toBe("&#8217;");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun run test src/server/services/sources/normalize.test.ts`
Expected: FAIL — `htmlToText` not exported.

- [ ] **Step 3: Implement**

In `decodeEntities`, insert the two numeric replacements immediately **before** the `&amp;` line (the last-ness of `&amp;` is documented and load-bearing):

```ts
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) =>
      String.fromCodePoint(parseInt(h, 16)),
    )
    .replace(/&amp;/g, "&");
```

and extend that function's comment with one line: `Numeric forms (decimal and hex) were added for WordPress (Phase 6.3), which renders curly quotes and dashes as \`&#8217;\` / \`&#8211;\`.`

Append to the file:

```ts
/**
 * The whole chain for a field that arrives as rendered HTML — WordPress's `title.rendered` and
 * `excerpt.rendered` (Phase 6.3). Tags → spaces, entities → characters, whitespace → single
 * spaces, trimmed. Produces plain text and only plain text: this is the line that keeps CLAUDE.md's
 * "never render unsanitized source HTML" true for blogs, because nothing HTML-shaped survives it.
 */
export function htmlToText(html: string): string {
  return decodeEntities(stripHtml(html)).replace(/\s+/g, " ").trim();
}
```

- [ ] **Step 4: Verify, commit**

Run: `bun run test src/server/services/sources/ && bun run typecheck`
Expected: green.

```bash
git add -A && git commit -m "feat(normalize): htmlToText; numeric entity decoding for WordPress"
```

---

### T4 — The doorofperception walker (with robots check and fixture)

**Files:**
- Create: `src/server/services/sources/robots.ts`, `src/server/services/sources/robots.test.ts`
- Create (replace stub): `src/server/services/sources/doorofperception.ts`
- Create: `src/server/services/sources/doorofperception.test.ts`, `src/server/services/sources/__fixtures__/doorofperception.json`
- Create: `scripts/probe-walk.ts`; Modify: `package.json` (`"probe:walk": "bun run scripts/probe-walk.ts"`)

**Interfaces:**
- Consumes: `fetchJsonResponse`, `HttpRefusedError` (T2); `htmlToText`, `uniqueTags` (T3); `blogConfig`, `BLOG_LICENSE` (T1); `CorpusWalkAdapter`, `WalkPage` (T1).
- Produces: `doorofperception: CorpusWalkAdapter<DopRaw>`; `DopRaw` (a WP post + `tagNames: string[]`); `robotsDisallowsAll(robotsTxt, agent)`, `assertCrawlAllowed(baseUrl)`.

- [ ] **Step 1: Write the failing robots tests**

`robots.test.ts`:

```ts
// The etiquette rule as code (docs/PHASE6_DESIGN_6.3.md §8): a site that machine-readably refuses
// crawlers is not walked. Two real robots.txt files, recorded 08-25-26, are the fixtures — one
// that admits everyone and one that refuses everyone — plus the named-agent case.
import { describe, expect, it } from "vitest";

import { robotsDisallowsAll } from "./robots";

const DOP = `User-agent: *
Disallow: /wp-content/uploads/wpo/wpo-plugins-tables-list.json

# START YOAST BLOCK
# ---------------------------
User-agent: *
Disallow:

Sitemap: https://doorofperception.com/sitemap_index.xml
# ---------------------------
# END YOAST BLOCK
`;

const FIFTY_WATTS = `User-agent: OAI-SearchBot
User-agent: GPTBot
Disallow: /

User-agent: ChatGPT-User
Crawl-delay: 2

User-agent: *
Disallow: /
`;

describe("robotsDisallowsAll", () => {
  it("admits a site whose wildcard group only disallows specific paths", () => {
    expect(robotsDisallowsAll(DOP, "Ambit")).toBe(false);
  });

  it("refuses a site whose wildcard group disallows the root", () => {
    expect(robotsDisallowsAll(FIFTY_WATTS, "Ambit")).toBe(true);
  });

  it("refuses when OUR agent is named with a root disallow, even if * is open", () => {
    const txt = `User-agent: Ambit\nDisallow: /\n\nUser-agent: *\nDisallow:\n`;
    expect(robotsDisallowsAll(txt, "Ambit")).toBe(true);
  });

  it("admits when only OTHER agents are refused", () => {
    const txt = `User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nDisallow:\n`;
    expect(robotsDisallowsAll(txt, "Ambit")).toBe(false);
  });

  it("admits an empty or missing file", () => {
    expect(robotsDisallowsAll("", "Ambit")).toBe(false);
  });
});
```

- [ ] **Step 2: Implement `robots.ts`**

```ts
// Scrape etiquette, enforced (docs/PHASE6_DESIGN_6.3.md §8). Every corpus walk starts here.
//
// The rule is deliberately narrow: a group for `*` or for our own agent name that contains
// `Disallow: /` (the root, exactly) means "do not crawl", and we don't. Path-level disallows are
// NOT interpreted — Ambit only ever reads a blog's public JSON/feed endpoints, so the honest
// question is "does this site refuse agents", not "which paths". A full robots parser would be
// more code pretending to more precision than the policy needs.
//
// Precedents this encodes: artvee (cut 08-20-26, an AI block list) and 50watts (cut 08-25-26,
// `User-agent: * / Disallow: /`). A site that says no in machine-readable form does not become a
// designated blog because its content is appealing.
import { USER_AGENT } from "./http";

/** The token robots.txt would name us by — the product name at the front of USER_AGENT. */
export const ROBOTS_AGENT_NAME = USER_AGENT.split("/")[0] ?? "Ambit";

/**
 * Pure: does this robots.txt refuse `agent` (or everyone) at the root?
 * Groups are "one or more User-agent lines, then directives, until a blank line".
 */
export function robotsDisallowsAll(robotsTxt: string, agent: string): boolean {
  const wanted = new Set(["*", agent.toLowerCase()]);
  let groupAgents: string[] = [];
  let inDirectives = false;

  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (line === "") {
      groupAgents = [];
      inDirectives = false;
      continue;
    }
    const [key, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    const k = key?.trim().toLowerCase();

    if (k === "user-agent") {
      // A User-agent line after directives starts a new group even without a blank line.
      if (inDirectives) groupAgents = [];
      groupAgents.push(value.toLowerCase());
      inDirectives = false;
    } else if (k === "disallow") {
      inDirectives = true;
      if (value === "/" && groupAgents.some((a) => wanted.has(a))) return true;
    } else {
      inDirectives = true;
    }
  }
  return false;
}

/**
 * Fetch `${baseUrl}/robots.txt` and throw if it refuses us. A missing file (404) or an
 * unreachable host is treated as "no policy" — the walk proceeds and its own requests will
 * succeed or fail on their merits. Plain fetch, not fetchJson: the body is text, and a retry
 * loop around a policy file is pointless.
 */
export async function assertCrawlAllowed(baseUrl: string): Promise<void> {
  let text = "";
  try {
    const res = await fetch(`${baseUrl}/robots.txt`, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (res.ok) text = await res.text();
  } catch {
    return;
  }
  if (robotsDisallowsAll(text, ROBOTS_AGENT_NAME)) {
    throw new Error(
      `${baseUrl}/robots.txt disallows crawling for "${ROBOTS_AGENT_NAME}" or "*" — walk aborted`,
    );
  }
}
```

Run: `bun run test src/server/services/sources/robots.test.ts` → PASS.

- [ ] **Step 3: Record the fixture**

The fixture is the walker's own raw shape — a WP post plus `tagNames`. Record two real posts and add one synthetic no-featured-image post:

```bash
cd ~/Dev/ambit
UA="Ambit/0.1 (https://github.com/Ibenthinkin/Ambit; benjamin.reilly@gmail.com)"
curl -s -A "$UA" "https://doorofperception.com/wp-json/wp/v2/posts?per_page=2&page=1&_embed=wp:featuredmedia" > /tmp/dop-posts.json
# Resolve the tag ids those two posts use:
IDS=$(python3 -c "import json;print(','.join(str(t) for p in json.load(open('/tmp/dop-posts.json')) for t in p['tags']))")
curl -s -A "$UA" "https://doorofperception.com/wp-json/wp/v2/tags?include=$IDS&per_page=100&_fields=id,name" > /tmp/dop-tags.json
python3 - <<'PY'
import json, html
posts = json.load(open('/tmp/dop-posts.json'))
names = {t['id']: html.unescape(t['name']) for t in json.load(open('/tmp/dop-tags.json'))}
keep = ['id','slug','link','date','title','excerpt','tags','categories','featured_media','_embedded']
out = []
for p in posts:
    row = {k: p[k] for k in keep if k in p}
    row['_embedded'] = {'wp:featuredmedia': [{
        'source_url': p['_embedded']['wp:featuredmedia'][0]['source_url'],
        'media_details': {k: p['_embedded']['wp:featuredmedia'][0]['media_details'].get(k) for k in ('width','height')},
    }]}
    row['tagNames'] = [names[t] for t in p['tags'] if t in names]
    out.append(row)
# The synthetic edge case: a post with no featured image (1 of 390 in the real corpus).
out.append({
    'id': 1, 'slug': 'no-featured-image', 'link': 'https://doorofperception.com/2020/01/no-featured-image/',
    'date': '2020-01-01T00:00:00', 'title': {'rendered': 'A post with no picture'},
    'excerpt': {'rendered': '<p>An excerpt long enough to clear the structural floor, which is sixty characters.</p>\n'},
    'tags': [], 'categories': [], 'featured_media': 0, '_embedded': {}, 'tagNames': [],
})
json.dump(out, open('src/server/services/sources/__fixtures__/doorofperception.json','w'), indent=2, ensure_ascii=False)
print(len(out), 'rows;', [r['slug'] for r in out])
PY
```

Expected: `3 rows; ['the-geologic-atlas-of-the-moon', 'dop-explore', 'no-featured-image']` (or whatever the two newest posts are — the tests below key on the geologic-atlas slug, which is the newest as of 08-25-26; if it has been pushed off page 1, fetch `?slug=the-geologic-atlas-of-the-moon` instead and merge it in).

- [ ] **Step 4: Write the failing adapter tests**

`doorofperception.test.ts`:

```ts
// Fixture tests for the first corpus-walk adapter — see __fixtures__/doorofperception.json,
// recorded 08-25-26 from doorofperception.com's WordPress REST API (two real posts, plus one
// synthetic post with no featured image, the 1-in-390 case).
//
// What is pinned here is D5 (docs/PHASE6_DESIGN_6.3.md §3): a blog item is an image item carrying
// the blog's own excerpt as `summary` and NOTHING in `body` — and the two adapter-supplied
// constants, attribution and license, come from the registry rather than the wire.
//
// No walk() test, consistent with every other adapter: I/O is not the unit-test surface. The
// cursor arithmetic is pure and tested separately below.
import { describe, expect, it } from "vitest";

import { BLOG_LICENSE } from "~/server/config/blogs";
import fixtures from "./__fixtures__/doorofperception.json";
import { doorofperception, nextCursor, type DopRaw } from "./doorofperception";

const raws = fixtures as unknown as DopRaw[];
const bySlug = (slug: string) => {
  const found = raws.find((r) => r.slug === slug);
  if (!found) throw new Error(`fixture missing: ${slug}`);
  return found;
};

describe("doorofperception.toItem", () => {
  it("maps a post to an image item with the excerpt as summary and body null", () => {
    const item = doorofperception.toItem(bySlug("the-geologic-atlas-of-the-moon"));
    expect(item.source).toBe("doorofperception");
    expect(item.sourceId).toBe("the-geologic-atlas-of-the-moon");
    expect(item.type).toBe("image");
    // `<br>` in the rendered title becomes a space; no HTML survives.
    expect(item.title).toBe("The Geologic Atlas of the Moon");
    expect(item.summary).toBe(
      "The Geologic Atlas of the Moon looks like abstract painting, but only as a byproduct of " +
        "classifying the lunar surface into type and age. The palette exists so that four " +
        "billion years can be told apart at a glance.",
    );
    expect(item.body).toBeNull();
    expect(item.imageUrl).toMatch(
      /^https:\/\/doorofperception\.com\/wp-content\/uploads\/.+Featured.*\.jpg$/,
    );
    expect(item.sourceUrl).toBe(
      "https://doorofperception.com/2026/08/the-geologic-atlas-of-the-moon/",
    );
    expect(item.attribution).toBe("Door of Perception");
    expect(item.license).toBe(BLOG_LICENSE);
    expect(item.tags.length).toBeGreaterThan(0);
    for (const t of item.tags) expect(t).toBe(t.trim().toLowerCase());
  });

  it("never lets HTML through in title or summary, on any fixture row", () => {
    for (const raw of raws) {
      if (!raw.featured_media) continue;
      const item = doorofperception.toItem(raw);
      expect(item.title).not.toMatch(/<[^>]+>|&[#a-z0-9]+;/i);
      expect(item.summary).not.toMatch(/<[^>]+>|&[#a-z0-9]+;/i);
      expect(item.body).toBeNull();
    }
  });

  it("throws on a post with no featured image — counted as an error, never silently skipped", () => {
    expect(() => doorofperception.toItem(bySlug("no-featured-image"))).toThrow(
      /no featured image/,
    );
  });
});

describe("nextCursor", () => {
  it("advances while pages remain and is undefined on the last page", () => {
    expect(nextCursor(1, 4)).toBe("2");
    expect(nextCursor(3, 4)).toBe("4");
    expect(nextCursor(4, 4)).toBeUndefined();
    expect(nextCursor(1, 1)).toBeUndefined();
  });
});
```

Run: `bun run test src/server/services/sources/doorofperception.test.ts` → FAIL (stub throws; `nextCursor` missing).

- [ ] **Step 5: Implement the walker** (replaces the T1 stub in full)

```ts
// The first corpus-walk adapter (Phase 6.3, docs/PHASE6_DESIGN_6.3.md §5) and the first blog:
// doorofperception.com, over its WordPress REST API. No HTML is scraped — WordPress publishes
// posts as JSON, with a written excerpt and a named featured image per post, so the whole walk
// is four requests at 100 posts a page (390 posts as of 08-25-26).
//
// **What one item is.** One POST → one `image` item: the post's featured image, the post's own
// excerpt as `summary`, and `body` ALWAYS null (D5). The other ~28 images a post carries never
// become items (D1) — one post, one card, one link out, which is the link-preview shape the rights
// posture describes. The blog is credited by the registry's label and linked at the permalink.
//
// **Facts this was built on (verified 08-25-26):** `_embed=wp:featuredmedia` returns the hero's
// URL in the posts call, so nothing hits /media per post; `x-wp-totalpages` is on every response,
// so the walk knows its own length; featured images are the blog's ~800px "Featured" crop (fine
// for tile and hero); `title.rendered` carries `<br>` and entities, `excerpt.rendered` a `<p>`
// wrapper — both go through htmlToText(). One post in 390 has no featured image: toItem throws,
// and ingest's per-item error path counts it, so the number is visible rather than "offered: 0".
//
// **Etiquette.** robots.txt is checked at the start of every walk (robots.ts), requests are
// 500ms apart, and a 401/403 ends the walk on the first response (fetchJson's noRetryOn).
import { blogConfig } from "~/server/config/blogs";
import { fetchJsonResponse } from "./http";
import { htmlToText, uniqueTags } from "./normalize";
import { assertCrawlAllowed } from "./robots";
import type { CorpusWalkAdapter, FetchOpts, NormalizedItem, WalkPage } from "./types";

const BLOG = blogConfig("doorofperception")!;
const PER_PAGE = 100;
const DELAY_MS = 500;

/** One post from /wp/v2/posts?_embed=wp:featuredmedia — the fields toItem reads, nothing more. */
export interface WpPostRaw {
  id: number;
  slug: string;
  link: string;
  date: string;
  title: { rendered: string };
  excerpt: { rendered: string };
  tags: number[];
  categories: number[];
  /** 0 when the post has no featured image. */
  featured_media: number;
  _embedded?: {
    "wp:featuredmedia"?: {
      source_url?: string;
      media_details?: { width?: number; height?: number };
    }[];
  };
}

/** What walk() actually returns: the post plus its tag ids resolved to names, so that toItem()
 *  stays a pure, synchronous projection (the fixture is recorded in this shape). */
export interface DopRaw extends WpPostRaw {
  tagNames: string[];
}

/** Pure: the cursor for the page after `page`, or undefined when `page` was the last. */
export function nextCursor(page: number, totalPages: number): string | undefined {
  return page < totalPages ? String(page + 1) : undefined;
}

// Tag names, resolved once per process. WordPress exposes tags as numeric ids on a post and names
// on a separate endpoint; ~200 tags is a page or two, fetched on the first walk() call and reused
// for every page after. A missing name (a tag deleted mid-walk) simply drops off the item.
let tagNamesPromise: Promise<Map<number, string>> | null = null;
async function tagNames(): Promise<Map<number, string>> {
  tagNamesPromise ??= (async () => {
    const names = new Map<number, string>();
    for (let page = 1; ; page++) {
      const { data, headers } = await fetchJsonResponse(
        `${BLOG.baseUrl}/wp-json/wp/v2/tags?per_page=100&page=${page}&_fields=id,name`,
        { delayMs: DELAY_MS, noRetryOn: [401, 403] },
      );
      for (const t of data as { id: number; name: string }[]) {
        names.set(t.id, htmlToText(t.name));
      }
      if (!nextCursor(page, Number(headers.get("x-wp-totalpages") ?? "1"))) break;
    }
    return names;
  })();
  return tagNamesPromise;
}

async function walk(cursor?: string, opts?: FetchOpts): Promise<WalkPage<DopRaw>> {
  const page = cursor === undefined ? 1 : Number(cursor);
  if (!Number.isInteger(page) || page < 1) {
    throw new Error(`doorofperception: bad cursor "${cursor}"`);
  }
  // Page 1 is the start of a walk: check the policy file before anything else.
  if (page === 1) await assertCrawlAllowed(BLOG.baseUrl);

  // `limit` bounds this page's size so `--quota N` can do a cheap structural check without
  // pulling 100 posts. No `_fields=` here: it would strip `_embedded`, which is the whole reason
  // for `_embed` (verified 08-25-26 — the filtered form returns an empty embed).
  const perPage = Math.min(PER_PAGE, opts?.limit ?? PER_PAGE);
  const url =
    `${BLOG.baseUrl}/wp-json/wp/v2/posts?per_page=${perPage}&page=${page}` +
    `&_embed=wp:featuredmedia`;
  const { data, headers } = await fetchJsonResponse(url, {
    delayMs: DELAY_MS,
    noRetryOn: [401, 403],
  });
  const posts = data as WpPostRaw[];
  const names = await tagNames();

  return {
    raw: posts.map((p) => ({
      ...p,
      tagNames: p.tags.map((id) => names.get(id)).filter((n): n is string => Boolean(n)),
    })),
    next: nextCursor(page, Number(headers.get("x-wp-totalpages") ?? "1")),
  };
}

function toItem(raw: DopRaw): NormalizedItem {
  const hero = raw._embedded?.["wp:featuredmedia"]?.[0]?.source_url;
  if (!raw.featured_media || !hero) {
    // Thrown, not null: ingest counts a toItem failure per item and prints it. A post with no
    // picture is not a link card, and a silent skip would hide the count (1 of 390 today).
    throw new Error(`doorofperception: post "${raw.slug}" has no featured image`);
  }
  return {
    source: "doorofperception",
    // The slug, not the numeric id: stable across edits, readable in the DB, and what the
    // permalink is built from. (source, sourceId) is the idempotency key, so this choice is
    // permanent for the corpus.
    sourceId: raw.slug,
    type: "image",
    title: htmlToText(raw.title.rendered),
    // The blog's own excerpt IS the blurb (D5). A short one is floored by structuralFloor's
    // thin-summary rule like any museum stub — 3 of 390 as of 08-25-26 — never padded here.
    summary: htmlToText(raw.excerpt.rendered),
    // Always null for a blog item. Not "the excerpt again", not the post body. This is the
    // invariant source-invariants.test.ts asserts and the reason blog items can never reach the
    // reader view.
    body: null,
    imageUrl: hero,
    sourceUrl: raw.link,
    attribution: BLOG.label,
    license: BLOG.license,
    tags: uniqueTags(raw.tagNames.map((t) => t.toLowerCase())),
  };
}

export const doorofperception: CorpusWalkAdapter<DopRaw> = {
  source: "doorofperception",
  walk,
  toItem,
};
```

- [ ] **Step 6: The walk probe**

`scripts/probe-walk.ts`:

```ts
#!/usr/bin/env bun
/**
 * Dev CLI for eyeballing a corpus-walk adapter against the live source — the walk-shaped twin of
 * `bun run probe` (scripts/probe-adapter.ts), which is search-shaped and refuses walkers.
 *
 *   bun run probe:walk doorofperception              # page 1, up to 10 posts
 *   bun run probe:walk doorofperception --limit 3
 *   bun run probe:walk doorofperception --cursor 4   # a later page
 */
import { walkers } from "~/server/services/sources";
import type { WalkSourceId } from "~/server/config/topics";

const known = Object.keys(walkers) as WalkSourceId[];
const [source, ...rest] = process.argv.slice(2);
const flag = (name: string) => {
  const i = rest.indexOf(`--${name}`);
  return i > -1 ? rest[i + 1] : undefined;
};
const limit = Number(flag("limit") ?? 10);
const cursor = flag("cursor");

if (!source || !known.includes(source as WalkSourceId)) {
  console.error(`usage: bun run probe:walk <source> [--limit N] [--cursor C]`);
  console.error(`known walk sources: ${known.join(", ")}`);
  process.exit(1);
}
const walker = walkers[source as WalkSourceId];

console.log(`Walking ${source} from cursor ${cursor ?? "(start)"} (limit ${limit})…\n`);
const t0 = performance.now();
const page = await walker.walk(cursor, { limit });
const elapsed = ((performance.now() - t0) / 1000).toFixed(1);

for (const raw of page.raw) {
  try {
    const it = walker.toItem(raw);
    console.log(
      `${it.title.slice(0, 48).padEnd(50)} img:${it.imageUrl ? "y" : "n"}  ` +
        `sum:${String(it.summary.length).padStart(3)}ch  tags:${it.tags.length}  ${it.sourceUrl}`,
    );
  } catch (err) {
    console.log(`  ✗ toItem: ${String(err)}`);
  }
}
console.log(`\n${page.raw.length} raw · next cursor: ${page.next ?? "(end)"} · ${elapsed}s`);
```

Add to `package.json` scripts: `"probe:walk": "bun run scripts/probe-walk.ts",`.

- [ ] **Step 7: Verify — unit, then live**

Run: `bun run test src/server/services/sources/ && bun run typecheck && bun run lint` → green.
Run: `bun run probe:walk doorofperception --limit 5` → 5 lines, every `img:y` except the rare no-featured post (which prints `✗ toItem`), summaries mostly 90–290 chars, `next cursor: 2`.
Run: `bun run probe:walk doorofperception --cursor 4` → `next cursor: (end)` (390 posts at 100/page → page 4 is last; if the blog has posted since, the last page moves — that's fine).

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat(sources): doorofperception corpus-walk adapter, robots check, probe:walk"
```

---

### T5 — Curator classify mode

**Files:**
- Modify: `src/server/services/curator.ts`, `src/server/services/curator.test.ts`

**Interfaces:**
- Consumes: `TOPICS` from `~/server/config/topics`.
- Produces: `CLASSIFY_PROMPT`, `TOPIC_IDS: ReadonlySet<string>`; `parseCuratorResponse(content, opts?: { topicIds?: ReadonlySet<string> }) → { score; tags; topicId: string | null }`; `curateItems(items, { classify?: boolean, … })`; `CuratedItem` gains `topicId: string | null`.

- [ ] **Step 1: Write the failing tests**

In `curator.test.ts`, first update the existing `parseCuratorResponse` expectations that use `toEqual` on the whole result to include `topicId: null` (there are two or three — run the suite after Step 3 and fix each that fails on the missing key). Then add:

```ts
describe("CLASSIFY_PROMPT", () => {
  it("is the curator rubric plus a topic block and a topic-aware reply line", () => {
    const rubric = CURATOR_PROMPT.slice(0, CURATOR_PROMPT.lastIndexOf("Reply with ONLY"));
    expect(CLASSIFY_PROMPT.startsWith(rubric)).toBe(true);
    for (const id of TOPIC_IDS) expect(CLASSIFY_PROMPT).toContain(`  ${id} —`);
    expect(CLASSIFY_PROMPT).toMatch(/"topic": <topic id or null>}$/);
    // The product artifact is untouched: it still ends with its original reply line.
    expect(CURATOR_PROMPT).toMatch(/\{"score": <1-10>, "tags": \["\.\.\.", "\.\.\."\]\}$/);
  });
});

describe("parseCuratorResponse — classify mode", () => {
  const ids = new Set(["botany", "zoology"]);

  it("returns a known topic id", () => {
    expect(
      parseCuratorResponse('{"score": 8, "tags": ["a"], "topic": "botany"}', { topicIds: ids }),
    ).toEqual({ score: 8, tags: ["a"], topicId: "botany" });
  });

  it("turns an invented topic id into null — never a foreign-key error 300 items in", () => {
    expect(
      parseCuratorResponse('{"score": 8, "tags": [], "topic": "psychedelia"}', { topicIds: ids })
        .topicId,
    ).toBeNull();
  });

  it("returns null for an explicit null, a missing field, and outside classify mode", () => {
    expect(parseCuratorResponse('{"score": 8, "tags": [], "topic": null}', { topicIds: ids }).topicId).toBeNull();
    expect(parseCuratorResponse('{"score": 8, "tags": []}', { topicIds: ids }).topicId).toBeNull();
    expect(parseCuratorResponse('{"score": 8, "tags": [], "topic": "botany"}').topicId).toBeNull();
  });
});

describe("curateItems classify mode", () => {
  let bodies: { model: string; messages: { role: string; content: unknown }[] }[];
  beforeEach(() => {
    bodies = [];
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubGlobal("fetch", (input: string | URL, init?: { body?: string }) => {
      if (String(input).includes("openrouter.ai")) {
        bodies.push(JSON.parse(init?.body ?? "{}"));
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              choices: [{ message: { content: '{"score": 7, "tags": ["a"], "topic": "botany"}' } }],
              usage: { total_tokens: 1 },
            }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sends CLASSIFY_PROMPT and returns the topic when classify is on", async () => {
    const [out] = await curateItems([makeItem({ sourceId: `classify-${Date.now()}` })], {
      classify: true,
      force: true,
    });
    expect(out?.topicId).toBe("botany");
    expect(bodies[0]?.messages[0]?.content).toBe(CLASSIFY_PROMPT);
  });

  it("sends CURATOR_PROMPT and ignores any topic when classify is off", async () => {
    const [out] = await curateItems([makeItem({ sourceId: `score-${Date.now()}` })], {
      force: true,
    });
    expect(out?.topicId).toBeNull();
    expect(bodies[0]?.messages[0]?.content).toBe(CURATOR_PROMPT);
  });
});
```

Extend the file's import to `import { CLASSIFY_PROMPT, CURATOR_PROMPT, curateItems, parseCuratorResponse, structuralFloor, TOPIC_IDS } from "./curator";`. Note `force: true` bypasses the on-disk cache so the stubbed fetch is actually hit.

Run: `bun run test src/server/services/curator.test.ts` → FAIL.

- [ ] **Step 2: Implement**

In `curator.ts`:

(a) Add `import { TOPICS } from "~/server/config/topics";` with the other imports.

(b) After `CURATOR_PROMPT`, add:

```ts
/** The sixteen ids the classify mode may answer with. Built from config so a topic added to
 *  TOPICS is automatically a legal answer, and anything else the model says is not. */
export const TOPIC_IDS: ReadonlySet<string> = new Set(TOPICS.map((t) => t.id));

/**
 * Phase 6.3's classify mode: the SAME rubric with a topic block appended. Used only for
 * corpus-walk items (blogs), which arrive with no topic because no seed query surfaced them; the
 * museum path never sees this prompt, so its scores and cache are untouched. Built by slicing
 * rather than editing CURATOR_PROMPT, because that string is a product artifact.
 *
 * "or null" is the important clause (D4): a post with no honest home among the sixteen is
 * dropped by ingest, never force-fitted — topic_id is the feed's unit of drift, and a psychedelia
 * post filed under botany teaches the drift graph something false.
 */
export const CLASSIFY_PROMPT =
  CURATOR_PROMPT.slice(0, CURATOR_PROMPT.lastIndexOf("Reply with ONLY")) +
  `Also file this item under exactly ONE of these topics — the one a reader who chose that topic would be glad to find it in — or null if none is an honest home. Never force a fit.
${TOPICS.map((t) => `  ${t.id} — ${t.label}`).join("\n")}

Reply with ONLY a JSON object: {"score": <1-10>, "tags": ["...", "..."], "topic": <topic id or null>}`;
```

(c) `CuratedItem`:

```ts
export type CuratedItem = NormalizedItem & {
  curationScore: number;
  aestheticTags: string[];
  /** Phase 6.3: the classify mode's answer for corpus-walk items; always null outside it. Ingest
   *  drops a walk item whose topicId is null and counts it. Search-shaped items ignore this field
   *  — their topic comes from the seed query that surfaced them. */
  topicId: string | null;
};
```

(d) `parseCuratorResponse` — new signature and tail:

```ts
export function parseCuratorResponse(
  content: string,
  opts?: { topicIds?: ReadonlySet<string> },
): {
  score: number;
  tags: string[];
  topicId: string | null;
} {
  … (existing body unchanged through the `tags` computation) …

  // Only meaningful in classify mode, and even then only a KNOWN id passes — the model is
  // capable of inventing "psychedelia", and a foreign-key error deep into an ingest run is the
  // worst place to learn that. Anything else is the honest reject: null.
  const topicId =
    opts?.topicIds && typeof record.topic === "string" && opts.topicIds.has(record.topic)
      ? record.topic
      : null;

  return { score, tags, topicId };
}
```

(e) `cacheKey` — add the mode WITHOUT changing the default key:

```ts
function cacheKey(item: NormalizedItem, classify: boolean): string {
  // The default-mode key is byte-identical to Phase 3's so no museum item is ever re-billed;
  // classify mode gets its own namespace because its answer has one more field.
  const mode = classify ? "classify|" : "";
  return createHash("sha256")
    .update(`${CURATOR_MODEL}|v${PROMPT_VERSION}|${mode}${item.source}:${item.sourceId}`)
    .digest("hex")
    .slice(0, 32);
}
```

(f) `scoreItem(item, opts: { force?: boolean; classify?: boolean })`:
- `const cacheFile = path.join(CACHE_DIR, \`${cacheKey(item, opts.classify ?? false)}.json\`);`
- cached read: type is `{ score: number; tags: string[]; topicId?: string | null }` and the return becomes `return { score: cached.score, tags: cached.tags, topicId: cached.topicId ?? null, tokens: 0, imageFetchFailed: false };`
- return type gains `topicId: string | null`.
- `messages: [{ role: "system", content: opts.classify ? CLASSIFY_PROMPT : CURATOR_PROMPT }, …]`
- `const result = parseCuratorResponse(…, opts.classify ? { topicIds: TOPIC_IDS } : undefined);`

(g) `curateItems` — option `classify?: boolean`, pass it to `scoreItem`, and:
- success: `out[i] = { ...item, curationScore: score, aestheticTags: tags, topicId };` (destructure `topicId` from the `scoreItem` result)
- failure: `out[i] = { ...item, curationScore: 5, aestheticTags: [], topicId: null };`
- doc comment: add *"`opts.classify` (Phase 6.3) switches to CLASSIFY_PROMPT and fills `topicId`; used by ingest's walk lane only."*

- [ ] **Step 3: Verify**

Run: `bun run test src/server/services/curator.test.ts` → PASS (fix the pre-existing `toEqual` expectations by adding `topicId: null`). Then `bun run test && bun run typecheck && bun run lint`. `scripts/ingest.ts` and `scripts/recurate.ts` construct `CuratedItem`s for `--skip-llm` — add `topicId: null` to those literals (typecheck will point at each).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(curator): classify mode — topic-or-null for corpus-walk items, own cache namespace"
```

---

### T6 — Ingest: the walk lane, `--prune`, and the summary

**Files:**
- Modify: `src/server/services/ingest-plan.ts`, `src/server/services/ingest-plan.test.ts`
- Modify: `scripts/ingest.ts`

**Interfaces:**
- Consumes: `walkers`, `CorpusWalkAdapter` (T1); `curateItems(…, { classify })`, `CuratedItem.topicId` (T5).
- Produces: `topicHistogram(items)`, `planPrune(args)`; CLI flags `--prune`; walk stats in the summary.

- [ ] **Step 1: Write the failing pure-function tests**

Append to `ingest-plan.test.ts`:

```ts
describe("topicHistogram", () => {
  it("counts classified items per topic and the null bucket separately", () => {
    const h = topicHistogram([
      { topicId: "botany" },
      { topicId: "botany" },
      { topicId: "zoology" },
      { topicId: null },
    ]);
    expect(h.byTopic).toEqual({ botany: 2, zoology: 1 });
    expect(h.noTopic).toBe(1);
  });
});

describe("planPrune", () => {
  // Phase 6.3's remove-on-request path: rows in the DB for a walk source that a COMPLETE walk did
  // not see are the posts the blog has removed. The function only decides; ingest deletes, and
  // only under --prune.
  it("names the DB rows of this source that the walk did not see", () => {
    const existingKeys = new Set(["doorofperception:a", "doorofperception:b", "met:x"]);
    expect(
      planPrune({ source: "doorofperception", seenSourceIds: ["a"], existingKeys }),
    ).toEqual(["b"]);
  });

  it("never names another source's rows", () => {
    const existingKeys = new Set(["met:x", "loc:y"]);
    expect(planPrune({ source: "doorofperception", seenSourceIds: [], existingKeys })).toEqual([]);
  });
});
```

and extend the import: `import { planPrune, resolveCollisions, topicHistogram } from "./ingest-plan";`.

Run: `bun run test src/server/services/ingest-plan.test.ts` → FAIL.

- [ ] **Step 2: Implement the pure functions**

Append to `ingest-plan.ts`:

```ts
// ── Phase 6.3: the walk lane's two pure decisions ───────────────────────────────────────────

/** The per-topic yield of a classified batch, with the honest-reject bucket kept separate. This
 *  is D4's measurement (docs/PHASE6_DESIGN_6.3.md §6): `--dry-run` on a walker prints it, and the
 *  first executable step of 6.3 was to read it before writing a row. */
export function topicHistogram(items: { topicId: string | null }[]): {
  byTopic: Record<string, number>;
  noTopic: number;
} {
  const byTopic: Record<string, number> = {};
  let noTopic = 0;
  for (const it of items) {
    if (it.topicId === null) noTopic++;
    else byTopic[it.topicId] = (byTopic[it.topicId] ?? 0) + 1;
  }
  return { byTopic, noTopic };
}

/**
 * Which of `source`'s rows in the DB did a complete walk NOT see? Those are posts the blog has
 * removed — the remove-on-request case. Pure: the caller guarantees the walk was complete (no
 * --quota, zero errors) before trusting the answer, and deletes only under --prune.
 * `existingKeys` is ingest's `${source}:${sourceId}` set, already loaded for the skip step.
 */
export function planPrune(args: {
  source: string;
  seenSourceIds: Iterable<string>;
  existingKeys: ReadonlySet<string>;
}): string[] {
  const seen = new Set(args.seenSourceIds);
  const prefix = `${args.source}:`;
  const gone: string[] = [];
  for (const key of args.existingKeys) {
    if (!key.startsWith(prefix)) continue;
    const sourceId = key.slice(prefix.length);
    if (!seen.has(sourceId)) gone.push(sourceId);
  }
  return gone.sort();
}
```

Run the test → PASS.

- [ ] **Step 3: The walk lane in `scripts/ingest.ts`**

(a) Header usage block — add:

```
 *   bun run ingest --source doorofperception --dry-run   # walk + classify, print the topic
 *                                                         # histogram, write nothing (bills)
 *   bun run ingest --source doorofperception --prune     # also delete rows for posts the blog
 *                                                         # has removed (complete walks only)
```

and, in the story list, a new point after 3:

```
 *   3b. (Phase 6.3) Corpus-WALK sources — blogs — have no seed cells and no topics yet. Each is
 *       walked to exhaustion (processWalker), its items skip collision resolution (nothing to
 *       collide on), and they join the search winners at step 4 below. Their topic comes from the
 *       curator's classify mode; a null topic is dropped and counted, never force-fitted.
```

(b) Imports: `import { planPrune, resolveCollisions, topicHistogram } from "~/server/services/ingest-plan";`, `import { adapters, ALL_SOURCE_IDS, walkers } from "~/server/services/sources";`, `import type { NormalizedItem, SearchSourceId, SourceId, WalkPage } from "~/server/services/sources";`, `import type { WalkSourceId } from "~/server/config/topics";`, and `import { item, savedItem, seenItem, topic } from "~/server/db/schema";`, `import { and, eq, inArray } from "drizzle-orm";`.

(c) Flags — after `const dryRun = …`:

```ts
// Phase 6.3: delete rows of a walk source that a COMPLETE walk did not see (planPrune). Never
// the default: deletion is the one thing an ingest run must not do by accident.
const prune = args.includes("--prune");
```

and `--topic` on a walker says so: after the `sourceIds` computation in `main()`, add

```ts
  if (topicFlag && sourceFlag && sourceFlag in walkers) {
    console.log(`note: --topic does not apply to "${sourceFlag}" — walk sources have no seed cells; walking everything.\n`);
  }
```

(d) After `processSource`, add the walk lane:

```ts
// ── Phase 6.3: per-walker walk + normalize ───────────────────────────────────

interface WalkRunStats {
  walked: number; // walk() pages attempted
  offered: number; // raws normalized into items
  errors: number; // failed pages or toItem throws — never folded into "offered: 0"
  /** Every sourceId the walk saw, normalized or not — planPrune's input. */
  seenSourceIds: string[];
  /** True iff the walk reached the end with no errors and no --quota bound: only then may the
   *  absence of a row mean the post is gone. */
  complete: boolean;
  items: NormalizedItem[];
}

/**
 * Walk one corpus-walk source to exhaustion (or to `quotaItems` under --quota). Sequential by
 * construction — one host, one cursor — and the adapter owns its own politeness delay. A failed
 * page is an error and stops the walk (a cursor past a failure is not something we can trust),
 * which also marks the run incomplete so --prune cannot act on it.
 */
async function processWalker(
  sourceId: WalkSourceId,
  quotaItems: number | undefined,
): Promise<WalkRunStats> {
  const walker = walkers[sourceId];
  const stats: WalkRunStats = {
    walked: 0,
    offered: 0,
    errors: 0,
    seenSourceIds: [],
    complete: false,
    items: [],
  };
  let cursor: string | undefined;
  let reachedEnd = false;
  do {
    stats.walked++;
    let page: WalkPage<unknown>;
    try {
      page = await walker.walk(cursor, quotaItems ? { limit: quotaItems - stats.offered } : undefined);
    } catch (err) {
      stats.errors++;
      console.warn(`  ${sourceId}: walk FAILED at cursor ${cursor ?? "(start)"} — ${String(err)}`);
      break;
    }
    for (const raw of page.raw) {
      try {
        const normalized = walker.toItem(raw);
        stats.seenSourceIds.push(normalized.sourceId);
        stats.items.push(normalized);
        stats.offered++;
      } catch (err) {
        stats.errors++;
        console.warn(`  ${sourceId}: toItem failed — ${String(err)}`);
      }
      if (quotaItems && stats.offered >= quotaItems) break;
    }
    cursor = page.next;
    reachedEnd = cursor === undefined;
  } while (cursor !== undefined && !(quotaItems && stats.offered >= quotaItems));

  stats.complete = reachedEnd && stats.errors === 0 && quotaItems === undefined;
  return stats;
}
```

Note the `--quota` semantics for walkers: the flag's value is read as a *total item* bound for a walk source (not per cell). In `main()`, derive it: `const walkQuota = args.includes("--quota") ? quota : undefined;`.

(d′) `processSource`'s first parameter becomes `sourceId: SearchSourceId` — `adapters` is now keyed by that narrower type, and typecheck will say so.

(e) In `main()` — split `sourceIds` into the two lanes right after it is computed:

```ts
  const searchIds = sourceIds.filter((id) => id in adapters) as (keyof typeof adapters)[];
  const walkIds = sourceIds.filter((id) => id in walkers) as WalkSourceId[];
  const walkQuota = args.includes("--quota") ? quota : undefined;
```

Change the "Ingesting …" log line to `Ingesting ${topics.length} topic(s) × ${searchIds.length} search source(s) + ${walkIds.length} walk source(s), quota ${quota}/cell…`.

Step 1 becomes: search sources exactly as before but over `searchIds`; and in the same `Promise.allSettled`, walkers:

```ts
  const [searchResults, walkResults] = await Promise.all([
    Promise.allSettled(searchIds.map((id) => processSource(id, topics, quota))),
    Promise.allSettled(walkIds.map((id) => processWalker(id, walkQuota))),
  ]);
```

(rename the existing `results` → `searchResults` in the loop that follows, iterating `searchIds`). Then collect the walk lane:

```ts
  const walkStatsBySource = new Map<WalkSourceId, WalkRunStats>();
  const walkItems: NormalizedItem[] = [];
  for (const [i, result] of walkResults.entries()) {
    const sourceId = walkIds[i]!;
    if (result.status === "fulfilled") {
      walkStatsBySource.set(sourceId, result.value);
      walkItems.push(...result.value.items);
    } else {
      console.warn(`  ${sourceId}: WALK FAILED ENTIRELY — ${String(result.reason)}`);
      walkStatsBySource.set(sourceId, { walked: 0, offered: 0, errors: 1, seenSourceIds: [], complete: false, items: [] });
    }
  }
```

(f) Step 3 (skip) — after `newWinners`/`alreadyInDb`, add the walk items to the same skip:

```ts
  const newWalkItems = walkItems.filter((it) => !existingKeys.has(`${it.source}:${it.sourceId}`));
  const alreadyInDbWalk = walkItems.length - newWalkItems.length;
```

and fold the count: `alreadyInDb: alreadyInDb + alreadyInDbWalk` in `printSummary`'s args.

(g) Step 4 (floor) — floor both together so dup-title is batch-wide, then split:

```ts
  const { kept, dropped } = structuralFloor([...newWinners.map((w) => w.item), ...newWalkItems]);
  const keptSearch = kept.filter((it) => winnerByKey.has(`${it.source}:${it.sourceId}`));
  const keptWalk = kept.filter((it) => !winnerByKey.has(`${it.source}:${it.sourceId}`));
```

(h) Step 5 (curate) — two calls, one per lane. Factor the existing options object into a `curateOpts` const:

```ts
  const curateOpts = {
    onProgress: (done: number, total: number) => {
      const pct = Math.floor((done / total) * 100);
      if (pct !== lastPrintedPct && (pct % 10 === 0 || done === total)) {
        lastPrintedPct = pct;
        console.log(`  curating: ${done}/${total} (${pct}%)`);
      }
    },
    onImageFetchFailure: (it: NormalizedItem) => {
      imageFetchFailures[it.source] = (imageFetchFailures[it.source] ?? 0) + 1;
    },
  };
  const curatedSearch: CuratedItem[] = skipLlm
    ? keptSearch.map((it): CuratedItem => ({ ...it, curationScore: 5, aestheticTags: [], topicId: null }))
    : await curateItems(keptSearch, curateOpts);
  // Walk items get the classify mode. Under --skip-llm they cannot be classified at all, so every
  // one is a null-topic drop: a structural check of the walk, nothing more — and the summary says so.
  const curatedWalk: CuratedItem[] = skipLlm
    ? keptWalk.map((it): CuratedItem => ({ ...it, curationScore: 5, aestheticTags: [], topicId: null }))
    : await curateItems(keptWalk, { ...curateOpts, classify: true });
  const histogram = topicHistogram(curatedWalk);
```

(i) Step 6 (upsert) — the search loop as before over `curatedSearch`; then:

```ts
  // Walk items: the classified topic, or the honest reject.
  let noTopic = 0;
  for (const curatedItem of curatedWalk) {
    if (curatedItem.topicId === null) {
      noTopic++;
      continue;
    }
    if (!dryRun) await upsertItem({ ...curatedItem, topicId: curatedItem.topicId });
    inserted++;
    insertedByTopic.set(curatedItem.topicId, (insertedByTopic.get(curatedItem.topicId) ?? 0) + 1);
  }
```

(j) Prune — after the upsert loops, before `printSummary`:

```ts
  // Phase 6.3: --prune. Only a COMPLETE walk may say a row is gone; and even then only delete
  // when asked. Children first — seen_item and saved_item both carry a foreign key onto item.
  const pruned: Record<string, number> = {};
  for (const [sourceId, ws] of walkStatsBySource) {
    const gone = ws.complete
      ? planPrune({ source: sourceId, seenSourceIds: ws.seenSourceIds, existingKeys })
      : [];
    if (gone.length === 0) continue;
    console.log(`\n${sourceId}: ${gone.length} row(s) in the DB were not seen by this complete walk:`);
    for (const id of gone) console.log(`  ${id}`);
    if (!prune || dryRun) {
      console.log(`  (not deleted — ${dryRun ? "--dry-run" : "pass --prune to delete"})`);
      continue;
    }
    await db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: item.id })
        .from(item)
        .where(and(eq(item.source, sourceId), inArray(item.sourceId, gone)));
      const ids = rows.map((r) => r.id);
      if (ids.length === 0) return;
      await tx.delete(seenItem).where(inArray(seenItem.itemId, ids));
      await tx.delete(savedItem).where(inArray(savedItem.itemId, ids));
      await tx.delete(item).where(inArray(item.id, ids));
      pruned[sourceId] = ids.length;
    });
    console.log(`  deleted ${pruned[sourceId] ?? 0}`);
  }
```

(k) Summary — extend `printSummary`'s args type with

```ts
  walkStatsBySource: Map<WalkSourceId, WalkRunStats>;
  histogram: { byTopic: Record<string, number>; noTopic: number };
  noTopic: number;
  pruned: Record<string, number>;
```

pass them from `main()`, and print, after the per-source table:

```ts
  if (walkStatsBySource.size > 0) {
    console.log(`\n${line}\nWalk sources (Phase 6.3)\n${line}`);
    console.log(["source".padEnd(18), "pages".padEnd(8), "offered".padEnd(10), "errors".padEnd(8), "complete"].join(""));
    for (const [id, s] of walkStatsBySource) {
      console.log([id.padEnd(18), String(s.walked).padEnd(8), String(s.offered).padEnd(10), String(s.errors).padEnd(8), s.complete ? "yes" : "no"].join(""));
    }
    console.log(`\nclassification${skipLlm ? " (--skip-llm: nothing can be classified; every walk item is a no-topic drop)" : ""}:`);
    for (const [topicId, n] of Object.entries(histogram.byTopic).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${topicId.padEnd(24)} ${n}`);
    }
    console.log(`  ${"(no honest topic — dropped)".padEnd(24)} ${histogram.noTopic}`);
    for (const [id, n] of Object.entries(pruned)) console.log(`pruned from ${id}: ${n}`);
  }
```

and fold `noTopic` into the "Pipeline totals" block: `no-topic dropped (walk):   ${noTopic}`.

- [ ] **Step 4: Verify the plumbing for free**

Run: `bun run typecheck && bun run lint && bun run test` → green.
Run: `bun run ingest --source doorofperception --quota 8 --dry-run --skip-llm`
Expected: a "Walk sources" table with `pages 1 · offered 8 · errors 0 · complete no`; classification block says `--skip-llm`; `would insert 0`; no prune section (incomplete walk).
Run: `bun run ingest --source met --topic botany --quota 5 --dry-run --skip-llm`
Expected: the museum path is unchanged — same shape of output as before this task, no walk table.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(ingest): corpus-walk lane, classify-or-drop, topic histogram, --prune"
```

---

### T7 — THE MEASUREMENT, then the real ingest

This is D4's gate. It bills (~390 × ~1,500 tokens ≈ $0.60) and writes nothing.

- [ ] **Step 1: The histogram run**

```bash
bun run ingest --source doorofperception --dry-run 2>&1 | tee /tmp/dop-histogram.txt
```

Expected: `pages 4 · offered ~389 · errors 1 (the no-featured post) · complete no` (dry-run is not a complete walk for prune purposes — that's correct); a classification block with per-topic counts and a `(no honest topic — dropped)` line; `structural floor dropped: ~3 (thin-summary)`; `no-image` column 0 for doorofperception (if it is not 0, the hero URLs are failing to fetch — stop and investigate before ingesting; the curator would be scoring blind).

**Record the whole classification block** into `docs/PHASE6_WALKTHROUGH_6.3.md` (create the file now with a heading `## The histogram — all 390 posts, before any write` and paste it). This number is the phase's primary finding whatever it turns out to be. If the yield is under ~30%, **stop and show Ben** before Step 2 — the design anticipated a large null bucket but a very large one is a topic-set question, not an ingest one.

- [ ] **Step 2: The real ingest**

```bash
bun run ingest --source doorofperception 2>&1 | tee /tmp/dop-ingest.txt
```

Expected: `inserted` equals the histogram's classified total (the cache makes this run's LLM cost ≈ $0 — every item was scored in Step 1 under the same classify key). Re-run the same command once more: `already in DB (skipped)` equals the inserted count, `inserted 0`, and a `complete yes` walk with **no** prune section (nothing gone).

- [ ] **Step 3: See it in the feed**

```bash
bun run probe:feed 2>&1 | grep -i doorofperception | head
```

Expected: doorofperception cards appear (the probe prints source per card). Then with the dev server up (`bun run dev`, `FEED_DEBUG` defaults on in development), open `http://localhost:3000/feed`, scroll two pages, and confirm at least one tile whose item page credits `from: Door of Perception`. Note in the walkthrough which topics they appeared under.

- [ ] **Step 4: Commit the walkthrough draft**

```bash
git add docs/PHASE6_WALKTHROUGH_6.3.md && git commit -m "docs: 6.3 walkthrough — the classification histogram and first ingest"
```

---

### T8 — Display: `LinkOutRow`, attribution dedupe, the invariant

**Files:**
- Create: `src/components/item/link-out-row.tsx`, `src/components/item/link-out-row.test.tsx`
- Modify: `src/components/item/image-item-body.tsx`, `src/components/item/item-sections.test.tsx`
- Modify: `src/components/gallery/gallery-details-sheet.tsx`
- Create: `src/server/services/sources/source-invariants.test.ts`

**Interfaces:**
- Consumes: `isBlogSource` (T1), `sourceLabel`, `ChevronRight` icon.
- Produces: `<LinkOutRow source sourceUrl />` — renders `null` for a non-blog source.

- [ ] **Step 1: Write the failing component tests**

`link-out-row.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LinkOutRow } from "./link-out-row";

describe("LinkOutRow", () => {
  it("renders a prominent link to the post for a blog source", () => {
    render(
      <LinkOutRow
        source="doorofperception"
        sourceUrl="https://doorofperception.com/2026/08/the-geologic-atlas-of-the-moon/"
      />,
    );
    const link = screen.getByRole("link", { name: /Read the post on Door of Perception/ });
    expect(link).toHaveAttribute(
      "href",
      "https://doorofperception.com/2026/08/the-geologic-atlas-of-the-moon/",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("renders nothing for a museum source — the credit line is their link-out", () => {
    const { container } = render(
      <LinkOutRow source="met" sourceUrl="https://www.metmuseum.org/art/collection/search/1" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
```

Add to `item-sections.test.tsx`, inside `describe("ImageItemBody's hero", …)` or as a new describe:

```tsx
describe("ImageItemBody — blog items and the maker line", () => {
  it("shows the link-out row and no reader body for a blog item", () => {
    render(
      <ImageItemBody
        item={makeItem({
          type: "image",
          source: "doorofperception",
          title: "The Geologic Atlas of the Moon",
          summary: "The palette exists so that four billion years can be told apart at a glance.",
          imageUrl: "https://example.test/hero.jpg",
          sourceUrl: "https://doorofperception.com/2026/08/the-geologic-atlas-of-the-moon/",
          attribution: "Door of Perception",
          body: null,
        })}
      />,
    );
    expect(screen.getByRole("link", { name: /Read the post on Door of Perception/ })).toBeInTheDocument();
    expect(screen.getByText(/four billion years/)).toBeInTheDocument();
  });

  it("prints the maker line once when attribution merely repeats the source label", () => {
    render(
      <ImageItemBody
        item={makeItem({
          type: "image",
          source: "doorofperception",
          attribution: "Door of Perception",
          imageUrl: "https://example.test/hero.jpg",
          sourceUrl: "https://doorofperception.com/x/",
        })}
      />,
    );
    // Exactly one occurrence of the label: the credit line's link. No duplicate maker line.
    expect(screen.getAllByText(/Door of Perception/)).toHaveLength(2); // credit link + link-out row
    expect(screen.queryByText("Door of Perception", { exact: true, selector: "p" })).toBeNull();
  });

  it("still prints a real maker when the source names one", () => {
    render(
      <ImageItemBody
        item={makeItem({ type: "image", source: "met", attribution: "An engraver", imageUrl: "https://example.test/p.jpg" })}
      />,
    );
    expect(screen.getByText("An engraver")).toBeInTheDocument();
  });
});
```

Run: `bun run test src/components/item/` → FAIL.

- [ ] **Step 2: Implement `LinkOutRow`**

`link-out-row.tsx`:

```tsx
import { ChevronRight } from "~/components/icons";
import { sourceLabel } from "~/lib/source-label";
import { isBlogSource } from "~/server/config/blogs";

// The prominent link-out that makes a blog item read as a link preview rather than a
// republication (Phase 6.3, docs/PHASE6_DESIGN_6.3.md §7). The credit line already links every
// item's source; this row is the blog-specific extra `credit-line.tsx` reserved for 6.3 — the
// call-to-action, full width, under the blurb, on the two surfaces that show item text.
//
// Server-safe on purpose (no hooks, a plain anchor), so `ImageItemBody` stays a server component.
// The gallery sheet, which closes on any tap, stops propagation around it.
//
// No prototype in the handoff shows this element; it borrows the pill's row idiom (a rounded,
// ink-tinted, ≥44px target) rather than inventing a new one.
export interface LinkOutRowProps {
  source: string;
  sourceUrl: string;
  className?: string;
}

export function LinkOutRow({ source, sourceUrl, className }: LinkOutRowProps) {
  if (!isBlogSource(source)) return null;
  return (
    <a
      href={sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={
        "bg-ink/6 text-ink-hi mt-[22px] flex h-12 w-full items-center justify-between " +
        "rounded-[14px] px-[16px] text-[15px] font-semibold transition-transform " +
        "duration-150 active:scale-[0.98] " +
        (className ?? "")
      }
    >
      <span>Read the post on {sourceLabel(source)}</span>
      <ChevronRight className="text-ink/50" />
    </a>
  );
}
```

If `bg-ink/6` is not a valid opacity step in this Tailwind config, use `bg-ink/10` (used elsewhere) — check `git grep "bg-ink/"` for the steps in use. The `onClick` handler makes this a client-interactive element; if Next complains about an event handler in a server component, move the `stopPropagation` to the gallery sheet's wrapper `<div onClick={(e) => e.stopPropagation()}>` around `<LinkOutRow>` and drop it here.

- [ ] **Step 3: Wire it into `ImageItemBody` and dedupe the maker line**

In `image-item-body.tsx`: import `LinkOutRow`; replace the maker `<p>` with:

```tsx
      {/* Whoever the source names as maker — unless that is just the source's own name again, in
          which case the credit line below already says it and saying it twice reads as a bug.
          Phase 6.3 exposed this: a blog's attribution IS the blog. */}
      {maker ? <p className="text-ink/50 mt-[8px] text-[13px]">{maker}</p> : null}
```

with, above the `return`:

```tsx
  const label = sourceLabel(item.source);
  const maker = item.attribution && item.attribution !== label ? item.attribution : null;
```

(This also drops the museum fallback that printed the source label as a maker line — it duplicated the credit line there too.) After the summary `<p>`, add:

```tsx
      <LinkOutRow source={item.source} sourceUrl={item.sourceUrl} />
```

In `gallery-details-sheet.tsx`: import `LinkOutRow`, and after the summary paragraph add `<LinkOutRow source={item.source} sourceUrl={item.sourceUrl} />`. Apply the same `maker` dedupe to its accent subject line: `{item.attribution && item.attribution !== sourceLabel(item.source) ? item.attribution : sourceLabel(item.source)}` — the sheet's subject line keeps *one* of the two, which it already did.

Run: `bun run test src/components/` → PASS. Fix any pre-existing test that asserted the museum maker fallback (search the test files for the source label being expected in a `<p>`; the e2e in T9 asserts the real-maker case still works).

- [ ] **Step 4: The invariant test**

`src/server/services/sources/source-invariants.test.ts`:

```ts
// D5, as something CI refuses (docs/PHASE6_DESIGN_6.3.md §7): a blog item is an image item with
// NO body, always — which is what makes "Ambit never renders blog article text" an invariant
// rather than a policy. Two halves: every registered walker's fixture normalizes that way, and no
// row in the DB says otherwise.
import { and, inArray, isNotNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { WALK_SOURCES } from "~/server/config/topics";
import { walkers } from "./index";
import dopFixtures from "./__fixtures__/doorofperception.json";

const fixturesByWalker: Record<string, unknown[]> = {
  doorofperception: dopFixtures as unknown[],
};

describe("walk-source invariants (unit)", () => {
  it("every registered walker has a fixture here", () => {
    for (const id of Object.keys(walkers)) expect(fixturesByWalker).toHaveProperty(id);
  });

  it("every walker normalizes to type image with body null", () => {
    for (const [id, walker] of Object.entries(walkers)) {
      for (const raw of fixturesByWalker[id] ?? []) {
        let item;
        try {
          item = walker.toItem(raw);
        } catch {
          continue; // a fixture row that toItem rejects (no featured image) is not an item
        }
        expect(item.type, id).toBe("image");
        expect(item.body, id).toBeNull();
      }
    }
  });
});

describe.skipIf(!process.env.DATABASE_URL)("walk-source invariants (integration)", () => {
  it("no blog row in the DB carries a body", async () => {
    const { db } = await import("~/server/db/client");
    const { item } = await import("~/server/db/schema");
    const rows = await db
      .select({ id: item.id })
      .from(item)
      .where(and(inArray(item.source, [...WALK_SOURCES]), isNotNull(item.body)));
    expect(rows).toEqual([]);
  });
});
```

Run: `bun run test src/server/services/sources/source-invariants.test.ts` → PASS (both halves, with the dev DB up).

- [ ] **Step 4b: Prove a blog row is drawable (integration)**

The feed's draw paths are the one place a new `source` value could be silently filtered. In
`src/server/db/feed.integration.test.ts`, change the seeded source list
`["met", ...SUSPENDED_SOURCES]` to `["met", "doorofperception", ...SUSPENDED_SOURCES]`, and in
**both** tests (`getTopicPools …` and `drawFromTopic …`) add, right after `expect(sources).toContain("met");`:

```ts
      // Phase 6.3: a walk-source row is an ordinary row to the draw — nothing filters on source
      // except suspension, and a blog is never suspended by default.
      expect(sources).toContain("doorofperception");
```

Run: `bun run test src/server/db/feed.integration.test.ts` (dev DB up) → PASS. This is the spec's
"a seeded blog item draws in the feed" assertion; the adjacency rule itself is already pinned in
`feed.test.ts` ("avoids adjacent same-source cards") and needs no blog-specific copy.

- [ ] **Step 5: Eyeball, commit**

`bun run dev`; open a doorofperception item page (`/i/<id>` — get an id from `bun run probe:feed`) and its gallery details sheet (`/g/<id>`, tap the title). The row reads *Read the post on Door of Perception* and opens the post in a new tab; no duplicate "Door of Perception" line above the credit.

```bash
git add -A && git commit -m "feat(item): LinkOutRow for blog items; maker-line dedupe; D5 invariant test"
```

---

### T9 — E2E: one blog item, signed out

**Files:**
- Modify: `e2e/item.spec.ts`

- [ ] **Step 1: Seed a blog item** — in the `beforeAll` `values([...])` array add a fifth row and capture its id (`let blogId: string;`):

```ts
        {
          // Phase 6.3: a blog link card. Same `e2e-item-` prefix so afterAll's cleanup finds it;
          // a real blog `source` so the link-out row renders.
          source: "doorofperception",
          sourceId: `e2e-item-blog-${Date.now()}`,
          type: "image" as const,
          title: "A seeded post",
          summary: "The blog's own excerpt, long enough to occupy a couple of lines on the card.",
          body: null,
          imageUrl: PIXEL,
          sourceUrl: "https://doorofperception.com/2026/01/a-seeded-post/",
          attribution: "Door of Perception",
          license: "Rights retained by original authors — displayed with credit and link",
          topicId: "astronomy",
          curationScore: 9,
        },
```

- [ ] **Step 2: The test** — in the incognito block:

```ts
  test("a blog item is a link card: credit, blurb, and a prominent link out — no reader view", async ({
    page,
  }) => {
    await page.goto(`/i/${blogId}`);
    await expect(page.getByRole("heading", { name: "A seeded post", level: 1 })).toBeVisible();
    await expect(page.getByText(/The blog's own excerpt/)).toBeVisible();
    // The credit line and the link-out row both point at the post.
    // `exact`, or Playwright's substring match also catches "Read the post on Door of Perception".
    await expect(page.getByRole("link", { name: "Door of Perception", exact: true })).toHaveAttribute(
      "href",
      "https://doorofperception.com/2026/01/a-seeded-post/",
    );
    const linkOut = page.getByRole("link", { name: /Read the post on Door of Perception/ });
    await expect(linkOut).toBeVisible();
    await expect(linkOut).toHaveAttribute("target", "_blank");
    // No typeset article: the reader body's section headings never render for a blog item.
    await expect(page.getByRole("heading", { level: 2 })).toHaveCount(0);
  });
```

If the page has an `<h2>` from another component (WanderNext's heading, say), scope the last assertion: `page.locator("article").getByRole("heading", { level: 2 })`.

- [ ] **Step 3: Run**

Run: `bun run e2e e2e/item.spec.ts` (dev server must be on :3000). Expected: green, including the pre-existing image-item test (`An engraver, unattributed` still visible — a real maker is not deduped).

```bash
git add -A && git commit -m "test(e2e): blog item renders as a link card with credit and link-out"
```

---

### T10 — Docs in this repo

**Files:** `SPEC.md`, `docs/BUILD_PLAN.md`, `docs/source-candidates.md`, `CLAUDE.md`, `src/server/services/sources/types.ts` (header comment only).

- [ ] **Step 1: `SPEC.md`**

- §5.1 `body` row (line ~130): replace the "proposed extension … undecided" text with: **Settled 08-25-26 (6.3): `body` is `null` for every blog item, always. The blurb is `summary` (the blog's own excerpt). Blog items are `type: "image"`, so the reader view is unreachable for them by construction; `source-invariants.test.ts` asserts it.**
- §6.1: replace the "Planned: a blog adapter family (decided 08-20-26, undesigned)" bullet with a built entry in the style of the 6.2 entries. Cover: the `CorpusWalkAdapter` sibling contract (with the type literal from T1); `WALK_SOURCES`/`blogs.ts`; **`doorofperception`** — WP REST, four requests, `_embed`, slug as `sourceId`, featured image as hero (~800 px crop), excerpt as summary, `body` null, registry label/license, robots check every run, 401/403 not retried; the classify mode and the histogram (paste the recorded numbers from the walkthrough); the etiquette policy (§8 of the design); **50watts cut 08-25-26** and why; what is deliberately out of scope (cache, full-res, topic expansion).
- §6.4: add the walk lane (bypasses collisions, joins at the skip), `--prune` semantics (complete walks only, children-first deletion, never default).
- §15: replace the "Blog adapter family v1 (08-20-26)" open item with a closed note pointing at `docs/PHASE6_DESIGN_6.3.md`; in the `tile.loc.gov` item add one sentence: *"Blog images (6.3) ride the existing `/api/img` proxy; the cache layer remains 7.3's."*; in "The curator has no rubric for text items" add: *"Does not bite 6.3's blogs — a link card is image-led and the hero goes to the model as bytes."*

- [ ] **Step 2: `docs/BUILD_PLAN.md` 6.3** — tick the box; keep the strategy paragraph; replace the seven-questions block with a one-paragraph *Done =* in the 6.1/6.2 style: planned 08-25-26 (`docs/PHASE6_DESIGN_6.3.md`), executed (date), walkthrough `docs/PHASE6_WALKTHROUGH_6.3.md`; the histogram numbers; D2 executed (row counts before/after).

- [ ] **Step 3: `docs/source-candidates.md`** — in the designated-blogs table: doorofperception → **Live (6.3)**; 50watts → **❌ Cut 08-25-26** with the robots/403 reason; Public Domain Review → note *Gatsby, `/rss.xml` → 200 `application/xml` — an RSS-walk adapter, next candidate*; thingsorganizedneatly → *Tumblr legacy `/api/read/json` → 200 — a Tumblr-walk adapter; the "nothing to blurb" edge case (LLM-written summary at ingest)*. Replace the blockquote's "Nothing here is built…" line with the §8 etiquette policy (five numbered rules) and a pointer to `robots.ts`.

- [ ] **Step 4: `CLAUDE.md`** — in "Repository status": *6.3 shipped (blog adapters; doorofperception live as link cards)*. In "Ecosystem coordination": after "Two blessed source-integration patterns…", add: *Corpus-walk is now implemented in-repo (`CorpusWalkAdapter`, Phase 6.3) — loupe's adapter uses it. Designated blogs are registered in `src/server/config/blogs.ts`; a blog's `body` is always null.*

- [ ] **Step 5: `types.ts` header** — extend the first comment paragraph: *"Since Phase 6.3 there are two shapes in this file: SourceAdapter (search) and CorpusWalkAdapter (walk); scripts/ingest.ts runs one lane per shape."*

- [ ] **Step 6: Commit**

```bash
bun run format:write && git add -A && git commit -m "docs: 6.3 — SPEC §5.1/§6.1/§6.4/§15, BUILD_PLAN tick, source-candidates, CLAUDE.md"
```

---

### T11 — Ambit-Admin: record the cross-repo decisions BEFORE the archive changes

**Files:** `~/vaults/Memory-Palace/05 Projects/Ambit-Admin/log.md`, `…/Roadmap & Backlog.md`, `…/Ecosystem Architecture.md`

Per Ambit-Admin's own rule ("contract changes get recorded here first"), this task precedes T12.

- [ ] **Step 1: `log.md`** — a new bullet at the top of `## 2026-08`, in the file's style (`- [[08-DD-26 Ddd]] - **Title.** …`), covering: (1) corpus-walk implemented in Ambit as `CorpusWalkAdapter` — a sibling, `SourceAdapter` untouched, `fetchJson` gained `noRetryOn` which is the loupe fail-fast requirement landed; (2) **D2**: ambit-archive stops serving doorofperception — mechanism (root removed from `DISK_ROOTS`, attended `--force-sweep`), Ambit deletes those rows by id; index.csv and files stay; (3) doorofperception is live as link cards in Ambit under the honest license; (4) 50watts cut. End with the spend line if the vault convention expects one (it does — `python3 ~/.claude/scripts/session-spend.py --session <uuid>`; omit if it exits non-zero).

- [ ] **Step 2: `Roadmap & Backlog.md`** — tick "Blog-adapter v1 design session" and "Door of Perception corpus migration" (with dates); on "Ambit ⇄ Loupe hookup" add *"contract exists as of 6.3: `CorpusWalkAdapter` in Ambit's `sources/types.ts`"*.

- [ ] **Step 3: `Ecosystem Architecture.md`** — in the corpus-walk pattern paragraph (line ~75), add: *Implemented in Ambit 08-DD-26 (`CorpusWalkAdapter`, first used by the in-repo blog adapters); `fetchJson` honours `noRetryOn: [401, 403]`.* Under the Archive bullet: *DoP scrape retired from `/search` on 08-DD-26 (D2); files and `index.csv` remain on disk.*

No commit — the vault is not this repo. Note in the walkthrough that it was done.

---

### T12 — Archive retirement (D2): archive side, then Ambit side

**Files:**
- Create: `scripts/retire-source-rows.ts` (Ambit); Modify: `package.json` (`"retire": "bun run scripts/retire-source-rows.ts"`)
- ambit-archive: `.env` (`DISK_ROOTS`) — **no code changes there**

**Preconditions:** T7 done (blog live), T11 done (recorded). Ben present — the sweep is an attended operation.

- [ ] **Step 1: Export the ids from the archive (provenance-based, exact)** — in `~/Dev/ambit-archive`:

```bash
cd ~/Dev/ambit-archive
bun -e '
import { Database } from "bun:sqlite";
const db = new Database(process.env.ARCHIVE_DB_PATH ?? "./storage/archive.db", { readonly: true });
const rows = db.query("select distinct item_id from archive_provenance where external_id like ?")
  .all("%/storage/sources/doorofperception/%") as { item_id: string }[];
await Bun.write("/tmp/dop-archive-ids.txt", rows.map(r => r.item_id).join("\n") + "\n");
console.log(rows.length, "archive items with doorofperception provenance");
'
```

Expected: ~11,300–11,572 (the scrape had 11,572 files; content-hash dedupe collapses a few). If the count is 0, the `like` pattern doesn't match how `DISK_ROOTS` was written — run `select external_id from archive_provenance limit 3` and adjust the pattern to the real path prefix.

- [ ] **Step 2: Ambit's retire script (dry first)**

`scripts/retire-source-rows.ts`:

```ts
#!/usr/bin/env bun
/**
 * Delete a source's rows from `item` by sourceId list — Phase 6.3's half of D2 (docs/
 * PHASE6_DESIGN_6.3.md §9): once ambit-archive stops serving doorofperception, the archive rows
 * Ambit already holds for those images are miscredited ("Personal archive", no post link) and
 * must go. Precise by id, so saves on the archive's OTHER items survive.
 *
 *   bun run retire --source archive --ids /tmp/dop-archive-ids.txt            # report only
 *   bun run retire --source archive --ids /tmp/dop-archive-ids.txt --confirm  # delete
 *
 * Children first (seen_item, saved_item both FK onto item; neither cascades), in one transaction.
 * `--confirm` is required to write; without it this prints what it WOULD delete and exits 0.
 */
import { and, eq, inArray } from "drizzle-orm";

import { db } from "~/server/db/client";
import { item, savedItem, seenItem } from "~/server/db/schema";
import { ALL_SOURCE_IDS } from "~/server/services/sources";

const args = process.argv.slice(2);
const flag = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i > -1 ? args[i + 1] : undefined;
};
const source = flag("source");
const idsPath = flag("ids");
const confirm = args.includes("--confirm");

if (!source || !(ALL_SOURCE_IDS as string[]).includes(source) || !idsPath) {
  console.error("usage: bun run retire --source <source> --ids <file> [--confirm]");
  console.error(`known sources: ${ALL_SOURCE_IDS.join(", ")}`);
  process.exit(1);
}

const sourceIds = (await Bun.file(idsPath).text())
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);
console.log(`${sourceIds.length} sourceId(s) read from ${idsPath}`);

// Chunked: `inArray` with 11k params is fine for Postgres but not for readability of a failure.
const CHUNK = 1000;
const ids: string[] = [];
for (let i = 0; i < sourceIds.length; i += CHUNK) {
  const rows = await db
    .select({ id: item.id })
    .from(item)
    .where(and(eq(item.source, source), inArray(item.sourceId, sourceIds.slice(i, i + CHUNK))));
  ids.push(...rows.map((r) => r.id));
}
const savedRows = ids.length
  ? await db.select({ n: savedItem.itemId }).from(savedItem).where(inArray(savedItem.itemId, ids))
  : [];
console.log(
  `${ids.length} matching item row(s) for source "${source}"; ${savedRows.length} saved_item row(s) would go with them`,
);

if (!confirm) {
  console.log("dry run — pass --confirm to delete");
  process.exit(0);
}

await db.transaction(async (tx) => {
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    await tx.delete(seenItem).where(inArray(seenItem.itemId, slice));
    await tx.delete(savedItem).where(inArray(savedItem.itemId, slice));
    await tx.delete(item).where(inArray(item.id, slice));
  }
});
console.log(`deleted ${ids.length} item(s) and their seen/saved rows`);
process.exit(0);
```

```bash
bun run retire --source archive --ids /tmp/dop-archive-ids.txt
```

Expected: `N matching item row(s)` where N ≤ 310 — the archive rows Ambit holds that came from doorofperception. Record N and the saved count in the walkthrough.

- [ ] **Step 3: Archive side — stop scanning the folder, sweep attended**

In `~/Dev/ambit-archive/.env`, edit `DISK_ROOTS` to remove the `…/storage/sources/doorofperception` entry (colon-separated; leave the others). **Do not delete or move the folder or `index.csv`.** Then:

```bash
cd ~/Dev/ambit-archive
bun run sync --connector=disk            # first without force: EXPECT "sweep blocked: … ratio"
```

Expected: the run completes, then `sweep blocked:` naming the drop-ratio guard (85% > 20%). That is the archive's safety working. Now, with Ben watching the number:

```bash
bun run sync --connector=disk --force-sweep
```

Expected: `sweep: retired ~11,5xx provenance · withdrew ~11,3xx items`. Verify `/search` no longer returns them:

```bash
curl -s -H "x-archive-key: $ARCHIVE_API_KEY" "$ARCHIVE_URL/search?q=visionary%20art&limit=5" | head -c 600
```

— results should now be personal-archive images only (the ranked list still fills to `limit`; it is cosine over what remains). Record the sweep line in the walkthrough.

- [ ] **Step 4: Ambit side — delete, verify**

```bash
cd ~/Dev/ambit
bun run retire --source archive --ids /tmp/dop-archive-ids.txt --confirm
bun run ingest --source archive --quota 5 --dry-run --skip-llm    # the adapter still works against the slimmer archive
```

Then confirm the count and that no doorofperception image remains under the archive credit:

```bash
bun -e '
import { db } from "./src/server/db/client"; import { sql } from "drizzle-orm";
const a = await db.execute(sql`select source, count(*)::int as n from item where source in (${"archive"}, ${"doorofperception"}) group by source`);
console.log(JSON.stringify(a.rows ?? a)); process.exit(0);'
```

Expected: `archive` = 310 − N; `doorofperception` = the T7 inserted count. Add `"retire"` to `package.json` scripts if not already done.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(scripts): retire-source-rows — D2's Ambit side; archive stops serving doorofperception"
```

---

### T13 — Walkthrough, log, merge

- [ ] **Step 1: Finish `docs/PHASE6_WALKTHROUGH_6.3.md`** in the 6.2 walkthrough's style (`## The numbers`, per-step evidence, `## Feed check`): the histogram (already there), ingest totals and the idempotency re-run, the image-fetch column, five sample items with their scores and topics, where blog cards sit in the feed under `FEED_DEBUG`, the D2 counts (archive before/after, sweep line, Ambit rows deleted), and **what to remember**: the 800 px hero, the null-topic yield as the topic-expansion input, 50watts cut, PDR/Tumblr as next with their walk flavours.

- [ ] **Step 2: `log.md`** — extend the day's entry (or add one) per CLAUDE.md's format: Shipped / Decisions / Open-next, ending with the spend line from `python3 ~/.claude/scripts/session-spend.py --session <uuid>` (omit the line if it exits non-zero).

- [ ] **Step 3: Full verification, then merge**

```bash
bun run check                      # typecheck + lint + format + unit/integration
bun run e2e                        # dev server on :3000; gallery.spec:193 may be flaky — see CLAUDE.md
git checkout main && git merge --no-ff feat/6.3-blog-adapters -m "Merge branch 'feat/6.3-blog-adapters'"
```

Report the actual output of both runs — if anything is red, say so with the output rather than merging past it.

---

## Verification (the done-bar, end to end)

1. `bun run test` green, including `source-invariants` (both halves), `blogs.test`, `robots.test`, `http.test`, the walker fixture tests, curator classify tests, `topicHistogram`/`planPrune`.
2. `bun run ingest --source doorofperception` is idempotent: second run inserts 0, walk `complete yes`, no prune section.
3. `/i/<blog item>` shows title · maker line once · `from: Door of Perception →` · blurb · *Read the post on Door of Perception* row · no `<h2>` reader sections. The e2e in T9 asserts it.
4. `select count(*) from item where source in (WALK_SOURCES) and body is not null` = 0.
5. `/search` on the archive returns no doorofperception image; Ambit holds 0 archive rows with doorofperception provenance; `index.csv` and the files are untouched.
6. Ambit-Admin log carries the D2 and contract entries, dated before the sweep.

## Out of scope (resist)

- Blog #2 (PDR = RSS walk, Tumblr = JSON walk). Named, not built.
- A cache in front of `/api/img` (7.3). Full-resolution heroes from `index.csv`.
- Expanding the topic set — the null bucket is the input to that separate offline job.
- A suspended-items list; per-blog knobs in the registry; a general robots parser.
- Re-curating existing museum rows with the classify prompt.
