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
 * The `src`/`srcset` pair for one picture. Pure, so the client tests can build fixtures with it.
 *
 * `sizes` lives on the `<img>` (landing-reel.tsx), not here: `(min-width: 768px) 100vw, 50vw` —
 * below `md` a phone takes the 960 (0.8 device pixels per image pixel at 3×, invisible behind a
 * moving surface), from `md` the master. The `1600w` descriptor is nominal (D3): a smaller master
 * is not enlarged, the browser only uses the number to choose.
 */
export function reelPicture(id: string, imageUrl: string): ReelPicture {
  if (imageUrl.startsWith("data:")) return { id, src: imageUrl, srcSet: null };
  const master = `/api/img/${id}`;
  const small = `${master}?w=960`;
  return { id, src: small, srcSet: `${small} 960w, ${master} 1600w` };
}

type PoolRow = { id: string; imageUrl: string };
let memo: { rows: PoolRow[]; at: number } | null = null;

/** Tests only: forget the memo between cases. */
export function resetLandingPoolForTests(): void {
  memo = null;
}

async function pool(): Promise<PoolRow[]> {
  if (memo && Date.now() - memo.at < POOL_TTL_MS) return memo.rows;
  const rows = await listLandingPool();
  memo = { rows, at: Date.now() };
  return rows;
}

/** What `app/page.tsx` awaits. Never throws: a database problem is a fallback, not a 500 on `/`. */
export async function getReel(n: number = REEL_SIZE): Promise<ReelPicture[]> {
  let rows: PoolRow[];
  try {
    rows = await pool();
  } catch (err) {
    // Logged, not rethrown: instrumentation.ts mails on unhandled throws, and this one is handled.
    console.error("landing-pool: query failed, serving the fallback", err);
    return [FALLBACK_PICTURE];
  }
  if (rows.length === 0) return [FALLBACK_PICTURE];
  return pickReel(rows, n).map((r) => reelPicture(r.id, r.imageUrl));
}
