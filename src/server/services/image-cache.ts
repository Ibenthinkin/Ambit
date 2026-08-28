// **The image proxy's disk cache** (Phase 7.3, decisions D1–D5) — the half of `/api/img/[itemId]`
// that means a source image is fetched from its museum **once, ever**.
//
// **Why a cache and not `next/image`.** BUILD_PLAN carried an open gate for two phases: hotlink,
// `next/image` with remote patterns, or proxy-with-cache. The evidence settled it. AIC's Cloudflare
// bot management 403s any request carrying a `localhost` referer, which is why the proxy exists at
// all (`docs/HANDOFF_aic-images.md`); and `tile.loc.gov` rate-limits **by IP with no published
// budget and no `Retry-After`** — a 334-image ingest tripped a sustained 429 from every User-Agent
// it tried (Phase 6.2). A referer problem a bare proxy fixes; a per-IP *budget* it makes worse,
// because every reader's every scroll spends from the same allowance. `next/image` would be worse
// still: each width/quality variant is its own upstream fetch through the proxy, so one image on
// one screen could cost two or three. One fetch, one file, forever, is the only shape that fits.
//
// **What is cached.** One `<itemId>.webp` per item: ≤1600 px on the longest edge, quality 82,
// EXIF-rotated, never enlarged (D2). 1600 covers a 3× phone at the hero's rendered width and the
// gallery's full-bleed; a second thumbnail variant is a knob for a later phase, not this one.
//
// **What is not cached: failures** (D4). A 4xx/5xx, a timeout, or bytes `sharp` can't decode answer
// 502 `no-store` and write nothing. A failure that sticks for a year is indistinguishable from a
// dead image.
//
// **Node APIs only, deliberately.** Vitest runs under plain Node (its bin shebangs
// `#!/usr/bin/env node`) while the app runs under Bun, so this module uses `node:fs/promises` and
// `Buffer` and nothing Bun-specific — otherwise its own unit tests couldn't run it.
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

import sharp from "sharp";

import { env } from "~/env";
import type { Item } from "~/server/db/items";
import { USER_AGENT } from "~/server/services/sources/http";

/** Longest edge, in pixels (D2). Nothing is ever enlarged to reach it. */
export const MAX_EDGE = 1600;
/** WebP quality (D2). 82 is the knee of the curve for photographic museum scans. */
export const WEBP_QUALITY = 82;
/** Upstream bytes beyond this are refused (502) rather than decoded — museum TIFFs exist. */
export const MAX_UPSTREAM_BYTES = 40 * 1024 * 1024;
/** Long enough to be patient with a museum on a slow morning, short enough to fail. */
const UPSTREAM_TIMEOUT_MS = 15_000;

export interface CachedImage {
  bytes: Buffer;
  contentType: "image/webp";
}

/** Why a fill failed, in the shape the route turns into a status code. */
export type ImageFillErrorKind =
  | "upstream" // the far end said no, or the connection did
  | "decode" // bytes arrived, `sharp` would not have them
  | "too-large" // more bytes than MAX_UPSTREAM_BYTES
  | "timeout";

export class ImageFillError extends Error {
  constructor(
    readonly kind: ImageFillErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ImageFillError";
  }
}

/**
 * Whether a thrown value is an aborted-by-timeout.
 *
 * **Deliberately duck-typed, not `instanceof Error`.** `AbortSignal.timeout` rejects with a
 * `DOMException`, and under Bun a `DOMException` is *not* an instance of `Error` — so the obvious
 * `err instanceof Error && err.name === "TimeoutError"` silently mislabels every timeout as a
 * generic upstream failure. (Under Node it happens to pass. The first real `img:warm` run is what
 * showed the difference.)
 */
function isTimeout(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { name?: unknown }).name === "TimeoutError"
  );
}

/** The cache directory, resolved against the project root when the env var is relative. */
function cacheDir(dir = env.IMAGE_CACHE_DIR): string {
  return isAbsolute(dir) ? dir : resolve(process.cwd(), dir);
}

/**
 * Where an item's cached bytes live.
 *
 * **The item id is the whole key, and that is the security boundary.** Item ids are nanoids the
 * app generates — `[A-Za-z0-9_-]`, no dots, no slashes — so this can never escape the directory.
 * Nothing here or in the route ever takes a caller-supplied path, URL or size; the URL is looked
 * up in our own table. Keep it that way.
 */
export function cachePathFor(itemId: string, dir?: string): string {
  return join(cacheDir(dir), `${itemId}.webp`);
}

/** `mkdir -p`, memoised per directory — a fill shouldn't syscall for this on every miss. */
const dirReady = new Map<string, Promise<void>>();
function ensureDir(dir: string): Promise<void> {
  let pending = dirReady.get(dir);
  if (!pending) {
    pending = mkdir(dir, { recursive: true }).then(() => undefined);
    dirReady.set(dir, pending);
  }
  return pending;
}

/** The cached bytes, or `null` if this item has never been filled (or the file was deleted). */
export async function readCached(
  itemId: string,
  dir?: string,
): Promise<CachedImage | null> {
  try {
    return {
      bytes: await readFile(cachePathFor(itemId, dir)),
      contentType: "image/webp",
    };
  } catch {
    // ENOENT is the overwhelmingly common case and means "miss". Anything else (a permission
    // problem, a truncated read) is also best treated as a miss: refilling is cheap and correct,
    // and a cache that throws is worse than one that misses.
    return null;
  }
}

export interface FillOpts {
  /** Where to write. Tests pass an `mkdtemp`; production uses `IMAGE_CACHE_DIR`. */
  dir?: string;
  /** Injected in tests so no unit test ever reaches a museum. */
  fetchImpl?: typeof fetch;
}

/**
 * Fetch → resize → encode → write, atomically. Rejects with an `ImageFillError` rather than
 * caching a failure (D4).
 *
 * **No `Referer`, ever** — that omission is the entire reason this route exists (see the header,
 * and `route.ts`'s). The upstream sees a plain server-side GET with our User-Agent.
 *
 * **The request's own abort signal is deliberately not plumbed through.** A reader who scrolls
 * past an image mid-fetch cancels their *response*, and if that cancelled the upstream fetch too
 * the museum would be asked again next time — the exact cost this cache exists to avoid. The only
 * thing that can abort a fill is the timeout below. A fill is worth finishing even when nobody is
 * waiting for it any more.
 */
export async function fillCache(
  item: Pick<Item, "id" | "imageUrl">,
  opts: FillOpts = {},
): Promise<CachedImage> {
  const doFetch = opts.fetchImpl ?? fetch;
  const url = item.imageUrl;
  if (!url)
    throw new ImageFillError("upstream", `item ${item.id} has no imageUrl`);

  let upstream: Response;
  try {
    upstream = await doFetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "image/*" },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      redirect: "follow",
    });
  } catch (err) {
    throw new ImageFillError(
      isTimeout(err) ? "timeout" : "upstream",
      `fetch failed for item ${item.id}: ${String(err)}`,
    );
  }

  if (!upstream.ok) {
    throw new ImageFillError(
      "upstream",
      `item ${item.id}: upstream answered ${upstream.status}`,
    );
  }

  // Checked before reading the body, so an enormous TIFF costs a header round trip rather than
  // 40 MB of transfer. The byte count is re-checked after, because `content-length` is a claim.
  const declared = Number(upstream.headers.get("content-length") ?? "0");
  if (declared > MAX_UPSTREAM_BYTES) {
    throw new ImageFillError(
      "too-large",
      `item ${item.id}: upstream declared ${declared} bytes`,
    );
  }

  // **Wrapped, and that is not belt-and-braces.** `AbortSignal.timeout` covers the *whole*
  // exchange, headers and body alike, so a museum that answers instantly and then trickles the
  // bytes rejects here rather than at the `fetch` above. Found by the first real `img:warm` run
  // against LoC (08-28-26): unwrapped, it escaped `fillCache` as a raw DOMException and took the
  // script down with it — and would have made the route answer 500 instead of 502.
  let raw: Buffer;
  try {
    raw = Buffer.from(await upstream.arrayBuffer());
  } catch (err) {
    throw new ImageFillError(
      isTimeout(err) ? "timeout" : "upstream",
      `item ${item.id}: reading the body failed: ${String(err)}`,
    );
  }

  if (raw.byteLength > MAX_UPSTREAM_BYTES) {
    throw new ImageFillError(
      "too-large",
      `item ${item.id}: upstream sent ${raw.byteLength} bytes`,
    );
  }

  let bytes: Buffer;
  try {
    bytes = await sharp(raw, { failOn: "none" })
      // EXIF orientation applied and then stripped — a phone-shot archive image that renders
      // sideways in a browser is a real thing, and WebP output keeps no orientation tag.
      .rotate()
      .resize({
        width: MAX_EDGE,
        height: MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  } catch (err) {
    throw new ImageFillError(
      "decode",
      `item ${item.id}: sharp refused the bytes: ${String(err)}`,
    );
  }

  // **Write to a temp name, then rename.** `rename` within a filesystem is atomic, so a concurrent
  // reader either sees no file or sees a complete one — never the half-written file a plain
  // `writeFile` would expose if the process died mid-write.
  const dir = cacheDir(opts.dir);
  await ensureDir(dir);
  const final = cachePathFor(item.id, opts.dir);
  const temp = `${final}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, bytes);
    await rename(temp, final);
  } catch (err) {
    await unlink(temp).catch(() => undefined);
    throw new ImageFillError(
      "upstream",
      `item ${item.id}: cache write failed: ${String(err)}`,
    );
  }

  return { bytes, contentType: "image/webp" };
}

/**
 * In-flight fills, keyed by item id (D5).
 *
 * A feed page asks for ~24 images at once and the gallery rail re-requests the hero the moment it
 * opens. Without this, the first load of a page would fetch every one of those images from the
 * museum two or three times over — the opposite of the point.
 *
 * Module-level and per-process, like the rate limiters: one app instance is the 8.1 deploy shape
 * (SPEC §13). Two instances would each fetch once, which is still bounded and still fine.
 */
const inFlight = new Map<string, Promise<CachedImage>>();

/** What the route calls: cached bytes if there are any, otherwise one shared fill. */
export async function getOrFill(
  item: Pick<Item, "id" | "imageUrl">,
  opts: FillOpts = {},
): Promise<CachedImage & { hit: boolean }> {
  const cached = await readCached(item.id, opts.dir);
  if (cached) return { ...cached, hit: true };

  let pending = inFlight.get(item.id);
  if (!pending) {
    pending = fillCache(item, opts);
    inFlight.set(item.id, pending);
    // Cleared whether it resolved or rejected: a failed fill must be retryable on the next
    // request (D4 says we cache no failures, and that includes remembering them in memory).
    //
    // The trailing `.catch` is load-bearing, not defensive noise. `.finally()` returns a *new*
    // promise that rejects with the same reason, and nothing is awaiting that one — so without
    // this, every failed fill raises an unhandled rejection (caught by this module's own tests
    // before it could reach a server log). The caller still gets the rejection from `pending`.
    pending.finally(() => inFlight.delete(item.id)).catch(() => undefined);
  }

  return { ...(await pending), hit: false };
}
