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
// public-domain picture does that.
import { landingShape, type LandingShape } from "~/server/config/landing-pool";
import { listLandingPool } from "~/server/db/items";

export interface ReelPicture {
  id: string;
  /** What the `<img src>` is: the proxied master, or a `data:` URL verbatim. */
  src: string;
  /** Unused since 09-25-26 (always null) — kept on the type so a future rendition can return. */
  srcSet: string | null;
}

export const REEL_SIZE = 12;
export const POOL_TTL_MS = 10 * 60 * 1000;

/** Hokusai, The Great Wave off Kanagawa (c. 1831), public domain — the one picture that ships in
 *  the repo, re-encoded from 5.11's JPEG at 960 px WebP q76. Credit lives here because nothing
 *  renders it. */
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
 * The `src` for one picture. Pure, so the client tests can build fixtures with it.
 *
 * **The master, not the 960 rendition (09-25-26).** The reel is full-bleed on a 3× phone, which
 * needs every pixel a picture has: the tall pool's median master is 893 px high, under 960
 * anyway, and serving the rendition with `sizes="50vw"` is what made Ben's first device look a
 * blurry close-up. The rendition stays available in the image route; nothing here uses it.
 */
export function reelPicture(id: string, imageUrl: string): ReelPicture {
  if (imageUrl.startsWith("data:")) return { id, src: imageUrl, srcSet: null };
  return { id, src: `/api/img/${id}`, srcSet: null };
}

/** One reel per screen shape: tall pictures for a phone held upright, wide ones for a computer. */
export type Reels = Record<LandingShape, ReelPicture[]>;

type PoolRow = { id: string; imageUrl: string; width: number; height: number };
let memo: { rows: PoolRow[]; at: number } | null = null;

/** Tests only: forget the memo between cases. */
export function resetLandingPoolForTests(): void {
  memo = null;
}

async function pool(): Promise<PoolRow[]> {
  if (memo && Date.now() - memo.at < POOL_TTL_MS) return memo.rows;
  const rows = await listLandingPool();
  // An empty pool is not remembered: a fresh install (or CI's fixture database, where a spec seeds
  // landing pictures after an earlier spec has already visited `/`) must see its first rows on the
  // next visit, not ten minutes later. Asking again while empty costs one indexed query.
  if (rows.length > 0) memo = { rows, at: Date.now() };
  return rows;
}

const FALLBACK_REELS: Reels = {
  portrait: [FALLBACK_PICTURE],
  landscape: [FALLBACK_PICTURE],
};

/**
 * What `app/page.tsx` awaits: a tall reel and a wide reel, the page choosing between them by the
 * reader's screen. Never throws — a database problem is the fallback, not a 500 on `/`. A shape
 * with no pictures (a fresh install, CI's fixtures) falls back on its own; the other is unaffected.
 */
export async function getReels(n: number = REEL_SIZE): Promise<Reels> {
  let rows: PoolRow[];
  try {
    rows = await pool();
  } catch (err) {
    // Logged, not rethrown: instrumentation.ts mails on unhandled throws, and this one is handled.
    console.error("landing-pool: query failed, serving the fallback", err);
    return FALLBACK_REELS;
  }
  const byShape: Record<LandingShape, PoolRow[]> = {
    portrait: [],
    landscape: [],
  };
  for (const r of rows) {
    const shape = landingShape(r.width, r.height);
    if (shape) byShape[shape].push(r);
  }
  const reel = (shape: LandingShape) =>
    byShape[shape].length === 0
      ? [FALLBACK_PICTURE]
      : pickReel(byShape[shape], n).map((r) => reelPicture(r.id, r.imageUrl));
  return { portrait: reel("portrait"), landscape: reel("landscape") };
}
