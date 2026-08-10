// A pure, in-memory sliding-window rate limiter (Phase 4.2 decision — SPEC §11's "basic per-
// user/IP rate limiting"). This is abuse cover, not throttling: generous defaults (see trpc.ts's
// instantiation) exist to blunt a runaway client or scraper, not to shape normal traffic.
//
// Single-instance assumption: state lives in a plain in-memory Map, so it only limits correctly
// within one running process. Ambit's deploy target (Coolify, SPEC §13) runs a single app
// instance, so that's fine for MVP — a multi-instance deploy would need this backed by something
// shared (Redis, Postgres) instead, since each instance would otherwise track its own independent
// window and the *effective* limit would multiply by instance count.
//
// Kept as a plain class (not tRPC middleware itself) so it has a fast, deterministic, DB-free
// unit-test surface — the clock is injected, exactly like services/random.ts's rng seam, so tests
// can move time forward without a real `setTimeout`/`sleep`. trpc.ts wires one shared instance
// into a middleware that keys on `ctx.user?.id ?? <ip>` (see its own comment for why).
export interface RateLimiterOptions {
  /** Max allowed hits per `windowMs` for any single key. */
  limit: number;
  /** Sliding window width, in milliseconds. */
  windowMs: number;
  /** Injectable clock — defaults to the real one; tests pass a fake to move time deterministically. */
  now?: () => number;
}

export class RateLimiter {
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  // key -> timestamps (ms) of hits still inside the window, oldest first. Pruned lazily on each
  // `allow()` call for that key rather than on a timer — nothing here needs to reclaim memory
  // proactively for an MVP's traffic volume, and lazy pruning keeps the class free of any
  // background timer to clean up in tests.
  private readonly hits = new Map<string, number[]>();

  constructor(opts: RateLimiterOptions) {
    this.limit = opts.limit;
    this.windowMs = opts.windowMs;
    this.now = opts.now ?? Date.now;
  }

  /**
   * Records one hit for `key` and reports whether it's allowed under the sliding window (`true`)
   * or the key has already used up its budget in the last `windowMs` (`false`). A rejected call
   * still prunes the key's stale entries but does NOT record the rejected hit itself — a client
   * hammering past its limit shouldn't get to keep resetting its own window just by retrying.
   */
  allow(key: string): boolean {
    const now = this.now();
    const windowStart = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > windowStart);

    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }

    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
}

/**
 * The nearest-hop IP for an unauthenticated caller, trusting exactly one reverse proxy — the key
 * trpc.ts's rate-limit middleware falls back to when a request carries no session (`ctx.user` is
 * null). `X-Forwarded-For` is a comma-separated hop chain (`client, proxy1, proxy2, ...`) that any
 * client is free to send with an arbitrary *first* value — trusting that value naively would let
 * an anonymous caller mint a fresh rate-limit key on every request just by sending a different
 * made-up address each time, defeating the limiter exactly on the surface it matters most
 * (`items.byId`, the one public procedure, so the one this app's own auth boundary can't already
 * cover). Only the *last* entry is trustworthy here: Ambit's deploy target (Coolify, SPEC §13)
 * sits behind exactly one reverse proxy, which appends the real connecting address as the final
 * hop and passes through whatever a client already sent before it untouched — so the last segment
 * is the one hop this server itself didn't originate but *can* trust, and every earlier segment is
 * attacker-controlled input, never to be used as a limiter key.
 *
 * (This is a distinct, single-hop-*trust* concern from the single-*instance* caveat on
 * `RateLimiter`'s own state above — that one's about multiple app processes each keeping an
 * independent counter; this one's about a multi-hop header being spoofable regardless of instance
 * count.)
 *
 * Returns `null` when the header is absent or empty — the caller (trpc.ts) falls back further, to
 * a shared `"unknown"` bucket, rather than treating "no header at all" as its own meaningful key.
 */
export function trustedClientIp(headers: Headers): string | null {
  const forwardedFor = headers.get("x-forwarded-for");
  if (!forwardedFor) return null;
  const hops = forwardedFor.split(",").map((hop) => hop.trim());
  const last = hops[hops.length - 1];
  return last && last.length > 0 ? last : null;
}
