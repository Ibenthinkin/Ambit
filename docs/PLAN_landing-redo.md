# The landing redo (8.3) — overture, corpus reel in two tempos, profile mark — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Written:** 09-25-26 by Fable 5.1, from the design doc below and a read of every file named
here at `main` = `0ee0049`. **For:** a cold session on a cheaper model, on a plain branch off
`main` (Ben's convention — no worktree).

**Goal:** `/` opens on black with `AMBIT — A quieter way to be curious.`, the tail collapses into
the wordmark, and the page hard-cuts into a full-bleed reel of the corpus's own best public-domain
pictures — in one of two tempos Ben chooses by looking — before the sign-in sheet rises; and a
dev page shows three candidate profile marks to replace the Cosmos-copy avatar.

**Architecture:** the server picks the reel (an in-process memo of ~2,700 landing-eligible item
ids, D1–D2) and the RSC puts the first pictures in the HTML as preloads; a second image rendition
(`?w=960`, derived from the cached master, D3) keeps each frame ~45 KB; one client hook
(`use-reel`) drives both tempos from a plain `Tempo` object (D5) after an `Overture` component
plays the reference's text collapse with compositor-only CSS (D4). `AuthSheet`, `AuthCard`, the
glyph, ←/→, reduced motion and the e2e hydration contract are untouched. The profile mark is
three SVGs on `/dev/marks`; production keeps the current chip until Ben picks (D7).

**Tech Stack:** Next.js 16.2 App Router, React 19 (`react-dom`'s `preload`), Drizzle 0.45,
`sharp` 0.34, Tailwind v4, Vitest 4 (+ jsdom, Testing Library), Playwright 1.62, Bun 1.4,
`next/font/google` (Inter). **No new dependencies.**

**Spec:** `docs/DESIGN_landing-redo.md` — read it first. Its decisions D1–D9 are the spec; this
plan is how. Cite them in commit messages where a choice looks odd.

## Global Constraints

- **Branch off `main`, plain branch, no worktree:** `git switch -c feat/landing-redo main`.
  Commit after every task with the message given. `git status -sb` must not read `[ahead N]` when
  the branch is declared done — push.
- **TDD every task**: write the test, run it and watch it fail for the right reason, then the code.
  `bun run vitest run <file>` runs one file; `bun run test` the suite; `bun run check` (typecheck +
  lint + format + tests) must be green before the final push. Run `bun run format:write` before each
  commit — `check` fails on prettier drift.
- **`bun run e2e:prod` is the e2e suite** (production build), never `bun run e2e`. `chromium` is
  402 × 874, `desktop` 1440 × 900. After Task 6 also run the suite in **CI's shape** (fixture-only
  database — the recipe is in CLAUDE.md's "Local e2e runs against the real corpus" note), because
  the landing's fallback branch (D2) only executes on an empty pool.
- **Known red, not yours:** `services/feed.integration.test.ts`'s cursor-stability test fails ~1
  run in 10 with a `seen_item` foreign-key error (CLAUDE.md explains); `source-invariants.test.ts`
  may fail on one 70sscifiart row. Neither is evidence about this branch.
- **The licence rule is data** (`LANDING_LICENSES`, `LANDING_LICENSE_PREFIXES`, D1) — exact
  strings, copied from the design's table, never regexes over "public domain".
- **The rendition set is closed** (`RENDITIONS = [960] as const`, D3). The route never parses a
  size; it matches a token. A rendition is derived from the cached master, never fetched upstream
  on its own.
- **Nothing random reaches the server's markup except through the server** (D8): the reel is
  picked in the RSC; `Math.random` on the client is only for `pickReel`'s tests. Reduced motion
  and `saveData` are read after hydration through `useMediaQuery` / a `useSyncExternalStore`.
- **Motion is `opacity` / `transform` / `clip-path` only**; no `width`/`height`/`top`/`left`
  transitions anywhere in `components/landing/`. CLS must be 0 in Task 8's Lighthouse run.
- **Every `<img>` of an item is `imageSrc`-shaped** — `/api/img/<id>` (with `?w=960`) or a
  `data:` URL. Never a museum URL (CSP `img-src 'self' data: blob:`).
- **Tailwind classes are literal** (the scanner reads source text) — never interpolate
  `mix-blend-difference`, `tracking-[.32em]` etc.
- **`aria-label="Open sign-in"`** (the glyph) and **`"Back to the slideshow"`** (the sheet's disc)
  are load-bearing strings: `e2e/support.ts`'s `openAuthSheet` and `home.spec.ts` select on them.
  Keep both verbatim.
- The design's numbers are the spec. Where this plan and the design disagree, **the plan wins**
  (written second, against the code); note the discrepancy in the log entry.

## Review Focus

Inputs the spec implies but no obvious test covers — each pinned to a task below:

1. **A picture that 404s mid-reel** (its cache file deleted, or a museum row retired between pick
   and paint). Expected: the reel skips it and keeps time, never a blank frame. → Task 3
   (`use-reel`: an `onError`'d picture is never "ready"; the skip rule covers it).
2. **`?w=1600`, `?w=abc`, `?w=960.0`** on the image route. Expected: 400, `no-store`, nothing
   written. → Task 2.
3. **The overture on a reader who arrives with the sheet already requested** (`/reset-password`,
   reduced motion). Expected: no overture at all, not a skipped-through one — the wordmark must
   not flash. → Task 4 (`enabled: false` → `done` on the first render).
4. **The pool memo across an ingest** — new score-9 rows must appear without a restart. Expected:
   within `POOL_TTL_MS`. → Task 1 (fake timers: a second call after the TTL re-queries).
5. **A master smaller than 960 px.** Expected: the rendition is the master's own size, never
   enlarged; the `1600w` descriptor still parses. → Task 2 (`withoutEnlargement`).

## File map

| file | task | responsibility |
|---|---|---|
| `src/server/config/landing-pool.ts` (+ test) | 1 | the licence rule and score floor, as data |
| `src/server/db/items.ts` (+ `items.integration.test.ts`) | 1 | `listLandingPool()` — the one query |
| `src/server/services/landing-pool.ts` (+ test) | 1 | the memo, `pickReel`, `reelPicture`, `getReel`, the fallback |
| `src/server/services/image-cache.ts` (+ test), `src/app/api/img/[itemId]/route.ts` (+ test), `scripts/warm-images.ts` | 2 | the `w960` rendition, derived; `?w=`; `--rendition` / `--landing` |
| `src/components/landing/tempos.ts` (+ test), `src/components/landing/use-reel.ts` (+ test), `src/components/landing/use-pictures.ts` (+ test) | 3 | the two tempos; the timer; the decode tracker |
| `src/lib/fonts.ts`, `src/components/landing/overture.tsx` (+ test), `src/components/landing/use-overture.ts` (+ test) | 4 | Inter; the text collapse; its clock |
| `src/components/landing/landing-reel.tsx` (+ test), `src/components/landing/landing-screen.tsx` (+ test), `src/app/page.tsx`, `src/app/reset-password/page.tsx`, `public/landing/fallback.webp`, delete `public/landing/*.jpg`, `landing-slides.ts` (+ test), `landing-slideshow.tsx`, `use-slideshow.ts` (+ test); `src/lib/sw-rules.test.ts` | 5 | the layers; the screen; the server pick + preloads + `?tempo`; the deletions |
| `e2e/home.spec.ts`, `e2e/support.ts` | 6 | the reel's e2e contract; landing-eligible fixtures |
| `src/lib/avatar-hue.ts`, `src/components/icons/marks.tsx` (+ test), `src/app/dev/marks/page.tsx`, `src/components/dev/marks-bench.tsx` | 7 | three candidate marks; the bench |
| `docs/phase8.3-evidence/`, `SPEC.md`, `docs/BUILD_PLAN.md`, `CLAUDE.md`, `log.md`, `.gitignore` | 8 | evidence + words; push |
| `src/components/landing/tempos.ts`, `src/components/ui/avatar-chip.tsx` (+ callers) | 9 | **after Ben's picks:** flip the default, delete the loser, swap the mark |

---

### Task 1: The pool — licence rule, the query, the memo, `pickReel`, the fallback

**Files:**
- Create: `src/server/config/landing-pool.ts`, `src/server/config/landing-pool.test.ts`
- Modify: `src/server/db/items.ts` (append), `src/server/db/items.integration.test.ts` (append)
- Create: `src/server/services/landing-pool.ts`, `src/server/services/landing-pool.test.ts`

**Interfaces:**
- Produces:
  - `LANDING_SCORE_FLOOR = 9`, `LANDING_LICENSES: readonly string[]`, `LANDING_LICENSE_PREFIXES: readonly string[]`, `isLandingLicense(license: string | null): boolean`
  - `listLandingPool(): Promise<{ id: string; imageUrl: string }[]>` (db)
  - `type ReelPicture = { id: string; src: string; srcSet: string | null }`, `REEL_SIZE = 12`, `POOL_TTL_MS`, `FALLBACK_PICTURE: ReelPicture`, `pickReel(ids, n, rng?)`, `reelPicture(id, imageUrl)`, `getReel(n?)`, `resetLandingPoolForTests()`

- [ ] **Step 1: The licence rule's test**

`src/server/config/landing-pool.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  isLandingLicense,
  LANDING_LICENSE_PREFIXES,
  LANDING_LICENSES,
  LANDING_SCORE_FLOOR,
} from "./landing-pool";

// D1: the rule is a list of exact strings plus PDR's prefix — never a regex over "public domain".
describe("isLandingLicense", () => {
  it("accepts each exact string the design names", () => {
    for (const s of [
      "CC0 1.0 (public domain)",
      "CC0",
      "Public Domain Mark",
      "Public domain (NASA)",
      "No known restrictions on publication",
    ]) {
      expect(isLandingLicense(s), s).toBe(true);
    }
  });

  it("accepts PDR's per-collection variants by prefix", () => {
    expect(
      isLandingLicense(
        "Public domain — PD Worldwide · text CC BY-SA 4.0 (The Public Domain Review)",
      ),
    ).toBe(true);
    expect(
      isLandingLicense("Public domain — Effectively PD · text CC BY-SA 4.0 (The Public Domain Review)"),
    ).toBe(true);
  });

  it("refuses everything the design excludes", () => {
    for (const s of [
      null,
      "",
      "CC BY 4.0",
      "unknown",
      "Rights retained by the author — displayed with credit and link",
      "Rights retained by original authors — displayed with credit and link",
      "No open license — rights retained by original authors; personal use only.",
      "public domain", // case matters: the rule is exact, not a heuristic
      "Public domain", // PDR's prefix includes the dash
    ]) {
      expect(isLandingLicense(s), String(s)).toBe(false);
    }
  });

  it("pins the data the rule is made of", () => {
    expect(LANDING_SCORE_FLOOR).toBe(9);
    expect(LANDING_LICENSES).toHaveLength(5);
    expect(LANDING_LICENSE_PREFIXES).toEqual(["Public domain —"]);
  });
});
```

- [ ] **Step 2: Run it, expect failure** — `bun run vitest run src/server/config/landing-pool.test.ts` → FAIL, module not found.

- [ ] **Step 3: The rule**

`src/server/config/landing-pool.ts`:

```ts
// Which corpus pictures may open the app (docs/DESIGN_landing-redo.md D1).
//
// The landing shows a picture full-bleed with no credit, to a reader who has not signed in. That
// is a narrower use than the feed's, so the rule is narrower than "is in the corpus": a curator
// score of 9+, and a licence that permits exactly this — public domain or CC0, stated as such by
// the source. **Exact strings, not a heuristic.** `license` is free text each adapter writes
// (SPEC §5.1), so the honest rule is a list of the strings the adapters actually write, plus one
// prefix for The Public Domain Review's per-collection variants. Adding a source is one line here
// and one case in the test — never a regex over "public domain", which would quietly admit
// "Rights retained by the author" the day a source phrases something differently.
//
// Excluded on purpose: NULL (a missing rights statement is not a permissive one), CC BY (its
// condition is attribution and the landing renders none), the blogs ("Rights retained by original
// authors — displayed with credit and link": the link-card posture is display WITH a link, which
// a reel is not), `archive`'s "unknown", and Loupe.

/** The curator's floor for the landing. The feed's floor is 4; this screen shows the best. */
export const LANDING_SCORE_FLOOR = 9;

/** Exact `item.license` strings that admit a picture. Source in the comment; counts are 09-25-26 local. */
export const LANDING_LICENSES: readonly string[] = [
  "CC0 1.0 (public domain)", // cma, met, aic
  "CC0", // smithsonian
  "Public Domain Mark", // wellcome
  "Public domain (NASA)", // nasa-images
  "No known restrictions on publication", // loc
];

/** Prefixes that admit a picture — PDR writes `Public domain — <basis> · text CC BY-SA 4.0 (…)`. */
export const LANDING_LICENSE_PREFIXES: readonly string[] = ["Public domain —"];

export function isLandingLicense(license: string | null | undefined): boolean {
  if (!license) return false;
  if (LANDING_LICENSES.includes(license)) return true;
  return LANDING_LICENSE_PREFIXES.some((p) => license.startsWith(p));
}
```

- [ ] **Step 4: Run it** → PASS.

- [ ] **Step 5: The query's integration test**

Append to `src/server/db/items.integration.test.ts` (read its top 40 lines first for the
connection/cleanup pattern it already uses — `insertHomedItems` from `db/test-fixtures.ts` and an
`afterAll` delete by a prefix). Add a describe block:

```ts
describe("listLandingPool", () => {
  const prefix = `landing-pool-${Date.now()}-`;
  let ids: string[] = [];

  beforeAll(async () => {
    const { db } = await import("./client");
    const rows = await db
      .insert(item)
      .values([
        // in: image, score 9, exact licence
        { source: "met", sourceId: `${prefix}in-1`, type: "image", title: "in 1", imageUrl: "https://x.test/1.jpg", sourceUrl: "https://x.test/1", license: "CC0 1.0 (public domain)", curationScore: 9 },
        // in: PDR prefix, score 10
        { source: "pdr", sourceId: `${prefix}in-2`, type: "image", title: "in 2", imageUrl: "https://x.test/2.jpg", sourceUrl: "https://x.test/2", license: "Public domain — PD Worldwide · text CC BY-SA 4.0 (The Public Domain Review)", curationScore: 10 },
        // out: score 8.9
        { source: "met", sourceId: `${prefix}out-score`, type: "image", title: "out", imageUrl: "https://x.test/3.jpg", sourceUrl: "https://x.test/3", license: "CC0", curationScore: 8.9 },
        // out: article
        { source: "met", sourceId: `${prefix}out-type`, type: "article", title: "out", imageUrl: "https://x.test/4.jpg", sourceUrl: "https://x.test/4", license: "CC0", curationScore: 9 },
        // out: licence
        { source: "wellcome", sourceId: `${prefix}out-lic`, type: "image", title: "out", imageUrl: "https://x.test/5.jpg", sourceUrl: "https://x.test/5", license: "CC BY 4.0", curationScore: 9 },
        // out: no image
        { source: "met", sourceId: `${prefix}out-img`, type: "image", title: "out", imageUrl: null, sourceUrl: "https://x.test/6", license: "CC0", curationScore: 9 },
      ])
      .returning({ id: item.id, sourceId: item.sourceId });
    ids = rows.map((r) => r.id);
  });

  afterAll(async () => {
    const { db } = await import("./client");
    await db.delete(item).where(like(item.sourceId, `${prefix}%`));
  });

  it("returns exactly the image rows at the floor under a landing licence", async () => {
    const pool = new Set((await listLandingPool()).map((r) => r.id));
    const { db } = await import("./client");
    const rows = await db
      .select({ id: item.id, sourceId: item.sourceId })
      .from(item)
      .where(like(item.sourceId, `${prefix}%`));
    const inIds = rows.filter((r) => r.sourceId.includes("in-")).map((r) => r.id);
    const outIds = rows.filter((r) => r.sourceId.includes("out-")).map((r) => r.id);
    for (const id of inIds) expect(pool.has(id), id).toBe(true);
    for (const id of outIds) expect(pool.has(id), id).toBe(false);
    expect(ids.length).toBe(6);
  });
});
```

Add `like` to the file's `drizzle-orm` import and `listLandingPool` to its `./items` import.

- [ ] **Step 6: Run it, expect failure** — `bun run vitest run src/server/db/items.integration.test.ts -t listLandingPool` → FAIL, `listLandingPool` is not exported.

- [ ] **Step 7: The query** — append to `src/server/db/items.ts` (add `isNotNull`, `like`, `or`, `sql` to the `drizzle-orm` import as needed; `SUSPENDED_SOURCES` is already imported):

```ts
/**
 * Every item the landing may show (docs/DESIGN_landing-redo.md D1): an image, at
 * `LANDING_SCORE_FLOOR` or better, from a live source, under a licence `isLandingLicense` admits.
 *
 * **Two columns only, on purpose.** The caller (`services/landing-pool.ts`) memoises the whole
 * pool in-process for ten minutes — ~2,700 rows × ~120 bytes — and a landing hit then costs no
 * query at all. Fetching full rows here would put megabytes in that memo for nothing: the reel
 * needs an id to build a proxy URL, and the URL only to tell a `data:` fixture from a museum.
 *
 * The licence rule is expressed twice — as data in config (the source of truth, unit-tested) and
 * as the `inArray`/`like` below (what Postgres can index). `items.integration.test.ts` pins that
 * they agree on the six shapes that matter.
 */
export async function listLandingPool(): Promise<
  { id: string; imageUrl: string }[]
> {
  const { db } = await import("./client");
  const { LANDING_LICENSES, LANDING_LICENSE_PREFIXES, LANDING_SCORE_FLOOR } =
    await import("~/server/config/landing-pool");

  const licence = or(
    inArray(item.license, [...LANDING_LICENSES]),
    ...LANDING_LICENSE_PREFIXES.map((p) => like(item.license, `${p}%`)),
  );
  const conditions = [
    eq(item.type, "image"),
    isNotNull(item.imageUrl),
    gte(item.curationScore, LANDING_SCORE_FLOOR),
    licence,
  ];
  if (SUSPENDED_SOURCES.length > 0) {
    conditions.push(notInArray(item.source, SUSPENDED_SOURCES));
  }
  const rows = await db
    .select({ id: item.id, imageUrl: item.imageUrl })
    .from(item)
    .where(and(...conditions));
  // `isNotNull` above guarantees the `!`.
  return rows.map((r) => ({ id: r.id, imageUrl: r.imageUrl! }));
}
```

(Drizzle's `or(...)` with a spread of `like`s is fine; `LANDING_LICENSE_PREFIXES` has one entry
today.) Note `data:` image URLs are **included** — the e2e fixtures use them and `reelPicture`
below handles them (D2's fallback branch is for an *empty* pool, not for pixel fixtures).

- [ ] **Step 8: Run it** → PASS. Then `bun run vitest run src/server/db/items.integration.test.ts` whole file → green.

- [ ] **Step 9: The service's test**

`src/server/services/landing-pool.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listLandingPool = vi.hoisted(() => vi.fn());
vi.mock("~/server/db/items", () => ({ listLandingPool }));

const row = (id: string) => ({ id, imageUrl: `https://m.test/${id}.jpg` });

import {
  FALLBACK_PICTURE,
  getReel,
  pickReel,
  POOL_TTL_MS,
  REEL_SIZE,
  reelPicture,
  resetLandingPoolForTests,
} from "./landing-pool";

beforeEach(() => {
  vi.useFakeTimers();
  resetLandingPoolForTests();
  listLandingPool.mockReset().mockResolvedValue(["a", "b", "c", "d", "e"].map(row));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("pickReel", () => {
  it("is a shuffled subset of n, without repeats, deterministic under an injected rng", () => {
    let i = 0;
    const rng = () => [0.1, 0.9, 0.5, 0.3, 0.7][i++ % 5]!;
    const a = pickReel(["a", "b", "c", "d", "e"], 3, rng);
    expect(a).toHaveLength(3);
    expect(new Set(a).size).toBe(3);
    i = 0;
    expect(pickReel(["a", "b", "c", "d", "e"], 3, rng)).toEqual(a);
  });

  it("returns the whole pool, shuffled, when n exceeds it", () => {
    expect(pickReel(["a", "b"], 12, () => 0).sort()).toEqual(["a", "b"]);
  });

  it("does not mutate its input", () => {
    const ids = ["a", "b", "c"];
    pickReel(ids, 2, () => 0);
    expect(ids).toEqual(["a", "b", "c"]);
  });
});

describe("reelPicture", () => {
  it("builds the proxied 960 src and a two-candidate srcset for an http image", () => {
    expect(reelPicture("id1", "https://museum.test/x.jpg")).toEqual({
      id: "id1",
      src: "/api/img/id1?w=960",
      srcSet: "/api/img/id1?w=960 960w, /api/img/id1 1600w",
    });
  });

  it("passes a data: URL through with no srcset (the e2e fixtures)", () => {
    expect(reelPicture("id2", "data:image/png;base64,AAAA")).toEqual({
      id: "id2",
      src: "data:image/png;base64,AAAA",
      srcSet: null,
    });
  });
});

describe("getReel", () => {
  it("queries once, then serves picks from the memo until the TTL passes", async () => {
    await getReel(2);
    await getReel(2);
    expect(listLandingPool).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(POOL_TTL_MS + 1);
    await getReel(2);
    expect(listLandingPool).toHaveBeenCalledTimes(2);
  });

  it("returns REEL_SIZE pictures by default, each proxied", async () => {
    listLandingPool.mockResolvedValue(
      Array.from({ length: 30 }, (_, i) => row(`id${i}`)),
    );
    const reel = await getReel();
    expect(reel).toHaveLength(REEL_SIZE);
    expect(reel[0]!.src).toMatch(/^\/api\/img\/id\d+\?w=960$/);
  });

  it("falls back to the one committed picture when the pool is empty", async () => {
    listLandingPool.mockResolvedValue([]);
    expect(await getReel()).toEqual([FALLBACK_PICTURE]);
    expect(FALLBACK_PICTURE.src).toBe("/landing/fallback.webp");
    expect(FALLBACK_PICTURE.srcSet).toBeNull();
  });

  it("falls back, and does not memoise the failure, when the query throws", async () => {
    listLandingPool.mockRejectedValueOnce(new Error("db down"));
    expect(await getReel()).toEqual([FALLBACK_PICTURE]);
    await getReel();
    expect(listLandingPool).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 10: Run it, expect failure** — module not found.

- [ ] **Step 11: The service**

`src/server/services/landing-pool.ts`:

```ts
// The landing's reel (docs/DESIGN_landing-redo.md D2): which pictures open the app for this visit.
//
// **The server picks.** 5.11 could not put a random run in the server's HTML — the server would
// choose one order, the client another, and every load would log a hydration mismatch — so it
// hid the imagery until after hydration. Picking here, in the RSC, means the reel IS the HTML:
// the first pictures are `<link rel="preload">`s in `<head>` and the first `<img>` is in the
// markup (see app/page.tsx). That is the whole LCP story.
//
// **Memoised in-process, ids and URLs only.** ~2,700 rows × ~120 bytes, refreshed after ten
// minutes, so a landing hit costs no query and the nightly ingest's new pictures appear within
// the TTL. Module-level and per-process like the rate limiters (SPEC §13: one instance).
//
// **The fallback is not an error path.** A fresh install and CI's fixture-only database have an
// empty pool by construction; both must show a landing that looks like Ambit. One committed
// public-domain picture does that, and CI exercises this branch every run.
import { listLandingPool } from "~/server/db/items";

export interface ReelPicture {
  id: string;
  /** What the `<img src>` is: the 960 rendition through the proxy, or a `data:` URL verbatim. */
  src: string;
  /** Two candidates for the browser to choose between by `sizes`; null for `data:`. */
  srcSet: string | null;
}

export const REEL_SIZE = 12;
export const POOL_TTL_MS = 10 * 60 * 1000;

/** Hokusai, The Great Wave off Kanagawa (c. 1831), public domain — the one picture that ships in
 *  the repo, re-encoded from 5.11's JPEG at 960 px WebP q76 (Task 5). Credit lives here because
 *  nothing renders it. */
export const FALLBACK_PICTURE: ReelPicture = {
  id: "fallback",
  src: "/landing/fallback.webp",
  srcSet: null,
};

/** Fisher–Yates over a copy, first `n`. `rng` is injectable for tests; production uses Math.random. */
export function pickReel<T>(
  pool: readonly T[],
  n: number,
  rng: () => number = Math.random,
): T[] {
  const a = pool.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a.slice(0, n);
}

/**
 * The `src`/`srcset` pair for one picture. Pure, so the client tests can build fixtures with it.
 *
 * `sizes` lives on the `<img>` (landing-reel.tsx), not here: `(min-width: 768px) 100vw, 50vw` —
 * below `md` a phone takes the 960 (0.8 device pixels per image pixel at 3×, invisible behind a
 * moving surface), from `md` the master. The `1600w` descriptor is nominal (D3).
 */
export function reelPicture(id: string, imageUrl: string): ReelPicture {
  if (imageUrl.startsWith("data:")) return { id, src: imageUrl, srcSet: null };
  const master = `/api/img/${id}`;
  const small = `${master}?w=960`;
  return { id, src: small, srcSet: `${small} 960w, ${master} 1600w` };
}

let memo: { rows: { id: string; imageUrl: string }[]; at: number } | null =
  null;

/** Tests only: forget the memo between cases. */
export function resetLandingPoolForTests(): void {
  memo = null;
}

async function pool(): Promise<{ id: string; imageUrl: string }[]> {
  if (memo && Date.now() - memo.at < POOL_TTL_MS) return memo.rows;
  const rows = await listLandingPool();
  memo = { rows, at: Date.now() };
  return rows;
}

/** What `app/page.tsx` awaits. Never throws: a database problem is a fallback, not a 500 on `/`. */
export async function getReel(n: number = REEL_SIZE): Promise<ReelPicture[]> {
  let rows: { id: string; imageUrl: string }[];
  try {
    rows = await pool();
  } catch (err) {
    // Logged, not mailed: instrumentation.ts mails on throws, and this is a handled fallback.
    console.error("landing-pool: query failed, serving the fallback", err);
    return [FALLBACK_PICTURE];
  }
  if (rows.length === 0) return [FALLBACK_PICTURE];
  return pickReel(rows, n).map((r) => reelPicture(r.id, r.imageUrl));
}
```

- [ ] **Step 12: Run both test files** → PASS. `bun run typecheck` → clean.

- [ ] **Step 13: Commit**

```bash
bun run format:write
git add src/server/config/landing-pool.ts src/server/config/landing-pool.test.ts src/server/db/items.ts src/server/db/items.integration.test.ts src/server/services/landing-pool.ts src/server/services/landing-pool.test.ts
git commit -m "feat(landing): the pool — licence rule as data, listLandingPool, memo + pickReel + fallback (D1, D2)"
```

---

### Task 2: The `w960` rendition — derived from the master, closed set, `?w=`, `img:warm` flags

**Files:**
- Modify: `src/server/services/image-cache.ts`, `src/server/services/image-cache.test.ts`
- Modify: `src/app/api/img/[itemId]/route.ts`, `src/app/api/img/[itemId]/route.test.ts`
- Modify: `scripts/warm-images.ts`

**Interfaces:**
- Produces: `RENDITIONS = [960] as const`, `type Rendition = (typeof RENDITIONS)[number]`, `RENDITION_QUALITY = 76`, `isRendition(w: string | null): Rendition | null`, `renditionPathFor(itemId, w, dir?)`, `getOrFillRendition(item, w, opts?) → Promise<CachedImage & { hit: boolean }>`
- Consumes: `getOrFill`, `cachePathFor`, `readCached`, `FillOpts` (existing)

- [ ] **Step 1: Cache tests** — append to `src/server/services/image-cache.test.ts` (it already has `png()`, `fetchReturning()`, `item`, a per-test `dir`):

```ts
describe("renditions (D3)", () => {
  it("isRendition admits only the closed set, as a number", () => {
    expect(isRendition("960")).toBe(960);
    expect(isRendition("1600")).toBeNull();
    expect(isRendition("960.0")).toBeNull();
    expect(isRendition("abc")).toBeNull();
    expect(isRendition(null)).toBeNull();
    expect(RENDITIONS).toEqual([960]);
  });

  it("derives the rendition from the cached master without touching fetch", async () => {
    const fetchImpl = fetchReturning(await png(3000, 2000));
    await fillCache(item, { dir, fetchImpl }); // the master, one upstream fetch
    const r = await getOrFillRendition(item, 960, { dir, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const meta = await sharp(r.bytes).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(960);
    expect(meta.height).toBe(640);
    expect(r.hit).toBe(false);
    expect((await readdir(dir)).sort()).toEqual(
      [`${item.id}.w960.webp`, `${item.id}.webp`].sort(),
    );
  });

  it("fills the master first when neither exists — one upstream fetch, two files", async () => {
    const fetchImpl = fetchReturning(await png(3000, 2000));
    await getOrFillRendition(item, 960, { dir, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect((await readdir(dir)).length).toBe(2);
  });

  it("reads the rendition off disk on the second call", async () => {
    const fetchImpl = fetchReturning(await png(3000, 2000));
    await getOrFillRendition(item, 960, { dir, fetchImpl });
    const again = await getOrFillRendition(item, 960, { dir, fetchImpl });
    expect(again.hit).toBe(true);
  });

  it("never enlarges a master smaller than the rendition", async () => {
    const fetchImpl = fetchReturning(await png(400, 300));
    const r = await getOrFillRendition(item, 960, { dir, fetchImpl });
    const meta = await sharp(r.bytes).metadata();
    expect(meta.width).toBe(400);
  });

  it("renditionPathFor keys on the id and the width only", () => {
    expect(renditionPathFor("abc", 960, "/tmp/x")).toBe("/tmp/x/abc.w960.webp");
  });
});
```

Add `getOrFillRendition`, `isRendition`, `renditionPathFor`, `RENDITIONS` to the import.

- [ ] **Step 2: Run, expect failure** — `bun run vitest run src/server/services/image-cache.test.ts` → FAIL on the missing exports.

- [ ] **Step 3: The rendition** — append to `src/server/services/image-cache.ts`:

```ts
// ── Renditions (docs/DESIGN_landing-redo.md D3) ──────────────────────────────────────────────
//
// A second, smaller WebP per item, **derived from the cached master and never its own upstream
// fetch** — so the "once, ever" promise above survives it. The set is closed: a caller names a
// token from RENDITIONS, never a size, which keeps `route.ts`'s "the item id is the whole key"
// boundary intact (a route that resized to any `?w=` would be a CPU amplifier aimed at sharp).
//
// Measured on 120 cached masters (09-25-26): 960 px q76 is p50 45 KB / p90 132 KB against the
// master's 78 / 263. The landing's first frames ride on this; nothing else uses it yet.

export const RENDITIONS = [960] as const;
export type Rendition = (typeof RENDITIONS)[number];
/** Lower than the master's 82: a rendition is a background or a thumbnail, never the hero. */
export const RENDITION_QUALITY = 76;

/** The query-string token, parsed strictly: `"960"` → 960; anything else → null. */
export function isRendition(w: string | null | undefined): Rendition | null {
  if (w === undefined || w === null) return null;
  for (const r of RENDITIONS) {
    if (w === String(r)) return r;
  }
  return null;
}

export function renditionPathFor(
  itemId: string,
  w: Rendition,
  dir?: string,
): string {
  return join(imageCacheDir(dir), `${itemId}.w${w}.webp`);
}

async function readRendition(
  itemId: string,
  w: Rendition,
  dir?: string,
): Promise<CachedImage | null> {
  try {
    return {
      bytes: await readFile(renditionPathFor(itemId, w, dir)),
      contentType: "image/webp",
    };
  } catch {
    return null;
  }
}

/** Resize the master's bytes and write atomically, same temp+rename shape as `fillCache`. */
async function deriveRendition(
  item: Pick<Item, "id" | "imageUrl" | "source">,
  w: Rendition,
  opts: FillOpts,
): Promise<CachedImage> {
  const master = await getOrFill(item, opts); // fills upstream only if the master is missing
  let bytes: Buffer;
  try {
    bytes = await sharp(master.bytes)
      .resize({ width: w, height: w, fit: "inside", withoutEnlargement: true })
      .webp({ quality: RENDITION_QUALITY })
      .toBuffer();
  } catch (err) {
    throw new ImageFillError(
      "decode",
      `item ${item.id}: sharp refused the cached master: ${String(err)}`,
    );
  }
  const dir = imageCacheDir(opts.dir);
  await ensureDir(dir);
  const final = renditionPathFor(item.id, w, opts.dir);
  const temp = `${final}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, bytes);
    await rename(temp, final);
  } catch (err) {
    await unlink(temp).catch(() => undefined);
    throw new ImageFillError(
      "upstream",
      `item ${item.id}: rendition write failed: ${String(err)}`,
    );
  }
  return { bytes, contentType: "image/webp" };
}

const inFlightRenditions = new Map<string, Promise<CachedImage>>();

/** The rendition's `getOrFill`: off disk if present, else one shared derive per (id, w). */
export async function getOrFillRendition(
  item: Pick<Item, "id" | "imageUrl" | "source">,
  w: Rendition,
  opts: FillOpts = {},
): Promise<CachedImage & { hit: boolean }> {
  const cached = await readRendition(item.id, w, opts.dir);
  if (cached) return { ...cached, hit: true };
  const key = `${item.id}:${w}`;
  let pending = inFlightRenditions.get(key);
  if (!pending) {
    pending = deriveRendition(item, w, opts);
    inFlightRenditions.set(key, pending);
    pending.finally(() => inFlightRenditions.delete(key)).catch(() => undefined);
  }
  return { ...(await pending), hit: false };
}
```

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Route tests** — append to `src/app/api/img/[itemId]/route.test.ts`. The file mocks `~/server/services/image-cache` with `importActual` spread + `getOrFill`; extend the mock to also expose a `getOrFillRendition` mock:

```ts
// In the vi.hoisted block near getOrFill:
const getOrFillRendition = vi.hoisted(() => vi.fn());
// In the vi.mock factory's returned object, beside getOrFill:
getOrFillRendition,
```

and in `beforeEach`: `getOrFillRendition.mockReset().mockResolvedValue(cached("SMALLBYTES"));`.
Add a `requestWith = (search: string) => new Request(`http://ambit.test/api/img/item-1${search}`)`
helper and:

```ts
describe("?w= renditions (D3)", () => {
  it("serves the 960 rendition through getOrFillRendition, never getOrFill", async () => {
    getItemById.mockResolvedValue(itemWith("https://museum.test/a.jpg"));
    const res = await GET(requestWith("?w=960"), { params: Promise.resolve({ itemId: "item-1" }) });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("SMALLBYTES");
    expect(getOrFillRendition).toHaveBeenCalledWith(expect.objectContaining({ id: "item-1" }), 960);
    expect(getOrFill).not.toHaveBeenCalled();
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
  });

  it.each(["1600", "abc", "960.0", "", "0960"])("400s w=%s without touching the cache", async (w) => {
    getItemById.mockResolvedValue(itemWith("https://museum.test/a.jpg"));
    const res = await GET(requestWith(`?w=${w}`), { params: Promise.resolve({ itemId: "item-1" }) });
    expect(res.status).toBe(400);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(getOrFill).not.toHaveBeenCalled();
    expect(getOrFillRendition).not.toHaveBeenCalled();
  });

  it("still serves the master with no w", async () => {
    getItemById.mockResolvedValue(itemWith("https://museum.test/a.jpg"));
    const res = await call();
    expect(await res.text()).toBe("WEBPBYTES");
    expect(getOrFillRendition).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run, expect failure** — the `?w=960` case gets `WEBPBYTES`; the 400 cases get 200.

- [ ] **Step 7: The route** — in `route.ts`, import `getOrFillRendition, isRendition` and, after the item/URL check and before `getOrFill`:

```ts
  // D3: an optional rendition token. Parsed strictly against the closed set — `?w=` is a name
  // for a file we already decided to offer, never a size. Rejected before any cache work so a
  // scraper trying widths costs a string compare.
  const wParam = new URL(req.url).searchParams.get("w");
  const rendition = wParam === null ? null : isRendition(wParam);
  if (wParam !== null && rendition === null) {
    return new Response("Unknown rendition", { status: 400, headers: NO_STORE });
  }

  let image;
  try {
    image =
      rendition === null
        ? await getOrFill(item)
        : await getOrFillRendition(item, rendition);
  } catch (err) {
```

(Replace the existing `image = await getOrFill(item);` line.) The rest of the handler is unchanged.

- [ ] **Step 8: Run** → PASS, whole route file green.

- [ ] **Step 9: `img:warm --rendition 960 [--landing]`** — in `scripts/warm-images.ts`:

Add flags after `dryRun`:

```ts
/** `--rendition 960`: derive that rendition from cached masters. No network: rows without a
 *  master are skipped (warm the master first). */
const rendition = flag("rendition") ? isRendition(flag("rendition")!) : null;
if (flag("rendition") && rendition === null) {
  console.error(`unknown rendition ${flag("rendition")}; known: ${RENDITIONS.join(", ")}`);
  process.exit(1);
}
/** `--landing`: only the landing pool (config/landing-pool.ts) — the rows the reel can draw. */
const landingOnly = process.argv.includes("--landing");
```

Import `isRendition, RENDITIONS, renditionPathFor, getOrFillRendition` from image-cache, and
`isLandingLicense, LANDING_SCORE_FLOOR` from `~/server/config/landing-pool`, `gte` from
drizzle-orm. Extend the query: select `license` and `curationScore` too; if `landingOnly`, push
`eq(item.type, "image")` and `gte(item.curationScore, LANDING_SCORE_FLOOR)` into `conditions`
and, after the select, `rows = rows.filter((r) => isLandingLicense(r.license))` (the licence
list is data; filtering in JS keeps the script honest to the config file rather than duplicating
the SQL from `listLandingPool`). Update the header comment's usage block with the two flags and
the `console.log` summary line (`· rendition 960` / `· landing pool only`).

In the loop, before the `isCached` check, branch:

```ts
  if (rendition !== null) {
    // Derived, never fetched: a master that isn't on disk is skipped, not filled — the point of
    // this mode is CPU, not network, so it can run at full speed with no per-host pacing.
    try {
      await stat(renditionPathFor(row.id, rendition));
      tallyRow.skipped++;
      continue;
    } catch {
      /* not derived yet */
    }
    if (!(await isCached(row.id))) {
      tallyRow.skipped++;
      continue;
    }
    if (dryRun) {
      attempted++;
      tallyRow.filled++;
      continue;
    }
    attempted++;
    try {
      await getOrFillRendition(row, rendition);
      tallyRow.filled++;
    } catch (err) {
      if (!(err instanceof ImageFillError)) throw err;
      tallyRow.decode++;
    }
    if (attempted % 100 === 0) process.stdout.write(`  … ${attempted} derived\n`);
    continue;
  }
```

- [ ] **Step 10: Prove the script by hand** — `bun run img:warm --rendition 960 --landing --dry-run`
prints a candidate count near 2,700 and "would fill" per source; then
`bun run img:warm --rendition 960 --landing --limit 20` writes 20 `*.w960.webp` files into
`.cache/img` (`ls .cache/img/*.w960.webp | wc -l` → 20). Then run the full derive in the
background while you continue (`bun run img:warm --rendition 960 --landing > .cache/img-w960.log
2>&1 &`) — it is a few minutes of CPU.

- [ ] **Step 11: Commit**

```bash
bun run format:write
git add src/server/services/image-cache.ts src/server/services/image-cache.test.ts "src/app/api/img/[itemId]/route.ts" "src/app/api/img/[itemId]/route.test.ts" scripts/warm-images.ts
git commit -m "feat(img): a 960px rendition derived from the cached master; ?w= from a closed set; img:warm --rendition/--landing (D3)"
```

---

### Task 3: Tempos, the decode tracker, and the reel hook

**Files:**
- Create: `src/components/landing/tempos.ts`, `src/components/landing/tempos.test.ts`
- Create: `src/components/landing/use-pictures.ts`, `src/components/landing/use-pictures.test.tsx`
- Create: `src/components/landing/use-reel.ts`, `src/components/landing/use-reel.test.tsx`

**Interfaces:**
- Produces:
  - `interface Tempo { id: TempoId; frameMs; fadeMs; firstPass; gateFrames; drift: boolean; behindSheet: TempoId }`, `type TempoId = "cut" | "dissolve"`, `TEMPOS: Record<TempoId, Tempo>`, `DEFAULT_TEMPO: TempoId = "cut"`, `resolveTempo(param: string | undefined, allowOverride: boolean): Tempo`, `wantedAhead(tempo): number` (Infinity for cut, 1 for dissolve)
  - `usePictures(pictures: readonly ReelPicture[], index: number, ahead: number) → { ready: ReadonlySet<string>; version: number }`
  - `useReel(opts: ReelOptions) → Reel` where `ReelOptions = { count; tempo: Tempo; enabled: boolean; isReady: (i: number) => boolean; readyVersion: number; onFirstPass: () => void }` and `Reel = { index; prev: number | null; started: boolean; skip(); restart(); advance(dir: 1 | -1) }`
- Consumes: `ReelPicture` (Task 1 — import the type from `~/server/services/landing-pool`; it is a type-only import so the client bundle takes nothing from the server module)

- [ ] **Step 1: `tempos.ts` test**

```ts
import { describe, expect, it } from "vitest";

import { DEFAULT_TEMPO, resolveTempo, TEMPOS, wantedAhead } from "./tempos";

// D5's table, pinned. Change the design before you change these.
describe("tempos", () => {
  it("cut: 350 ms hard cuts, 12 before the sheet, 4 decoded to start, relaxes to dissolve", () => {
    expect(TEMPOS.cut).toEqual({
      id: "cut", frameMs: 350, fadeMs: 0, firstPass: 12, gateFrames: 4, drift: false, behindSheet: "dissolve",
    });
  });
  it("dissolve: 6 s frames, 2.5 s fade, 2 before the sheet, 1 decoded to start, drifts", () => {
    expect(TEMPOS.dissolve).toEqual({
      id: "dissolve", frameMs: 6000, fadeMs: 2500, firstPass: 2, gateFrames: 1, drift: true, behindSheet: "dissolve",
    });
  });
  it("cut stays under WCAG 2.3.1's three flashes a second", () => {
    expect(1000 / TEMPOS.cut.frameMs).toBeLessThan(3);
  });
  it("resolveTempo honours the param only when overrides are allowed", () => {
    expect(resolveTempo("dissolve", true).id).toBe("dissolve");
    expect(resolveTempo("dissolve", false).id).toBe(DEFAULT_TEMPO);
    expect(resolveTempo("nonsense", true).id).toBe(DEFAULT_TEMPO);
    expect(resolveTempo(undefined, true).id).toBe(DEFAULT_TEMPO);
  });
  it("wantedAhead: cut prefetches the whole reel, dissolve one ahead", () => {
    expect(wantedAhead(TEMPOS.cut)).toBe(Infinity);
    expect(wantedAhead(TEMPOS.dissolve)).toBe(1);
  });
});
```

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: `tempos.ts`**

```ts
// The two ways the landing's reel can move (docs/DESIGN_landing-redo.md D5). A no-import leaf, like
// services/feed-knobs.ts: the client reads it without bundling anything server-side, and it
// unit-tests in node.
//
// Ben is choosing between these by looking (`?tempo=` under the dev gate — see app/page.tsx).
// When he has, DEFAULT_TEMPO flips and Task 9 of the plan deletes the loser's entry; the `Tempo`
// object itself stays, because `behindSheet` needs a second gear to name.

export type TempoId = "cut" | "dissolve";

export interface Tempo {
  id: TempoId;
  /** How long a picture holds, ms. */
  frameMs: number;
  /** Cross-fade, ms. 0 is a hard cut. */
  fadeMs: number;
  /** Pictures shown before the sheet rises (the first pass). */
  firstPass: number;
  /** Decoded pictures required before the reel starts. */
  gateFrames: number;
  /** A slow 1.00 → 1.06 scale over each frame, transform only. */
  drift: boolean;
  /** The tempo that runs once the sheet is up. */
  behindSheet: TempoId;
}

export const TEMPOS: Record<TempoId, Tempo> = {
  // 350, not the reference's 320: WCAG 2.3.1 caps flashing at three a second. 1000/350 = 2.86.
  cut: { id: "cut", frameMs: 350, fadeMs: 0, firstPass: 12, gateFrames: 4, drift: false, behindSheet: "dissolve" },
  dissolve: { id: "dissolve", frameMs: 6000, fadeMs: 2500, firstPass: 2, gateFrames: 1, drift: true, behindSheet: "dissolve" },
};

/** What production runs. Flip after Ben's pick. */
export const DEFAULT_TEMPO: TempoId = "cut";

/** `?tempo=` resolved server-side; the override is honoured only under the dev gate (D5). */
export function resolveTempo(
  param: string | undefined,
  allowOverride: boolean,
): Tempo {
  if (allowOverride && (param === "cut" || param === "dissolve")) {
    return TEMPOS[param];
  }
  return TEMPOS[DEFAULT_TEMPO];
}

/** How many pictures past the current one to have decoded. */
export function wantedAhead(tempo: Tempo): number {
  return tempo.fadeMs === 0 ? Infinity : 1;
}
```

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: `use-pictures` test** (`// @vitest-environment jsdom`; `renderHook` from Testing Library, as `use-slideshow.test.tsx` does). jsdom never loads images, so the test drives readiness by stubbing `Image`:

```ts
// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePictures } from "./use-pictures";

// A controllable `Image`: every instance is recorded, and a test resolves or rejects its decode.
type Fake = { src: string; srcset: string; sizes: string; resolve: () => void; reject: () => void };
let instances: Fake[] = [];

beforeEach(() => {
  instances = [];
  vi.stubGlobal(
    "Image",
    class {
      src = "";
      srcset = "";
      sizes = "";
      decode: () => Promise<void>;
      constructor() {
        let resolve!: () => void;
        let reject!: () => void;
        const p = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
        this.decode = () => p;
        instances.push({ src: "", srcset: "", sizes: "", resolve, reject } as Fake);
        const me = instances[instances.length - 1]!;
        Object.defineProperty(this, "src", { set: (v: string) => { me.src = v; }, get: () => me.src });
        Object.defineProperty(this, "srcset", { set: (v: string) => { me.srcset = v; }, get: () => me.srcset });
        Object.defineProperty(this, "sizes", { set: (v: string) => { me.sizes = v; }, get: () => me.sizes });
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

const pics = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    src: `/api/img/p${i}?w=960`,
    srcSet: `/api/img/p${i}?w=960 960w, /api/img/p${i} 1600w`,
  }));

const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe("usePictures", () => {
  it("requests the current picture and `ahead` more, with srcset and sizes matching the <img>", () => {
    renderHook(() => usePictures(pics(6), 0, 1));
    expect(instances.map((i) => i.src)).toEqual(["/api/img/p0?w=960", "/api/img/p1?w=960"]);
    expect(instances[0]!.srcset).toContain("1600w");
    expect(instances[0]!.sizes).toBe("(min-width: 768px) 100vw, 50vw");
  });

  it("marks a picture ready when it decodes, and bumps version", async () => {
    const { result } = renderHook(() => usePictures(pics(3), 0, 0));
    expect(result.current.ready.has("p0")).toBe(false);
    instances[0]!.resolve();
    await settle();
    expect(result.current.ready.has("p0")).toBe(true);
    expect(result.current.version).toBe(1);
  });

  it("a failed decode is never ready (Review Focus 1)", async () => {
    const { result } = renderHook(() => usePictures(pics(2), 0, 1));
    instances[1]!.reject();
    await settle();
    expect(result.current.ready.has("p1")).toBe(false);
  });

  it("Infinity ahead requests the whole reel once", () => {
    renderHook(() => usePictures(pics(12), 0, Infinity));
    expect(instances).toHaveLength(12);
  });

  it("advancing the index requests the next one ahead, and never re-requests", () => {
    const { rerender } = renderHook(({ i }) => usePictures(pics(5), i, 1), { initialProps: { i: 0 } });
    rerender({ i: 1 });
    expect(instances.map((x) => x.src)).toEqual(["/api/img/p0?w=960", "/api/img/p1?w=960", "/api/img/p2?w=960"]);
  });

  it("wraps: ahead of the last picture is the first", () => {
    const { rerender } = renderHook(({ i }) => usePictures(pics(3), i, 1), { initialProps: { i: 0 } });
    rerender({ i: 2 });
    expect(instances.map((x) => x.src)).toContain("/api/img/p0?w=960");
    expect(instances).toHaveLength(3);
  });
});
```

- [ ] **Step 6: Run, expect failure.**

- [ ] **Step 7: `use-pictures.ts`**

```ts
"use client";

import * as React from "react";

import type { ReelPicture } from "~/server/services/landing-pool";

/** Must match the `<img sizes>` in landing-reel.tsx exactly, or the browser's cache key differs
 *  and a picture this hook decoded is fetched a second time by the element that paints it. */
export const REEL_SIZES = "(min-width: 768px) 100vw, 50vw";

// Which pictures of the reel have decoded (docs/DESIGN_landing-redo.md D5).
//
// Decoding happens off-DOM in `Image` objects — with the same `srcset`/`sizes` as the mounted
// `<img>`, so the browser's cache serves the element from what this hook fetched. `cut` wants the
// whole reel decoded up front (its 12 frames arrive faster than a 350 ms tick could fetch them);
// `dissolve` wants one ahead. `ready` is what `useReel` consults before showing a frame; a picture
// that fails to decode is simply never in it, and the reel skips past (never a blank frame).
//
// `version` is a counter for effects to depend on: a `Set` mutated in place has a stable identity.
export function usePictures(
  pictures: readonly ReelPicture[],
  index: number,
  ahead: number,
): { ready: ReadonlySet<string>; version: number } {
  const [ready] = React.useState(() => new Set<string>());
  const [version, setVersion] = React.useState(0);
  const requested = React.useRef(new Set<string>());

  React.useEffect(() => {
    const n = pictures.length;
    if (n === 0) return;
    const want = ahead === Infinity ? n : Math.min(n, ahead + 1);
    for (let k = 0; k < want; k++) {
      const p = pictures[(index + k) % n]!;
      if (requested.current.has(p.id)) continue;
      requested.current.add(p.id);
      const img = new Image();
      if (p.srcSet) {
        img.sizes = REEL_SIZES;
        img.srcset = p.srcSet;
      }
      img.src = p.src;
      const decode =
        typeof img.decode === "function"
          ? img.decode()
          : new Promise<void>((resolve, reject) => {
              img.addEventListener("load", () => resolve(), { once: true });
              img.addEventListener("error", () => reject(new Error("load")), { once: true });
            });
      decode.then(
        () => {
          ready.add(p.id);
          setVersion((v) => v + 1);
        },
        () => undefined, // never ready; the reel skips it
      );
    }
  }, [pictures, index, ahead, ready]);

  return { ready, version };
}
```

- [ ] **Step 8: Run** → PASS.

- [ ] **Step 9: `use-reel` test** (`// @vitest-environment jsdom`, fake timers, `renderHook`; model on `use-slideshow.test.tsx`'s `setup`/`advance` helpers):

```ts
// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TEMPOS } from "./tempos";
import { useReel, type ReelOptions } from "./use-reel";

function setup(overrides: Partial<ReelOptions> = {}) {
  const onFirstPass = vi.fn();
  const readySet = new Set<number>([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  const options: ReelOptions = {
    count: 12,
    tempo: TEMPOS.cut,
    enabled: true,
    isReady: (i) => readySet.has(i),
    readyVersion: 0,
    onFirstPass,
    ...overrides,
  };
  const view = renderHook((p: ReelOptions) => useReel(p), { initialProps: options });
  return { ...view, onFirstPass, options, readySet };
}
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useReel — cut", () => {
  it("starts when enabled and gateFrames are ready, steps every frameMs, fires onFirstPass after firstPass frames and wraps", () => {
    const { result, onFirstPass } = setup();
    expect(result.current.started).toBe(true);
    expect(result.current.index).toBe(0);
    for (let i = 1; i < 12; i++) {
      advance(350);
      expect(result.current.index).toBe(i);
    }
    expect(onFirstPass).not.toHaveBeenCalled();
    advance(350); // the 12th frame has held → first pass done, wrap
    expect(onFirstPass).toHaveBeenCalledTimes(1);
    expect(result.current.index).toBe(0);
    advance(350 * 12);
    expect(onFirstPass).toHaveBeenCalledTimes(1);
  });

  it("does not start until gateFrames pictures are ready", () => {
    const readySet = new Set<number>([0, 1, 2]);
    const { result, rerender, options } = setup({ isReady: (i) => readySet.has(i) });
    expect(result.current.started).toBe(false);
    advance(2000);
    expect(result.current.index).toBe(0);
    readySet.add(3);
    rerender({ ...options, isReady: (i) => readySet.has(i), readyVersion: 1 });
    expect(result.current.started).toBe(true);
    advance(350);
    expect(result.current.index).toBe(1);
  });

  it("skips a frame that is not ready and keeps time (Review Focus 1)", () => {
    const { result, readySet } = setup();
    readySet.delete(1);
    advance(350);
    expect(result.current.index).toBe(2);
  });

  it("holds when nothing ahead is ready, then moves as soon as readyVersion changes", () => {
    const readySet = new Set<number>([0, 1, 2, 3]);
    const { result, rerender, options } = setup({ isReady: (i) => readySet.has(i) });
    advance(350 * 3);
    expect(result.current.index).toBe(3);
    advance(350);
    expect(result.current.index).toBe(3); // nothing to go to
    readySet.add(4);
    rerender({ ...options, isReady: (i) => readySet.has(i), readyVersion: 1 });
    advance(350);
    expect(result.current.index).toBe(4);
  });

  it("prev is the frame just left, for the leaving layer", () => {
    const { result } = setup();
    expect(result.current.prev).toBeNull();
    advance(350);
    expect(result.current.prev).toBe(0);
  });

  it("skip() fires onFirstPass once, now, and the pictures keep moving", () => {
    const { result, onFirstPass } = setup();
    act(() => result.current.skip());
    act(() => result.current.skip());
    expect(onFirstPass).toHaveBeenCalledTimes(1);
    advance(350);
    expect(result.current.index).toBe(1);
  });

  it("restart() returns to 0 and re-arms the first pass", () => {
    const { result, onFirstPass } = setup();
    act(() => result.current.skip());
    advance(350 * 3);
    act(() => result.current.restart());
    expect(result.current.index).toBe(0);
    advance(350 * 12);
    expect(onFirstPass).toHaveBeenCalledTimes(2);
  });

  it("advance(±1) steps and re-arms the timer from now", () => {
    const { result } = setup();
    advance(300);
    act(() => result.current.advance(1));
    expect(result.current.index).toBe(1);
    advance(100); // the pending 50 ms must not fire
    expect(result.current.index).toBe(1);
    advance(250);
    expect(result.current.index).toBe(2);
    act(() => result.current.advance(-1));
    act(() => result.current.advance(-1));
    expect(result.current.index).toBe(0);
    act(() => result.current.advance(-1));
    expect(result.current.index).toBe(11);
  });

  it("changing tempo re-arms at the new cadence (the gear change behind the sheet)", () => {
    const { result, rerender, options } = setup();
    advance(350);
    rerender({ ...options, tempo: TEMPOS.dissolve });
    advance(350);
    expect(result.current.index).toBe(1);
    advance(6000);
    expect(result.current.index).toBe(2);
  });
});

describe("useReel — dissolve", () => {
  it("2 frames then the sheet: onFirstPass after the second picture has held", () => {
    const { result, onFirstPass } = setup({ tempo: TEMPOS.dissolve });
    advance(6000);
    expect(result.current.index).toBe(1);
    expect(onFirstPass).not.toHaveBeenCalled();
    advance(6000);
    expect(onFirstPass).toHaveBeenCalledTimes(1);
    expect(result.current.index).toBe(2);
  });

  it("with one picture (the fallback) the reel never steps but the first pass still fires", () => {
    const { result, onFirstPass } = setup({ count: 1, tempo: TEMPOS.dissolve, isReady: () => true });
    advance(6000 * 2);
    expect(result.current.index).toBe(0);
    expect(onFirstPass).toHaveBeenCalledTimes(1);
  });
});
```

Note the wrap semantics: under `cut`, `firstPass: 12` with 12 pictures → after the 12th frame
has held the reel wraps to 0 and fires. Under `dissolve` with 12 pictures, after 2 frames it
fires and continues to index 2 — the first pass is a *count of frames shown*, not a lap.

- [ ] **Step 10: Run, expect failure.**

- [ ] **Step 11: `use-reel.ts`**

```ts
"use client";

import * as React from "react";

import type { Tempo } from "./tempos";

// The reel's clock (docs/DESIGN_landing-redo.md D5), separated from anything that paints — the
// same split `use-slideshow.ts` (5.11, now deleted) made, for the same two reasons: the whole
// contract is testable with fake timers, and the component has no timers in it at all.
//
// One setTimeout per frame, keyed on the index and an `epoch`, never setInterval (StrictMode
// double-invokes updaters; a chained timeout re-armed by the effect's own cleanup can never leave
// two timers alive). `epoch` bumps on every manual step/restart so the next automatic step is a
// full frame from *now*, and on every tempo change so the new cadence applies immediately.
//
// **Frame rules.** A frame whose picture is not ready is skipped, never shown blank; if nothing
// ahead is ready the reel holds and re-arms when `readyVersion` changes. The first pass is a
// count of frames shown (`tempo.firstPass`), fired exactly once per run through a ref — the
// StrictMode reason 5.11 recorded: the check has to be synchronous and outside an updater.

export interface ReelOptions {
  count: number;
  tempo: Tempo;
  /** `false` while the overture is playing; the gate is checked only once this is true. */
  enabled: boolean;
  isReady: (index: number) => boolean;
  /** Bumped by `usePictures` on every decode; a dependency, so a held reel wakes up. */
  readyVersion: number;
  onFirstPass: () => void;
}

export interface Reel {
  index: number;
  /** The frame just left, or null on the first. The leaving layer for a cross-fade. */
  prev: number | null;
  /** Whether the gate has opened. Until it has, the wordmark holds. */
  started: boolean;
  skip: () => void;
  restart: () => void;
  advance: (dir: 1 | -1) => void;
}

export function useReel({
  count,
  tempo,
  enabled,
  isReady,
  readyVersion,
  onFirstPass,
}: ReelOptions): Reel {
  const [index, setIndex] = React.useState(0);
  const [prev, setPrev] = React.useState<number | null>(null);
  const [started, setStarted] = React.useState(false);
  const [epoch, setEpoch] = React.useState(0);
  const shown = React.useRef(1); // frames shown this run, the first counts
  const firedRef = React.useRef(false);

  const onFirstPassRef = React.useRef(onFirstPass);
  React.useEffect(() => {
    onFirstPassRef.current = onFirstPass;
  }, [onFirstPass]);

  const fire = React.useCallback(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    onFirstPassRef.current();
  }, []);

  // The gate: enabled, and the first `gateFrames` pictures (or all of them, if fewer) ready.
  React.useEffect(() => {
    if (started || !enabled || count === 0) return;
    const need = Math.min(tempo.gateFrames, count);
    for (let i = 0; i < need; i++) if (!isReady(i)) return;
    setStarted(true);
  }, [started, enabled, count, tempo.gateFrames, isReady, readyVersion]);

  /** The next ready index after `from`, or null if none within a lap. */
  const nextReady = React.useCallback(
    (from: number, dir: 1 | -1): number | null => {
      for (let step = 1; step <= count; step++) {
        const i = (from + dir * step + count * step) % count;
        if (isReady(i)) return i;
      }
      return null;
    },
    [count, isReady],
  );

  const goTo = React.useCallback(
    (i: number) => {
      setIndex((cur) => {
        setPrev(cur);
        return i;
      });
      shown.current += 1;
      if (shown.current > tempo.firstPass) fire();
    },
    [tempo.firstPass, fire],
  );

  React.useEffect(() => {
    if (!started || count === 0) return;
    const timer = setTimeout(() => {
      // A one-picture reel (the fallback) has nowhere to go but still owes the sheet its cue.
      if (count === 1) {
        shown.current += 1;
        if (shown.current > tempo.firstPass) fire();
        setEpoch((e) => e + 1); // re-arm so a later firstPass change is honoured
        return;
      }
      const next = nextReady(index, 1);
      if (next === null) return; // hold; `readyVersion` in deps re-arms us
      goTo(next);
    }, tempo.frameMs);
    return () => clearTimeout(timer);
  }, [started, count, index, epoch, readyVersion, tempo.frameMs, tempo.firstPass, nextReady, goTo, fire]);

  const advance = React.useCallback(
    (dir: 1 | -1) => {
      if (count === 0) return;
      const next = nextReady(index, dir);
      if (next !== null) goTo(next);
      setEpoch((e) => e + 1);
    },
    [count, index, nextReady, goTo],
  );

  const restart = React.useCallback(() => {
    firedRef.current = false;
    shown.current = 1;
    setPrev(null);
    setIndex(0);
    setEpoch((e) => e + 1);
  }, []);

  return { index, prev, started, skip: fire, restart, advance };
}
```

`goTo` calls `setPrev` inside a `setIndex` updater — under StrictMode that updater runs twice
and `setPrev` is idempotent for the same `cur`, so this is safe; but `react-hooks` lint may
object to a setState inside an updater. If `bun run lint` does, restructure as one
`useReducer` holding `{ index, prev }` with a `GO` action — same tests, same contract.

- [ ] **Step 12: Run** → PASS. If a wrap/holding case is off by one, fix the hook, not the test —
the tests are the design's table.

- [ ] **Step 13: Commit**

```bash
bun run format:write
git add src/components/landing/tempos.ts src/components/landing/tempos.test.ts src/components/landing/use-pictures.ts src/components/landing/use-pictures.test.tsx src/components/landing/use-reel.ts src/components/landing/use-reel.test.tsx
git commit -m "feat(landing): two tempos as data, the decode tracker, and the reel clock with skip/hold rules (D5)"
```

---

### Task 4: The overture — Inter, the text collapse, its clock

**Files:**
- Modify: `src/lib/fonts.ts`
- Create: `src/components/landing/use-overture.ts`, `src/components/landing/use-overture.test.tsx`
- Create: `src/components/landing/overture.tsx`, `src/components/landing/overture.test.tsx`

**Interfaces:**
- Produces: `inter` (next/font), `OVERTURE = { fadeInMs: 500, holdMs: 1400, collapseMs: 2200, tailFadeMs: 1600 }`, `OVERTURE_MS = 3600`, `useOverture(enabled: boolean) → { phase: "in" | "collapse" | "done" }`, `<Overture phase onDone? tailVisible? />` renders the line; `WORDMARK = "AMBIT"`, `TAGLINE = " — A quieter way to be curious."`

- [ ] **Step 1: Inter** — in `src/lib/fonts.ts` add:

```ts
import { Inter, Sora } from "next/font/google";

// Inter, for the landing's overture only (docs/DESIGN_landing-redo.md D4). The reference is ABC
// Diatype, a commercial grotesque; Inter is the nearest face we can ship, and Sora — the app's
// one face — is geometric enough to read as a different idea. One static weight, latin only:
// ~25 KB of woff2, self-hosted by next/font, preloaded by whichever component imports it. Not
// on <html>: the app has one font token and this is not a second one, it is one screen's voice.
export const inter = Inter({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--font-inter",
});
```

`overture.tsx` applies `inter.className` on its root. (CSP `font-src 'self'` covers self-hosted
files.)

- [ ] **Step 2: `use-overture` test** (`// @vitest-environment jsdom`, fake timers, `renderHook`):

```ts
// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OVERTURE, OVERTURE_MS, useOverture } from "./use-overture";

const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useOverture", () => {
  it("runs in → collapse at holdMs → done at holdMs + collapseMs (3.6 s)", () => {
    const { result } = renderHook(() => useOverture(true));
    expect(result.current.phase).toBe("in");
    advance(OVERTURE.holdMs - 1);
    expect(result.current.phase).toBe("in");
    advance(1);
    expect(result.current.phase).toBe("collapse");
    advance(OVERTURE.collapseMs - 1);
    expect(result.current.phase).toBe("collapse");
    advance(1);
    expect(result.current.phase).toBe("done");
    expect(OVERTURE_MS).toBe(3600);
  });

  it("is done on the first render when disabled — no flash, not a fast-forward (Review Focus 3)", () => {
    const { result } = renderHook(() => useOverture(false));
    expect(result.current.phase).toBe("done");
  });

  it("pins the reference's numbers", () => {
    expect(OVERTURE).toEqual({ fadeInMs: 500, holdMs: 1400, collapseMs: 2200, tailFadeMs: 1600 });
  });
});
```

- [ ] **Step 3: Run, expect failure.** Then `use-overture.ts`:

```ts
"use client";

import * as React from "react";

// The overture's clock (docs/DESIGN_landing-redo.md D4), read off doorofperception.com/explore's
// `runIntro`: the line fades in, holds, the tail collapses over 2.2 s, and the reel cuts in the
// frame the collapse ends. No click — the reference waits for a gesture because it plays sound.
export const OVERTURE = {
  fadeInMs: 500,
  holdMs: 1400,
  collapseMs: 2200,
  tailFadeMs: 1600,
} as const;
/** When the reel may cut in. */
export const OVERTURE_MS = OVERTURE.holdMs + OVERTURE.collapseMs;

export type OverturePhase = "in" | "collapse" | "done";

/** `enabled: false` (reduced motion, `/reset-password`) is `done` from the first render: the
 *  wordmark must not flash on a screen that arrives with the sheet up. */
export function useOverture(enabled: boolean): { phase: OverturePhase } {
  const [phase, setPhase] = React.useState<OverturePhase>(enabled ? "in" : "done");
  React.useEffect(() => {
    if (!enabled) return;
    const a = setTimeout(() => setPhase("collapse"), OVERTURE.holdMs);
    const b = setTimeout(() => setPhase("done"), OVERTURE_MS);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [enabled]);
  return { phase };
}
```

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: `Overture` component test** (`// @vitest-environment jsdom`, `render`/`screen`):

```ts
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Overture, TAGLINE, WORDMARK } from "./overture";

vi.mock("~/lib/fonts", () => ({ inter: { className: "font-inter-test" } }));

describe("Overture", () => {
  it("renders the wordmark and the tail as separate spans in the reference's order", () => {
    render(<Overture phase="in" />);
    const line = screen.getByTestId("overture");
    expect(line.textContent).toBe(`${WORDMARK}${TAGLINE}`);
    expect(screen.getByTestId("overture-tail").textContent).toBe(TAGLINE);
    expect(line.className).toContain("font-inter-test");
    expect(WORDMARK).toBe("AMBIT");
    expect(TAGLINE).toBe(" — A quieter way to be curious.");
  });

  it("collapse clips and fades the tail and drifts the wordmark by half the tail's width — transform/clip-path only", () => {
    const { rerender } = render(<Overture phase="in" />);
    const tail = screen.getByTestId("overture-tail");
    Object.defineProperty(tail, "getBoundingClientRect", { value: () => ({ width: 300 }) });
    rerender(<Overture phase="collapse" />);
    expect(tail.style.clipPath).toBe("inset(0 100% 0 0)");
    expect(tail.style.opacity).toBe("0");
    const mark = screen.getByTestId("overture-mark");
    expect(mark.style.transform).toBe("translateX(150px)");
    expect(tail.style.transition).not.toMatch(/width|left|margin/);
  });

  it("done: the tail is gone and the mark stays, over the pictures in difference blend", () => {
    render(<Overture phase="done" />);
    expect(screen.queryByTestId("overture-tail")).not.toBeInTheDocument();
    expect(screen.getByTestId("overture-mark").className).toContain("mix-blend-difference");
  });

  it("hidden: nothing renders (the sheet is up)", () => {
    render(<Overture phase="done" hidden />);
    expect(screen.queryByTestId("overture")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run, expect failure.** Then `overture.tsx`:

```tsx
"use client";

import * as React from "react";

import { inter } from "~/lib/fonts";
import { cn } from "~/lib/utils";

import { OVERTURE, type OverturePhase } from "./use-overture";

// The opening line (docs/DESIGN_landing-redo.md D4): `AMBIT — A quieter way to be curious.` on
// black, whose tail collapses into the wordmark; the wordmark then stays over the reel in
// `mix-blend-mode: difference` at fixed size. Copied from the reference's `#intro-text`, with one
// deliberate difference: the reference collapses the tail with a `width` transition, which moves
// its siblings and is counted as layout shift. Here the tail is clipped (`clip-path`) and faded,
// and the wordmark is translated by half the tail's measured width — the same motion, compositor
// only, CLS 0.
//
// The wordmark element is the same DOM node from the first frame to the last, so the cut into
// the pictures never re-lays it out: only the ground behind it changes.

export const WORDMARK = "AMBIT";
export const TAGLINE = " — A quieter way to be curious.";

export interface OvertureProps {
  phase: OverturePhase;
  /** The sheet is up: nothing renders. */
  hidden?: boolean;
}

export function Overture({ phase, hidden = false }: OvertureProps) {
  const tailRef = React.useRef<HTMLSpanElement>(null);
  const [drift, setDrift] = React.useState(0);

  // Measured once, when the collapse begins: half the tail's width is how far the centre-anchored
  // line's wordmark has to move to end up centred on its own.
  React.useLayoutEffect(() => {
    if (phase === "collapse" && tailRef.current) {
      setDrift(tailRef.current.getBoundingClientRect().width / 2);
    }
  }, [phase]);

  if (hidden) return null;
  const collapsing = phase !== "in";

  return (
    <div
      data-testid="overture"
      aria-hidden
      className={cn(
        inter.className,
        "pointer-events-none fixed inset-0 z-20 flex items-center justify-center text-white",
        "text-[clamp(15px,2vw,25px)] font-normal whitespace-nowrap",
      )}
      style={{
        // The line fades in (0.5 s) on mount; the fixed wrapper never moves.
        animation: `overture-in ${OVERTURE.fadeInMs}ms ease both`,
      }}
    >
      <span
        data-testid="overture-mark"
        className="mix-blend-difference inline-block tracking-[.32em]"
        style={{
          transform: `translateX(${drift}px)`,
          transition: collapsing
            ? `transform ${OVERTURE.collapseMs}ms cubic-bezier(.4,0,.2,1)`
            : "none",
          willChange: "transform",
        }}
      >
        {WORDMARK}
      </span>
      {phase !== "done" ? (
        <span
          ref={tailRef}
          data-testid="overture-tail"
          className="inline-block tracking-[.02em] whitespace-pre"
          style={{
            clipPath: collapsing ? "inset(0 100% 0 0)" : "inset(0)",
            opacity: collapsing ? 0 : 1,
            transition: collapsing
              ? `clip-path ${OVERTURE.collapseMs}ms cubic-bezier(.4,0,.2,1), opacity ${OVERTURE.tailFadeMs}ms ease`
              : "none",
          }}
        >
          {TAGLINE}
        </span>
      ) : null}
    </div>
  );
}
```

Add to `src/styles/globals.css` (next to the other keyframes):

```css
@keyframes overture-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

`mix-blend-difference` is a Tailwind v4 utility (`mix-blend-mode: difference`). `tracking-[.32em]`
is literal. jsdom does not compute `transform` from a class, so the test reads inline `style` —
which is also why the transform is inline.

- [ ] **Step 7: Run** → PASS.

- [ ] **Step 8: Commit**

```bash
bun run format:write
git add src/lib/fonts.ts src/components/landing/use-overture.ts src/components/landing/use-overture.test.tsx src/components/landing/overture.tsx src/components/landing/overture.test.tsx src/styles/globals.css
git commit -m "feat(landing): the overture — Inter, the reference's text collapse as clip-path + transform, its clock (D4)"
```

---

### Task 5: The reel layers, the screen, the server pick, the deletions

**Files:**
- Create: `src/components/landing/landing-reel.tsx`, `src/components/landing/landing-reel.test.tsx`
- Rewrite: `src/components/landing/landing-screen.tsx`, `src/components/landing/landing-screen.test.tsx`
- Modify: `src/app/page.tsx`, `src/app/reset-password/page.tsx`
- Create: `public/landing/fallback.webp`; delete `public/landing/*.jpg`
- Delete: `src/components/landing/landing-slides.ts`, `landing-slides.test.ts`, `landing-slideshow.tsx`, `use-slideshow.ts`, `use-slideshow.test.tsx`
- Modify: `src/lib/sw-rules.test.ts` (the `/landing/great-wave.jpg` fixtures → `/landing/fallback.webp`)

**Interfaces:**
- Consumes: `getReel`, `ReelPicture`, `FALLBACK_PICTURE` (Task 1); `TEMPOS`, `resolveTempo`, `wantedAhead`, `Tempo` (Task 3); `usePictures`, `REEL_SIZES`, `useReel` (Task 3); `Overture`, `useOverture` (Task 4); `feedDebugEnabled` (existing); `preload` from `react-dom`.
- Produces: `<LandingReel pictures index prev tempo started onTap? />`, `LandingScreenProps = { mode: "cycle" | "static"; pictures: ReelPicture[]; tempo: Tempo; children }`

- [ ] **Step 1: The fallback file** — before deleting anything:

```bash
bun -e "import sharp from 'sharp'; await sharp('public/landing/great-wave.jpg').resize({width:960,height:960,fit:'inside',withoutEnlargement:true}).webp({quality:76}).toFile('public/landing/fallback.webp'); console.log((await sharp('public/landing/fallback.webp').metadata()).width)"
ls -l public/landing/fallback.webp   # expect ~50–80 KB
git rm public/landing/*.jpg
```

- [ ] **Step 2: `LandingReel` test** (`// @vitest-environment jsdom`):

```ts
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LandingReel } from "./landing-reel";
import { TEMPOS } from "./tempos";

const pics = Array.from({ length: 5 }, (_, i) => ({
  id: `p${i}`, src: `/api/img/p${i}?w=960`, srcSet: `/api/img/p${i}?w=960 960w, /api/img/p${i} 1600w`,
}));
const imgs = () => Array.from(document.querySelectorAll("[data-testid='landing-reel'] img"));

describe("LandingReel", () => {
  it("mounts at most three layers — leaving, current, next — keyed by id", () => {
    render(<LandingReel pictures={pics} index={2} prev={1} tempo={TEMPOS.dissolve} started />);
    expect(imgs().map((i) => i.getAttribute("data-id"))).toEqual(["p1", "p2", "p3"]);
  });

  it("the current layer is opaque, the others transparent; the fade is the tempo's", () => {
    render(<LandingReel pictures={pics} index={2} prev={1} tempo={TEMPOS.dissolve} started />);
    const [leaving, current, next] = imgs() as HTMLElement[];
    expect(current!.style.opacity).toBe("1");
    expect(leaving!.style.opacity).toBe("0");
    expect(next!.style.opacity).toBe("0");
    expect(current!.style.transition).toContain("opacity 2500ms");
  });

  it("cut: no transition at all — a hard cut", () => {
    render(<LandingReel pictures={pics} index={1} prev={0} tempo={TEMPOS.cut} started />);
    const current = imgs()[1] as HTMLElement;
    expect(current.style.transition).toBe("none");
    expect(current.style.animation).toBe("");
  });

  it("dissolve: the current layer drifts (transform only)", () => {
    render(<LandingReel pictures={pics} index={1} prev={0} tempo={TEMPOS.dissolve} started />);
    const current = imgs()[1] as HTMLElement;
    expect(current.style.animation).toContain("reel-drift 8500ms"); // frameMs + fadeMs
  });

  it("carries srcset and sizes on every layer, and none for a data: picture", () => {
    render(<LandingReel pictures={[{ id: "d", src: "data:image/png;base64,AA", srcSet: null }]} index={0} prev={null} tempo={TEMPOS.cut} started />);
    const img = imgs()[0]!;
    expect(img.getAttribute("srcset")).toBeNull();
    expect(img.getAttribute("sizes")).toBeNull();
    render(<LandingReel pictures={pics} index={0} prev={null} tempo={TEMPOS.cut} started />);
    const proxied = imgs().find((i) => i.getAttribute("data-id") === "p0")!;
    expect(proxied.getAttribute("srcset")).toBe(pics[0]!.srcSet);
    expect(proxied.getAttribute("sizes")).toBe("(min-width: 768px) 100vw, 50vw");
  });

  it("before start: the ground is black and every layer is transparent (the overture is on top)", () => {
    render(<LandingReel pictures={pics} index={0} prev={null} tempo={TEMPOS.cut} started={false} />);
    expect((imgs()[0] as HTMLElement).style.opacity).toBe("0");
    expect(screen.getByTestId("landing-reel").style.background).toBe("rgb(0, 0, 0)");
  });

  it("no grade: no filter on any layer (D5)", () => {
    render(<LandingReel pictures={pics} index={0} prev={null} tempo={TEMPOS.cut} started />);
    for (const i of imgs()) expect((i as HTMLElement).style.filter).toBe("");
  });

  it("tap calls onTap", () => {
    const onTap = vi.fn();
    render(<LandingReel pictures={pics} index={0} prev={null} tempo={TEMPOS.cut} started onTap={onTap} />);
    fireEvent.click(screen.getByTestId("landing-reel"));
    expect(onTap).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run, expect failure.** Then `landing-reel.tsx`:

```tsx
"use client";

import type { ReelPicture } from "~/server/services/landing-pool";

import type { Tempo } from "./tempos";
import { REEL_SIZES } from "./use-pictures";

// The reel's pixels, and nothing else — no timers, no state (docs/DESIGN_landing-redo.md D5).
// `LandingScreen` owns the index; this paints the layers.
//
// **Three layers, not the whole reel.** A cross-fade needs both frames mounted at once, and
// swapping one `<img src>` gives a blank flash (the browser drops the decoded bitmap the moment
// the attribute changes) — 5.11's reason for mounting all eight. With `usePictures` decoding
// ahead off-DOM, three is enough: the one leaving, the one showing, the one next. Keyed by id so
// React keeps each element (and its bitmap) across re-renders.
//
// **The ground is pure black** (`#000`, not the app's warm near-black): the reference's cut from
// black into colour is part of the effect, and the overture sits on it. No grade — 5.11's
// `saturate(.72) contrast(1.06)` made eight postcards read as one surface; the reference's
// pictures are in their own colour.

export interface LandingReelProps {
  pictures: readonly ReelPicture[];
  index: number;
  prev: number | null;
  tempo: Tempo;
  /** Until the gate opens every layer is transparent and the overture owns the screen. */
  started: boolean;
  onTap?: () => void;
}

export function LandingReel({ pictures, index, prev, tempo, started, onTap }: LandingReelProps) {
  const n = pictures.length;
  const next = n > 1 ? (index + 1) % n : null;
  const layers = [prev, index, next].filter(
    (i, k, arr): i is number => i !== null && arr.indexOf(i) === k,
  );
  const cut = tempo.fadeMs === 0;

  return (
    <div
      data-testid="landing-reel"
      aria-hidden
      onClick={onTap}
      className="fixed inset-0 overflow-hidden"
      style={{ background: "#000" }}
    >
      {layers.map((i) => {
        const p = pictures[i]!;
        const current = started && i === index;
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={p.id}
            data-id={p.id}
            src={p.src}
            srcSet={p.srcSet ?? undefined}
            sizes={p.srcSet ? REEL_SIZES : undefined}
            alt=""
            decoding="async"
            className="absolute inset-0 size-full object-cover"
            style={{
              opacity: current ? 1 : 0,
              transition: cut ? "none" : `opacity ${tempo.fadeMs}ms ease`,
              animation:
                tempo.drift && current
                  ? `reel-drift ${tempo.frameMs + tempo.fadeMs}ms linear both`
                  : undefined,
              willChange: "opacity, transform",
            }}
          />
        );
      })}

      {/* Darkens the bottom so the sheet's edge and the glyph stay legible over whatever picture
          is underneath. Lighter at the top than 5.11's: the wordmark inverts its ground itself. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 80%, rgba(0,0,0,0.85) 100%)",
        }}
      />
    </div>
  );
}
```

Add to `globals.css`:

```css
/* The dissolve tempo's drift: transform only, so it composites (docs/DESIGN_landing-redo.md D5). */
@keyframes reel-drift {
  from { transform: scale(1); }
  to { transform: scale(1.06); }
}
```

(The existing reduced-motion block collapses durations app-wide; the landing's reduced-motion
path renders a static frame anyway, D6.)

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: `LandingScreen` test** — rewrite `landing-screen.test.tsx`. Keep its `stubEnvironment` (matchMedia + `decode`), its `sheet()` helper and the `key`/`advance` helpers; drop the `landing-slides` import. The new `renderScreen` takes pictures and a tempo:

```ts
import { LandingScreen } from "./landing-screen";
import { TEMPOS } from "./tempos";
import { OVERTURE_MS } from "./use-overture";

const pics = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, src: `/api/img/p${i}?w=960`, srcSet: `/api/img/p${i}?w=960 960w, /api/img/p${i} 1600w` }));

async function renderScreen(mode: "cycle" | "static" = "cycle", tempo = TEMPOS.cut, pictures = pics(12)) {
  const view = render(
    <LandingScreen mode={mode} pictures={pictures} tempo={tempo}>
      <form data-testid="auth-child" />
    </LandingScreen>,
  );
  // Let the Image() decodes (stubbed to resolve) settle so `ready` fills.
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return view;
}
const currentId = () =>
  (Array.from(document.querySelectorAll("[data-testid='landing-reel'] img")) as HTMLElement[])
    .find((i) => i.style.opacity === "1")?.getAttribute("data-id") ?? null;
```

`stubEnvironment` must also stub `Image` so `usePictures`'s decodes resolve: reuse the fake from
`use-pictures.test.tsx` but auto-resolving (`decode = () => Promise.resolve()`); and stub
`navigator.connection` absent.

Cases:

```ts
describe("LandingScreen — cycle", () => {
  it("opens on the overture with no picture showing, the sheet down, the glyph offered", async () => {
    await renderScreen();
    expect(screen.getByTestId("overture")).toBeInTheDocument();
    expect(currentId()).toBeNull();
    expect(sheet()).toHaveAttribute("data-open", "false");
    expect(screen.getByRole("button", { name: "Open sign-in" })).toBeInTheDocument();
    expect(screen.getByTestId("auth-child")).toBeInTheDocument(); // the e2e hydration contract
  });

  it("cuts into the reel when the overture ends, and the tail is gone", async () => {
    await renderScreen();
    advance(OVERTURE_MS);
    expect(currentId()).toBe("p0");
    expect(screen.queryByTestId("overture-tail")).not.toBeInTheDocument();
    expect(screen.getByTestId("overture-mark")).toBeInTheDocument();
  });

  it("cut: after 12 frames the sheet rises, the mark hides, and the reel relaxes to dissolve", async () => {
    await renderScreen();
    advance(OVERTURE_MS);
    advance(350 * 12);
    expect(sheet()).toHaveAttribute("data-open", "true");
    expect(screen.queryByTestId("overture")).not.toBeInTheDocument();
    const before = currentId();
    advance(350);
    expect(currentId()).toBe(before); // no longer 350 ms frames
    advance(6000);
    expect(currentId()).not.toBe(before);
  });

  it("dissolve: two pictures then the sheet", async () => {
    await renderScreen("cycle", TEMPOS.dissolve);
    advance(OVERTURE_MS);
    advance(6000 * 2);
    expect(sheet()).toHaveAttribute("data-open", "true");
  });

  it("the glyph raises the sheet early and retires; the disc collapses it and restarts the reel from the top", async () => {
    await renderScreen();
    advance(OVERTURE_MS + 350 * 3);
    act(() => screen.getByRole("button", { name: "Open sign-in" }).click());
    expect(sheet()).toHaveAttribute("data-open", "true");
    expect(screen.queryByRole("button", { name: "Open sign-in" })).not.toBeInTheDocument();
    act(() => screen.getByRole("button", { name: "Back to the slideshow" }).click());
    expect(sheet()).toHaveAttribute("data-open", "false");
    expect(currentId()).toBe("p0");
  });

  it("tap = next; ←/→ step; arrows in a field do not", async () => {
    await renderScreen();
    advance(OVERTURE_MS);
    act(() => fireEvent.click(screen.getByTestId("landing-reel")));
    expect(currentId()).toBe("p1");
    key("ArrowRight");
    expect(currentId()).toBe("p2");
    key("ArrowLeft");
    expect(currentId()).toBe("p1");
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    key("ArrowRight");
    expect(currentId()).toBe("p1");
  });

  it("the one-picture fallback still hands off to the sheet", async () => {
    await renderScreen("cycle", TEMPOS.cut, [{ id: "fallback", src: "/landing/fallback.webp", srcSet: null }]);
    advance(OVERTURE_MS);
    expect(currentId()).toBe("fallback");
    advance(350 * 13);
    expect(sheet()).toHaveAttribute("data-open", "true");
  });

  it("shows the pitch", async () => {
    await renderScreen();
    expect(screen.getByText("A quieter way to be curious.")).toBeInTheDocument();
  });
});

describe("LandingScreen — static / reduced motion", () => {
  it("static: one still, no overture, sheet up, no glyph, no collapse disc", async () => {
    await renderScreen("static");
    expect(screen.queryByTestId("overture")).not.toBeInTheDocument();
    expect(currentId()).toBe("p0");
    expect(sheet()).toHaveAttribute("data-open", "true");
    expect(screen.queryByRole("button", { name: "Open sign-in" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back to the slideshow" })).not.toBeInTheDocument();
  });

  it("reduced motion on /: one still, sheet up after hydration, and the disc still works", async () => {
    stubEnvironment({ reduce: true });
    await renderScreen();
    expect(screen.queryByTestId("overture")).not.toBeInTheDocument();
    expect(sheet()).toHaveAttribute("data-open", "true");
    act(() => screen.getByRole("button", { name: "Back to the slideshow" }).click());
    expect(sheet()).toHaveAttribute("data-open", "false");
    advance(60_000);
    expect(currentId()).toBe("p0"); // never steps
  });

  it("Save-Data: the overture plays, then the first picture holds and the sheet still rises", async () => {
    Object.defineProperty(navigator, "connection", { configurable: true, value: { saveData: true } });
    await renderScreen();
    advance(OVERTURE_MS);
    expect(currentId()).toBe("p0");
    advance(350 * 13);
    expect(currentId()).toBe("p0");
    expect(sheet()).toHaveAttribute("data-open", "true");
  });
});
```

- [ ] **Step 6: Run, expect failure.** Then rewrite `landing-screen.tsx`:

```tsx
"use client";

import * as React from "react";

import { Logo } from "~/components/icons";
import { useMediaQuery } from "~/hooks/use-media-query";
import type { ReelPicture } from "~/server/services/landing-pool";

import { AuthSheet } from "./auth-sheet";
import { LandingReel } from "./landing-reel";
import { Overture } from "./overture";
import { TEMPOS, type Tempo, wantedAhead } from "./tempos";
import { useOverture } from "./use-overture";
import { usePictures } from "./use-pictures";
import { useReel } from "./use-reel";

// The landing screen (docs/DESIGN_landing-redo.md): an overture on black, a hard cut into a reel
// of the corpus's own pictures in one of two tempos, and the sign-in sheet. Shared by `/` and
// `/reset-password` — the reset page is the same screen with the show already over.
//
// **What changed from 5.11.** The server picks the reel (D2), so the imagery no longer waits for
// hydration and the first picture is in the HTML. What still must not reach the server's markup
// is the reader's reduced-motion answer and `saveData` (D8) — both read after the hydration
// boundary, exactly as 5.11 learned to on 09-10-26.

export interface LandingScreenProps {
  /** `"cycle"` — overture + reel, sheet rises after the first pass (`/`).
   *  `"static"` — one still, sheet open immediately, no overture (`/reset-password`). */
  mode: "cycle" | "static";
  pictures: ReelPicture[];
  tempo: Tempo;
  children: React.ReactNode;
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function isEditable(el: Element | null): boolean {
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    (el instanceof HTMLElement && el.isContentEditable)
  );
}

const subscribeToNothing = () => () => undefined;
const onClient = () => true;
const onServer = () => false;

/** `navigator.connection.saveData`, client-only (D6). Absent → false. */
function readSaveData(): boolean {
  const c = (navigator as { connection?: { saveData?: boolean } }).connection;
  return c?.saveData === true;
}

export function LandingScreen({ mode, pictures, tempo, children }: LandingScreenProps) {
  const hydrated = React.useSyncExternalStore(subscribeToNothing, onClient, onServer);
  const reduce = useMediaQuery(REDUCED_MOTION);
  const isStatic = mode === "static" || reduce;
  const saveData = React.useSyncExternalStore(subscribeToNothing, readSaveData, () => false);

  // The reader's own say about the sheet, once they've had one; until then the mode decides.
  const [opened, setOpened] = React.useState<boolean | null>(null);
  const open = hydrated && (opened ?? isStatic);

  // Static and reduced-motion readers get one still and no overture. Save-Data readers get the
  // overture and the first picture, then nothing moves (the reel is one picture long to the hook).
  const shown = React.useMemo(
    () => (isStatic || saveData ? pictures.slice(0, 1) : pictures),
    [isStatic, saveData, pictures],
  );

  const { phase } = useOverture(hydrated && !isStatic);

  // Behind the sheet the reel changes gear (D5) — the same hook, a different tempo.
  const effectiveTempo = open ? TEMPOS[tempo.behindSheet] : tempo;

  // `usePictures` needs the reel's index and `useReel` needs what `usePictures` decoded — a cycle
  // between two hooks. Broken by mirroring the index into state one render late: the decode
  // tracker is always ≤ one frame behind, which at one-ahead prefetch is nothing.
  const [picIndex, setPicIndex] = React.useState(0);
  const { ready, version } = usePictures(shown, isStatic ? 0 : picIndex, wantedAhead(effectiveTempo));

  const reel = useReel({
    count: isStatic ? 0 : shown.length,
    tempo: effectiveTempo,
    enabled: hydrated && phase === "done",
    isReady: (i) => (shown[i] ? ready.has(shown[i].id) : false),
    readyVersion: version,
    onFirstPass: () => setOpened(true),
  });
  React.useEffect(() => {
    setPicIndex(reel.index);
  }, [reel.index]);

  const { advance } = reel;
  const collapse = () => {
    setOpened(false);
    reel.restart();
  };

  React.useEffect(() => {
    if (isStatic) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.metaKey || e.ctrlKey) return;
      if (isEditable(document.activeElement)) return;
      if (e.key === "ArrowRight") advance(1);
      else if (e.key === "ArrowLeft") advance(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isStatic, advance]);

  return (
    <div className="relative min-h-dvh overflow-hidden" style={{ background: "#000" }}>
      <LandingReel
        pictures={shown}
        index={isStatic ? 0 : reel.index}
        prev={isStatic ? null : reel.prev}
        tempo={effectiveTempo}
        started={isStatic || reel.started}
        onTap={isStatic ? undefined : () => advance(1)}
      />

      {!isStatic ? <Overture phase={phase} hidden={open} /> : null}

      {hydrated && mode !== "static" && !open ? (
        <button
          type="button"
          aria-label="Open sign-in"
          onClick={reel.skip}
          className="border-ink/14 fixed bottom-[28px] left-1/2 z-20 flex size-[54px] -translate-x-1/2 items-center justify-center rounded-full border backdrop-blur-[14px]"
          style={{ background: "rgba(27,24,21,0.72)", boxShadow: "0 10px 30px rgba(0,0,0,0.4)" }}
        >
          <Logo size={30} className="text-accent" />
        </button>
      ) : null}

      <AuthSheet
        open={open}
        onCollapse={mode === "static" ? undefined : collapse}
        showHero={mode !== "static"}
      >
        {children}
      </AuthSheet>
    </div>
  );
}
```

The `Save-Data` reduction to one picture makes `useReel` a one-picture reel, whose timer still
fires `onFirstPass` after `firstPass` ticks (tested in Task 3) — so the sheet still rises.

- [ ] **Step 7: Run** → PASS. (`react-hooks/set-state-in-effect` may object to the `setPicIndex`
effect; if it does, disable the rule on that line with the comment above as the reason.)

- [ ] **Step 8: The RSC and the preloads** — `src/app/page.tsx`:

```tsx
import { preload } from "react-dom";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AuthCard } from "~/components/landing/auth-card";
import { LandingScreen } from "~/components/landing/landing-screen";
import { resolveTempo } from "~/components/landing/tempos";
import { REEL_SIZES } from "~/components/landing/use-pictures";
import { auth } from "~/lib/auth";
import { feedDebugEnabled } from "~/server/services/feed-debug";
import { getReel } from "~/server/services/landing-pool";

// The landing (docs/DESIGN_landing-redo.md). A Server Component, as before, for the session
// bounce; now also for the reel: the server picks the pictures (D2), so the first ones are
// `<link rel="preload">`s in the HTML and the first `<img>` is in the markup — nothing about the
// imagery waits for hydration. `?tempo=` is honoured only under the dev gate (D5), the same
// function that gates /dev/feed, so a production build ignores it.
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ tempo?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect("/feed");

  const { tempo: tempoParam } = await searchParams;
  const tempo = resolveTempo(tempoParam, await feedDebugEnabled());
  const pictures = await getReel();

  // The budget's "preloaded from <head>" line: the gate's worth of pictures for the chosen tempo,
  // with the same srcset/sizes as the <img> so the browser's choice and cache key match.
  for (const p of pictures.slice(0, tempo.gateFrames)) {
    if (p.srcSet) {
      preload(p.src, { as: "image", fetchPriority: "high", imageSrcSet: p.srcSet, imageSizes: REEL_SIZES });
    } else {
      preload(p.src, { as: "image", fetchPriority: "high" });
    }
  }

  return (
    <LandingScreen mode="cycle" pictures={pictures} tempo={tempo}>
      <AuthCard />
    </LandingScreen>
  );
}
```

`preload` with `imageSrcSet`/`imageSizes` is React 19's documented signature (the same `preload`
`app/i/[itemId]/page.tsx` already uses). Skip the preload for a `data:` src — it is inline
already: `if (p.src.startsWith("data:")) continue;`.

`src/app/reset-password/page.tsx`: import `getReel` and `TEMPOS`, `const [still] = await getReel(1)`,
and render `<LandingScreen mode="static" pictures={[still!]} tempo={TEMPOS.cut}>`.

- [ ] **Step 9: Delete the old files and fix the SW test**

```bash
git rm src/components/landing/landing-slides.ts src/components/landing/landing-slides.test.ts src/components/landing/landing-slideshow.tsx src/components/landing/use-slideshow.ts src/components/landing/use-slideshow.test.tsx
```

In `src/lib/sw-rules.test.ts` replace both `/landing/great-wave.jpg` fixtures with
`/landing/fallback.webp`; update the `isStaticAsset` doc comment in `sw-rules.ts` ("the landing's
one fallback picture and the app icons"). Grep `landing-slides|LANDING_SLIDES|preloadRun|SLIDE_MS`
across `src/` and `docs/` — `src/` must be clean; leave `docs/` history alone.

- [ ] **Step 10: The whole suite** — `bun run typecheck && bun run lint && bun run test` green
(minus the known reds). `bun run dev`, open `http://localhost:3000/` in Firefox and Chromium:
black → line → collapse → cut → 12 frames → sheet; `?tempo=dissolve` → slow fade + drift; the
glyph, the disc, tap, ←/→. Check the served HTML has the preload links:
`curl -s localhost:3000/ | grep -o '<link rel="preload"[^>]*>' | head`.

- [ ] **Step 11: Commit**

```bash
bun run format:write
git add -A src/components/landing src/app/page.tsx src/app/reset-password/page.tsx public/landing src/lib/sw-rules.ts src/lib/sw-rules.test.ts src/styles/globals.css
git commit -m "feat(landing): the reel screen — server-picked pictures, preloads, ?tempo under the dev gate, 5.11's slides deleted (D2, D5, D6, D8)"
```

---

### Task 6: e2e — the reel's contract, landing-eligible fixtures, CI's shape

**Files:**
- Modify: `e2e/home.spec.ts`, `e2e/support.ts`

- [ ] **Step 1: A landing-eligible fixture helper** — in `e2e/support.ts`, beside `seedFeedCorpus`:

```ts
/**
 * Seeds `count` pictures the landing may draw (docs/DESIGN_landing-redo.md D1): image, score 9,
 * an exact landing licence, the inline PIXEL. On CI's fixture-only database the pool is otherwise
 * empty and `/` shows its one fallback picture — which is a real branch worth exercising, but
 * "the picture changes" needs at least two. No `item_topic` rows: these are for `/`, not the feed.
 */
export async function seedLandingPool(conn: Connection, prefix: string, count: number): Promise<void> {
  await conn.db
    .insert(conn.item)
    .values(
      Array.from({ length: count }, (_, i) => ({
        source: "met",
        sourceId: `${prefix}landing-${i}`,
        type: "image" as const,
        title: `Landing fixture ${i}`,
        summary: "A public-domain picture, seeded for the landing reel.",
        imageUrl: PIXEL,
        sourceUrl: `https://example.test/${prefix}landing-${i}`,
        license: "CC0 1.0 (public domain)",
        curationScore: 9,
      })),
    )
    .onConflictDoNothing();
}
```

(`cleanupSeeded(conn, prefix)` already deletes by prefix, so it covers these.)

- [ ] **Step 2: Rewrite `e2e/home.spec.ts`** — keep the console-errors test; replace the three
slideshow tests:

```ts
import { expect, test } from "@playwright/test";

import { cleanupSeeded, connect, openAuthSheet, seedLandingPool } from "./support";

const PREFIX = "home-";

test.beforeAll(async () => {
  const conn = await connect();
  await seedLandingPool(conn, PREFIX, 6);
  await conn.close();
});
test.afterAll(async () => {
  const conn = await connect();
  await cleanupSeeded(conn, PREFIX);
  await conn.close();
});

test("home page renders with no console errors", async ({ page }) => { /* unchanged */ });

// The landing is an overture (3.6 s) then a reel that hands off to the sheet (8.3). Both halves
// are pinned: it must complete on its own for a reader who waits, and be skippable for one who
// doesn't — the whole suite depends on the second (`openAuthSheet`).
test("the overture plays, the reel cuts in, and the sheet rises on its own", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("overture")).toBeVisible();
  await expect(page.getByTestId("overture-tail")).toBeHidden({ timeout: 6_000 }); // gone at the cut
  await expect
    .poll(async () =>
      page.locator("[data-testid='landing-reel'] img").evaluateAll((imgs) =>
        imgs.some((i) => getComputedStyle(i).opacity === "1")),
    , { timeout: 6_000 })
    .toBe(true);
  // cut: 3.6 s + 12 × 350 ms ≈ 8 s; dissolve: 3.6 + 12 s. 20 s covers either default.
  await expect(page.getByPlaceholder("you@example.com")).toBeInViewport({ timeout: 20_000 });
});

test("the glyph opens the sign-in sheet early", async ({ page }) => {
  await page.goto("/");
  await openAuthSheet(page);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeInViewport();
});

test("clicking the imagery changes the picture, and the pictures keep moving behind the sheet", async ({ page }) => {
  await page.goto("/");
  const visible = () =>
    page.locator("[data-testid='landing-reel'] img").evaluateAll((imgs) =>
      imgs.find((i) => getComputedStyle(i).opacity === "1")?.getAttribute("data-id") ?? null);
  await expect.poll(visible, { timeout: 6_000 }).toBeTruthy();
  const first = await visible();
  await page.locator("[data-testid='landing-reel']").click({ position: { x: 20, y: 20 }, force: true });
  await expect.poll(visible).not.toBe(first);

  await expect(page.getByPlaceholder("you@example.com")).toBeInViewport({ timeout: 20_000 });
  const behind = await visible();
  await expect.poll(visible, { timeout: 12_000 }).not.toBe(behind); // the dissolve gear: ≤ 8.5 s
});

test("the sheet's disc collapses it back to the reel, reduced motion included", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByTestId("overture")).toHaveCount(0);
  await expect(page.getByPlaceholder("you@example.com")).toBeInViewport({ timeout: 15_000 });
  await page.getByRole("button", { name: "Back to the slideshow" }).click();
  await expect(page.getByRole("button", { name: "Open sign-in" })).toBeVisible();
  await page.getByRole("button", { name: "Open sign-in" }).click();
  await expect(page.getByPlaceholder("you@example.com")).toBeInViewport();
  expect(consoleErrors).toEqual([]);
});

test("the served HTML preloads the first picture with its srcset", async ({ request }) => {
  const html = await (await request.get("/")).text();
  expect(html).toMatch(/<link rel="preload"[^>]*as="image"[^>]*>/);
});
```

(`connect`/`cleanupSeeded` — read `support.ts` for their exact names and the `Connection` shape;
match whatever `feed.spec.ts` does in its `beforeAll`.) The preload test asserts a `<link>`
exists; with PIXEL fixtures the `src` is `data:` and no preload is emitted — so on CI this test
needs the fallback path… **it does not:** the fixture pool is non-empty (6 PIXEL rows), so the
reel is PIXELs and no preload is emitted. Change the assertion to run only when the page's first
`<img>` is proxied: `if (!html.includes('src="/api/img/')) test.skip();` first. Locally against
the real corpus it asserts; on CI it skips, honestly.

- [ ] **Step 3: Run the suite** — `bun run e2e:prod` (everything, both projects). Then CI's shape
per CLAUDE.md's note (`docker run … postgres:17-alpine` on 5433, `db:migrate`, `db:seed`,
`build`, `E2E_PROD=1 bunx playwright test --workers 1`). The fallback branch: temporarily run
`home.spec.ts` with `seedLandingPool(conn, PREFIX, 0)` against the CI database once, watch the
first test pass on `/landing/fallback.webp`, and put the 6 back — or better, add a fifth test that
seeds nothing under its own prefix in a `test.describe` with its own `beforeAll`… the pool is
global, so it can't be empty while the other tests' rows exist. **Leave the fallback to the unit
tests (Task 1 and 5)** and note in the log that e2e never sees an empty pool.

- [ ] **Step 4: Commit**

```bash
bun run format:write
git add e2e/home.spec.ts e2e/support.ts
git commit -m "test(e2e): the landing's overture + reel contract; landing-eligible fixtures for CI"
```

---

### Task 7: Three candidate profile marks on `/dev/marks`

**Files:**
- Modify: `src/lib/avatar-hue.ts` (export `gradientForHue`)
- Create: `src/components/icons/marks.tsx`, `src/components/icons/marks.test.tsx`
- Create: `src/components/dev/marks-bench.tsx`, `src/app/dev/marks/page.tsx`

**Interfaces:**
- Produces: `gradientForHue(hue: number): string`; `OrbitMark`, `TerminatorMark`, `RingMark` — each `({ size, hue, className }: MarkProps)`, `MarkProps = { size: number; hue: number; className?: string }`

- [ ] **Step 1: Refactor `avatar-hue.ts`** — extract the gradient string so a mark can take a hue:

```ts
/** The two-stop gradient for a hue; `avatarGradient` is this over `avatarHue(userId)`. */
export function gradientForHue(hue: number): string {
  const second = (hue + 18) % 360;
  return `linear-gradient(150deg, hsl(${hue} 62% 72%), hsl(${second} 54% 46%))`;
}
export function avatarGradient(userId: string): string {
  return gradientForHue(avatarHue(userId));
}
```

Run `bun run vitest run src/lib/avatar-hue.test.ts` (if it exists — `ls src/lib/avatar-hue*`) → green, unchanged strings.

- [ ] **Step 2: Marks test** (`// @vitest-environment jsdom`):

```ts
// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OrbitMark, RingMark, TerminatorMark } from "./marks";

describe("candidate marks (D7)", () => {
  it.each([
    ["orbit", OrbitMark],
    ["terminator", TerminatorMark],
    ["ring", RingMark],
  ] as const)("%s renders an svg of `size`, hue-driven, aria-hidden", (_, Mark) => {
    const { container } = render(<Mark size={40} hue={200} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("40");
    expect(svg.getAttribute("height")).toBe("40");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(container.innerHTML).toContain("hsl(200");
  });

  it("orbit: the satellite's angle follows the hue, so two users differ in position as well as colour", () => {
    const a = render(<OrbitMark size={40} hue={0} />).container.querySelector("circle[data-satellite]")!;
    const b = render(<OrbitMark size={40} hue={180} />).container.querySelector("circle[data-satellite]")!;
    expect(a.getAttribute("cx")).not.toBe(b.getAttribute("cx"));
  });
});
```

- [ ] **Step 3: Run, expect failure.** Then `marks.tsx`:

```tsx
// Three candidate profile marks (docs/DESIGN_landing-redo.md D7) to replace `AvatarChip`'s
// gradient disc — a straight copy of Cosmos's. Same brief in each: abstract, no photograph, the
// user's hue from `avatar-hue.ts`, legible at 28 px in the pill and at 104 px on Edit profile.
// Ben picks on /dev/marks; the plan's Task 9 wires the winner into AvatarChip and deletes the rest.
import type { SVGProps } from "react";

export interface MarkProps extends Omit<SVGProps<SVGSVGElement>, "width" | "height"> {
  size: number;
  /** `avatarHue(userId)`, 0–359. */
  hue: number;
}

const light = (hue: number) => `hsl(${hue} 62% 72%)`;
const mid = (hue: number) => `hsl(${(hue + 18) % 360} 54% 46%)`;
const dark = (hue: number) => `hsl(${(hue + 18) % 360} 40% 22%)`;

/** 1. Orbit — the Logo's geometry made personal: a hue disc with the satellite on its rim at a
 *  per-user angle. Recommended. */
export function OrbitMark({ size, hue, ...rest }: MarkProps) {
  const id = `orbit-${hue}`;
  const a = (hue * Math.PI) / 180;
  const cx = 13 + 9.6 * Math.cos(a);
  const cy = 13 + 9.6 * Math.sin(a);
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden="true" {...rest}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={light(hue)} />
          <stop offset="1" stopColor={mid(hue)} />
        </linearGradient>
      </defs>
      <circle cx={13} cy={13} r={11.5} fill={`url(#${id})`} />
      <circle data-satellite cx={cx} cy={cy} r={2.4} fill="#0B0A08" stroke={light(hue)} strokeWidth={1} />
    </svg>
  );
}

/** 2. Terminator — a disc split light/dark along a per-user angle. */
export function TerminatorMark({ size, hue, ...rest }: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden="true" {...rest}>
      <circle cx={13} cy={13} r={11.5} fill={dark(hue)} />
      <path
        d="M13 1.5 A11.5 11.5 0 0 1 13 24.5 Z"
        fill={light(hue)}
        transform={`rotate(${hue} 13 13)`}
      />
    </svg>
  );
}

/** 3. Ring — the hue as a thick ring around a dark centre. */
export function RingMark({ size, hue, ...rest }: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden="true" {...rest}>
      <circle cx={13} cy={13} r={9.5} fill="none" stroke={light(hue)} strokeWidth={4} />
      <circle cx={13} cy={13} r={7.5} fill="#0B0A08" />
    </svg>
  );
}
```

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: The bench** — `src/components/dev/marks-bench.tsx` (client): a page with a
heading, and for each of six sample ids (`["ben", "alice", "kvetch", "u_7f3a", "persona-12",
"zz"]`) a row: the current `AvatarChip` at 28/32/88/104 px (with `avatarGradient(id)`), then
`OrbitMark`, `TerminatorMark`, `RingMark` at the same four sizes with `hue={avatarHue(id)}`.
Render the rows twice: once on the app ground, once inside a `div` with a full-bleed
`background-image: url(/api/img/<any warm id>)` or a plain photograph-like gradient — the marks
have to read over pictures (the rail toolbar sits over the feed). Column headers name the
candidates. Nothing interactive.

`src/app/dev/marks/page.tsx`:

```tsx
import { notFound } from "next/navigation";

import { MarksBench } from "~/components/dev/marks-bench";
import { feedDebugEnabled } from "~/server/services/feed-debug";

// Ben picks the profile mark here (docs/DESIGN_landing-redo.md D7). Same gate as /dev/feed — a
// production build with FEED_DEBUG unset is a 404. No session guard: nothing here is user data.
export default async function DevMarksPage() {
  if (!(await feedDebugEnabled())) notFound();
  return <MarksBench />;
}
```

- [ ] **Step 6: Look** — `bun run dev`, open `/dev/marks`, screenshot it for the log
(`.playwright-mcp/` is gitignored; or describe). `bun run build && bun run start` briefly and
confirm `/dev/marks` is a 404 without `FEED_DEBUG`.

- [ ] **Step 7: Commit**

```bash
bun run format:write
git add src/lib/avatar-hue.ts src/components/icons/marks.tsx src/components/icons/marks.test.tsx src/components/dev/marks-bench.tsx src/app/dev/marks/page.tsx
git commit -m "feat(dev): three candidate profile marks on /dev/marks — orbit, terminator, ring (D7)"
```

---

### Task 8: Evidence and words — Lighthouse, SPEC, BUILD_PLAN, CLAUDE.md, log; push

**Files:**
- Create: `docs/phase8.3-evidence/after-landing-cut.report.json`, `after-landing-dissolve.report.json`
- Modify: `.gitignore` (add `docs/phase8.3-evidence/*.html`), `SPEC.md`, `docs/BUILD_PLAN.md`, `CLAUDE.md`, `log.md`

- [ ] **Step 1: Lighthouse** — the baseline is 7.3's `docs/phase7.3-evidence/after-home.report.json`
(LCP 4.2 s, CLS 0). With `bun run build && bun run start` running (production build; `?tempo=`
is therefore ignored — so for the dissolve run temporarily set `DEFAULT_TEMPO = "dissolve"`,
rebuild, and set it back):

```bash
bunx lighthouse http://localhost:3000/ --only-categories=performance,accessibility \
  --form-factor=mobile --screenEmulation.mobile --throttling-method=simulate \
  --chrome-flags="--headless=new" --output=json --output=html \
  --output-path=docs/phase8.3-evidence/after-landing-cut
```

Record in the log: LCP, CLS, TBT, total bytes, the accessibility score, and the first-picture
timing read off the filmstrip (the "zero wait after the overture" line). **Expected:** LCP ≈ 3.6–
3.9 s, CLS 0, bytes well under 5.11's 1.6 MB. If CLS is not 0, the overture's collapse is
shifting layout — fix it in Task 4's component (a `width`/`margin` crept in), not with a number.

- [ ] **Step 2: SPEC §8.1** — rewrite the `/` bullet (line ~464): the overture, the corpus reel
(D1's rule in one sentence, the pool size), the two tempos and the dev-gated `?tempo=`, the
`w960` rendition, the sheet contract unchanged (mounted from first paint), reduced motion. In the
§10 PWA bullet (line ~524) change "`/landing/*` and the icons" to "the landing's fallback picture
and the icons". Add to §13's env/ops notes: `bun run img:warm --rendition 960 --landing` after a
deploy (Ben runs it in the container — write `.cache/landing-prod.sh` with the `docker exec` line,
per CLAUDE.md's "ship those as short scripts" rule).

- [ ] **Step 3: BUILD_PLAN 8.3 row** (line ~334): tick it as **built 09-2x-26, awaiting Ben's two
picks (tempo, mark)**; one line each on what shipped and what Task 9 does after the picks.

- [ ] **Step 4: CLAUDE.md** — in the "Repository status" paragraph, one sentence after the 8.2
sentence: 8.3 built on `feat/landing-redo` (date), the overture + corpus reel in two tempos,
`?tempo=` under `FEED_DEBUG`, the 960 rendition, `/dev/marks`; Ben's picks pending. Add to the
local-dev notes: *"A production build ignores `?tempo=`; to compare tempos on the tailnet device
pass, run the dev server (`FEED_DEBUG` defaults on there)."*

- [ ] **Step 5: `log.md`** — a new day entry (extend the day's if one exists): shipped, the two
Lighthouse readings, decisions taken during the build that differ from the plan, findings, open
(Ben's picks → Task 9). End with the session-spend line per CLAUDE.md's instructions (run the
script; omit the line if it exits non-zero).

- [ ] **Step 6: `bun run check`** green; `bun run e2e:prod` green; commit and push:

```bash
bun run format:write
git add docs/phase8.3-evidence/*.json .gitignore SPEC.md docs/BUILD_PLAN.md CLAUDE.md log.md .cache/landing-prod.sh
git commit -m "docs(8.3): Lighthouse evidence for both tempos; SPEC §8.1/§10/§13, BUILD_PLAN, CLAUDE.md, log"
git push -u origin feat/landing-redo
```

Do **not** merge. Ben reviews on the phone (tailnet, dev server, `?tempo=cut` then
`?tempo=dissolve`) and at 1440, and on `/dev/marks`.

---

### Task 9: After Ben's picks — flip the default, delete the loser, swap the mark

*Run only when Ben has named a tempo and a mark. Both halves are independent.*

**Files:**
- Modify: `src/components/landing/tempos.ts` (+ test), `src/components/landing/use-reel.test.tsx`, `src/components/landing/landing-screen.test.tsx`
- Modify: `src/components/ui/avatar-chip.tsx`, `src/components/icons/marks.tsx` (+ test), `src/components/ui/pill-toolbar.tsx`, `src/components/ui/rail-toolbar.tsx`, `src/components/profile/profile-hub.tsx`, `src/components/profile/profile-edit-screen.tsx`, `src/styles/globals.css`, `src/lib/utils.ts`; delete `src/components/dev/marks-bench.tsx`, `src/app/dev/marks/page.tsx`

- [ ] **Step 1 (tempo):** set `DEFAULT_TEMPO` to the pick. **If the pick is `dissolve`:** delete
`TEMPOS.cut`, narrow `TempoId` to `"dissolve"`, and delete the `cut` cases in `tempos.test.ts`,
`use-reel.test.tsx` and `landing-screen.test.tsx`. **If the pick is `cut`:** keep both objects
(`cut.behindSheet` names `dissolve`) and delete only the `dissolve` first-pass tests. Either way,
delete `resolveTempo`'s override branch and its test, and the `searchParams` read in
`app/page.tsx` — the comparison is over.

- [ ] **Step 2 (mark):** in `avatar-chip.tsx`, replace the gradient `<span>` with the chosen mark:
`AvatarChip` keeps its props (`size`, `gradient?`) for the callers' sake but now takes `hue?:
number` and renders `<OrbitMark size={size} hue={hue ?? DEFAULT_HUE} />` (the generic pill/rail
chip has no user → `DEFAULT_HUE = 232`, the old gradient's blue). Update the four callers:
`profile-hub.tsx` and `profile-edit-screen.tsx` pass `hue={avatarHue(me.data.id)}` instead of
`gradient=`; the pill and rail pass nothing. Delete `avatarGradient` if nothing else imports it
(`grep -rn avatarGradient src`), the `.bg-avatar-gradient` class in `globals.css` and its
registration in `lib/utils.ts`, the two losing marks and their test cases, the bench and its
route. Update `avatar-chip`'s header comment (it currently explains the gradient's tailwind-merge
trap — that history moves to the log).

- [ ] **Step 3:** `bun run check`, `bun run e2e:prod` (the `settings.spec` hub tests select on the
avatar block — re-read them). Commit:

```bash
git commit -am "feat(landing): DEFAULT_TEMPO = <pick>; the losing tempo and the ?tempo= override removed" 
git commit -am "feat(profile): AvatarChip is the <pick> mark — Cosmos's gradient disc retired (D7)"
```

Log the two picks with Ben's words, push, and hand the branch back for merge and deploy.
**Deploy note:** after the deploy, Ben runs `.cache/landing-prod.sh` (the rendition warm) — until
he does, the first reader after each deploy derives ~4 renditions on their own visit (a few
hundred ms of CPU each), which is fine but not free.

---

## Self-review against the spec

- **D1** → Task 1 (config + query + integration test). **D2** → Task 1 (memo, pick, fallback) +
  Task 5 (RSC, preloads). **D3** → Task 2. **D4** → Task 4 (+ CLS proof in Task 8). **D5** →
  Tasks 3, 5. **D6** → Task 5 (glyph/keys/reduced/saveData) + Task 6. **D7** → Task 7, Task 9.
  **D8** → Task 5's hydration flags. **D9** → nothing to do, by design. **Budget** → Task 8.
  **Deletions** → Task 5 step 9.
- **Review Focus** 1 → Task 3 (use-pictures "failed decode", use-reel "skips"); 2 → Task 2 route
  `it.each`; 3 → Task 4 `useOverture(false)`; 4 → Task 1 TTL test; 5 → Task 2 "never enlarges".
- **Types:** `ReelPicture { id, src, srcSet }` is used identically in Tasks 1, 3, 5, 6.
  `useReel` takes `{ count, tempo, enabled, isReady, readyVersion, onFirstPass }` in Tasks 3 and
  5. `REEL_SIZES` string is identical in Task 3's hook, Task 5's `<img>` and RSC preload, and
  Task 6's assertion. `Tempo.gateFrames` drives both the hook's gate and the RSC's preload count.
- **Known soft spots, called out in place:** Task 5's mirrored `picIndex` state; Task 3's `setPrev` inside an updater (fallback: `useReducer`); Task 6's
  preload assertion skipping on PIXEL fixtures; e2e never sees an empty pool.
