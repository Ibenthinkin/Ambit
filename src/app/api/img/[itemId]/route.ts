// The image proxy: every item image the app renders is fetched through here rather than hotlinked
// from the source's CDN — and, since Phase 7.3, fetched from the source **once, ever**.
//
// **Why it exists.** Museum image servers make hotlinking unreliable in ways no client-side fix
// can reach. The proven case is the Art Institute of Chicago, whose Cloudflare bot management 403s
// any request carrying a `localhost` referer — 20/20, deterministic — which is 17.5% of the corpus
// dark on every dev machine (`docs/HANDOFF_aic-images.md` §2.2). A server-side fetch has no
// referer at all unless we send one, and we don't, so the block simply doesn't apply. As a side
// effect every image now has ONE origin, which is also what makes the share sheet's "Save image"
// row possible (a cross-origin blob can't be handed to `navigator.share`).
//
// **The security boundary is the itemId.** This route takes an item id and looks the URL up in our
// own table. It never accepts a URL, from a query param or anywhere else — an image proxy that
// fetches caller-supplied URLs is an open proxy and an SSRF gadget aimed at whatever the app
// server can reach. Keep it that way.
//
// **What 7.3 added, and what this route now is.** The old comment reserved "resizing and a cache
// layer" for this phase; both landed, in `services/image-cache.ts` rather than here. The reason is
// `tile.loc.gov`, which rate-limits **by IP with no published budget** (Phase 6.2's finding): a
// bare proxy makes a per-IP budget *worse*, because every reader's every scroll spends from the
// same allowance. So each item is now fetched upstream once, resized to ≤1600 px WebP, and written
// to disk; concurrent misses for the same item share a single fetch. This handler is what's left:
// rate-limit, resolve the id, hand off, answer. Failures are never cached (D4).
import { getItemById } from "~/server/db/items";
import { getOrFill, ImageFillError } from "~/server/services/image-cache";
import { RateLimiter, trustedClientIp } from "~/server/services/rate-limit";

// A separate limiter instance from the tRPC middleware's (120/min), and generously sized on
// purpose: one feed page loads ~24 images, so sharing the API's budget would let a single scroll
// starve the reader's own procedure calls. This is abuse cover for the proxy alone.
const limiter = new RateLimiter({ limit: 600, windowMs: 60_000 });

/** Failures must never be cached; a 403 that sticks for a year is indistinguishable from a dead image. */
const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  // Rate limit before touching the DB — the cheapest possible rejection for a scraper walking ids.
  const key = trustedClientIp(new Headers(req.headers)) ?? "unknown";
  if (!limiter.allow(key)) {
    return new Response("Too many requests", {
      status: 429,
      headers: NO_STORE,
    });
  }

  const { itemId } = await params;
  const item = await getItemById(itemId);
  // No item, no image, or an image that isn't http(s) — `data:` URLs (the e2e corpus seeds them)
  // are rendered directly by the client and never routed here, and anything else is not something
  // this server should be dereferencing.
  if (!item?.imageUrl || !/^https?:\/\//i.test(item.imageUrl)) {
    return new Response("Not found", { status: 404, headers: NO_STORE });
  }

  let image;
  try {
    image = await getOrFill(item);
  } catch (err) {
    // Every failure mode the cache distinguishes (upstream / decode / too-large / timeout) is the
    // same answer to a browser: there is no image here, and don't remember that.
    if (err instanceof ImageFillError) {
      return new Response(`Upstream error (${err.kind})`, {
        status: 502,
        headers: NO_STORE,
      });
    }
    throw err;
  }

  return new Response(new Uint8Array(image.bytes), {
    status: 200,
    headers: {
      // Always WebP now — one variant per item (decision D2). `item-shell.tsx` derives the
      // share/download filename's extension from this rather than assuming `.jpg` (D8).
      "Content-Type": image.contentType,
      "Content-Length": String(image.bytes.byteLength),
      // Immutable for a year, keyed on the item id. `imageUrl` *can* change when a source
      // re-catalogues an object and ingestion refreshes the row, so this accepts some staleness in
      // exchange for never re-fetching an image the reader has already seen.
      "Cache-Control": "public, max-age=31536000, immutable",
      // Whether this response came off disk or cost an upstream fetch. Not needed by any client —
      // it exists so that "the cache actually works" is observable with `curl -I` and assertable
      // in a test, rather than something you infer from a stopwatch.
      "X-Ambit-Cache": image.hit ? "hit" : "fill",
    },
  });
}
