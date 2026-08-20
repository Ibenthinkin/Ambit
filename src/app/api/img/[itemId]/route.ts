// The image proxy: every item image the app renders is fetched through here rather than hotlinked
// from the source's CDN.
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
// Deliberately NOT here (7.3 owns them): resizing / IIIF `!843,843` sizing, and a CDN cache layer
// in front of this route.
import { getItemById } from "~/server/db/items";
import { RateLimiter, trustedClientIp } from "~/server/services/rate-limit";
import { USER_AGENT } from "~/server/services/sources/http";

// A separate limiter instance from the tRPC middleware's (120/min), and generously sized on
// purpose: one feed page loads ~24 images, so sharing the API's budget would let a single scroll
// starve the reader's own procedure calls. This is abuse cover for the proxy alone.
const limiter = new RateLimiter({ limit: 600, windowMs: 60_000 });

/** Upstream is a third party on a phone network — long enough to be patient, short enough to fail. */
const UPSTREAM_TIMEOUT_MS = 15_000;

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

  let upstream: Response;
  try {
    upstream = await fetch(item.imageUrl, {
      // No `Referer`, and that omission is the entire point of the route — see the header comment.
      headers: { "User-Agent": USER_AGENT, Accept: "image/*" },
      // Two ways to give up: the upstream taking too long, and the reader leaving. The second is
      // routine — a feed scrolls ~24 images past the viewport and a navigation cancels whatever is
      // still in flight — so the request's own signal is joined here to stop pulling bytes nobody
      // will see, and to let the stream below unwind as a cancellation rather than an error.
      signal: AbortSignal.any([
        req.signal,
        AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      ]),
    });
  } catch {
    return new Response("Upstream fetch failed", {
      status: 502,
      headers: NO_STORE,
    });
  }

  if (!upstream.ok || !upstream.body) {
    return new Response("Upstream error", { status: 502, headers: NO_STORE });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
      // Immutable for a year, keyed on the item id. `imageUrl` *can* change when a source
      // re-catalogues an object and ingestion refreshes the row, so this accepts some staleness in
      // exchange for never re-fetching an image the reader has already seen. When 7.3 puts a real
      // CDN in front of this, that's the layer to make the tradeoff explicit at.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
