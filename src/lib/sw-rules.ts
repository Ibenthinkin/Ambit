// Which requests the service worker caches, and where.
//
// Deliberately free of any `serwist` import. Two consumers need this file and they run in
// incompatible environments: `src/app/sw.ts` is compiled into a worker script, while
// `settings-screen.tsx` calls `purgePagesCache` from an ordinary page. Keeping the rules as plain
// predicates over a URL also means they can be unit-tested in node, which matters more here than
// usual — a caching mistake doesn't throw, it just quietly serves the wrong thing to somebody
// three days later.
//
// **What this replaced, and why.** Phase 1 shipped `runtimeCaching: defaultCache`, Serwist's
// framework-aware default set. Reading it during 5.11 turned up a real problem: its last rule
// matches *every* same-origin `/api/*` request except `/api/auth/*` and runs it through
// `NetworkFirst` into a shared 16-entry bucket. tRPC queries travel as GET, so every reader's
// personalized feed page had been landing in Cache Storage since Phase 1 — and competing for
// those 16 slots with the image proxy. Both halves of that are wrong, hence the hand-written set
// below (BUILD_PLAN 5.11: "a deliberate strategy, not `defaultCache`").

export const PAGES_CACHE = "ambit-pages";
export const IMAGES_CACHE = "ambit-images";
export const STATIC_CACHE = "ambit-static";
export const NEXT_STATIC_CACHE = "ambit-next-static";

/**
 * The subset of Serwist's `RouteMatchCallbackOptions` these rules actually read. Declaring it
 * locally is what keeps the `serwist` import out; the worker passes the real object, which is
 * structurally compatible.
 */
export interface MatchInput {
  url: URL;
  sameOrigin: boolean;
  request: { mode: RequestMode; destination: RequestDestination };
}

/** Better Auth's endpoints. Sessions and sign-in must never be answered from a cache. */
export const isAuthApi = ({ url, sameOrigin }: MatchInput): boolean =>
  sameOrigin && url.pathname.startsWith("/api/auth/");

/**
 * Every tRPC call. **Network only, never stored.**
 *
 * The feed is personalized and, worse, *consuming*: a page the reader receives is marked seen
 * (§9's ack-on-receipt), so replaying a cached one would show them items the server believes they
 * have already had. A stale feed is worse than no feed, and this is the rule that says so.
 */
export const isTrpc = ({ url, sameOrigin }: MatchInput): boolean =>
  sameOrigin && url.pathname.startsWith("/api/trpc/");

/**
 * The image proxy. Cache-first and generously sized: these are immutable by construction (the
 * route serves `public, max-age=31536000, immutable`), they are the single most expensive thing
 * the app fetches, and they are what makes an offline feed look like a feed rather than a
 * wireframe.
 */
export const isImageProxy = ({ url, sameOrigin }: MatchInput): boolean =>
  sameOrigin && url.pathname.startsWith("/api/img/");

/**
 * The feed *document* — and only the feed, and only a real navigation to it.
 *
 * This is the trick that makes "reopening offline shows the last feed" possible without caching a
 * single API response: `/feed` is an RSC page whose first page of items is dehydrated into the
 * HTML itself. Cache the document and the reader gets that page back; the tRPC call for page two
 * fails, which the feed already renders honestly.
 *
 * Not `/`: it redirects to `/feed` for a signed-in reader, and a cached redirect is both the wrong
 * page and a response a navigation request is not allowed to be served.
 */
export const isFeedDocument = ({
  url,
  sameOrigin,
  request,
}: MatchInput): boolean =>
  sameOrigin && request.mode === "navigate" && url.pathname === "/feed";

/** Next's build output: content-hashed, so cache-first is safe and permanent. */
export const isNextStatic = ({ url, sameOrigin }: MatchInput): boolean =>
  sameOrigin && url.pathname.startsWith("/_next/static/");

/** The landing slideshow's imagery and the app icons — committed files, revised only on deploy. */
export const isStaticAsset = ({ url, sameOrigin }: MatchInput): boolean =>
  sameOrigin &&
  (url.pathname.startsWith("/landing/") ||
    /^\/icon-\d+(-maskable)?\.png$/.test(url.pathname));

/**
 * Drops the cached `/feed` document.
 *
 * Called from the page on sign-out, not from the worker: a personalized feed must not outlive the
 * account that produced it, and a shared device is exactly where that matters. Best-effort by
 * design — if the Cache API is unavailable or the delete fails, signing out must still proceed.
 */
export async function purgePagesCache(): Promise<void> {
  try {
    if ("caches" in globalThis) await caches.delete(PAGES_CACHE);
  } catch {
    // Nothing to do and nothing worth telling the reader about.
  }
}
