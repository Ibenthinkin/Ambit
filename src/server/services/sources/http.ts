// Shared HTTP plumbing for every source adapter — the fetch-with-retry pattern phase0/harvest.ts
// proved out, minus its on-disk response cache. That cache existed so Phase 0's exploratory
// scripts (embed, curate, the eyeball harness) could iterate for free against a fixed corpus; the
// real ingestion job's "cache" is the DB's skip-existing check (an item already upserted is never
// re-fetched on the next run), so a second cache layer here would just be dead weight.

/**
 * Public-API etiquette: every source's docs (Wikipedia's explicitly) ask bots to identify
 * themselves with a project URL + contact email — the difference between "rate-limited politely"
 * and "blocked as an anonymous scraper".
 */
export const USER_AGENT =
  "Ambit/0.1 (https://github.com/Ibenthinkin/Ambit; benjamin.reilly@gmail.com)";

/**
 * GET a JSON endpoint with an optional politeness delay before the request and retry-with-backoff
 * on failure. The retry exists chiefly for the Met, whose rate limit surfaces as an HTTP 403 that
 * looks exactly like a permanent denial but clears after a short pause (phase0/NOTES.md) — so any
 * non-ok response is treated as retryable, not just network errors.
 */
export async function fetchJson(
  url: string,
  opts?: { delayMs?: number; headers?: Record<string, string> },
): Promise<unknown> {
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
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      // Exponential backoff (1s → 3s → 9s) plus up to 500ms of jitter so concurrent adapters
      // don't all retry in lockstep — same shape phase0/harvest.ts and phase0/curate.ts both use.
      if (attempt < 4)
        await sleep(1000 * 3 ** (attempt - 1) + Math.random() * 500);
    }
  }
  throw lastErr;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
