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
 * A non-ok status the caller told us never to retry. Distinct class so the retry loop can let it
 * through untouched, and so a walker can distinguish "refused" from "flaky" in its own error path.
 */
export class HttpRefusedError extends Error {
  constructor(
    public readonly status: number,
    url: string,
  ) {
    super(`HTTP ${status} for ${redactUrl(url)} — refused; not retried`);
    this.name = "HttpRefusedError";
  }
}

/**
 * Query parameters whose value is a credential. Matched against the parameter *name*, case-
 * insensitively, so `api_key`, `apiKey`, `key`, `token`, `access_token` all count. Deliberately
 * a name list rather than "anything long and random": a false negative here leaks a secret,
 * a false positive costs a URL some legibility in a log line.
 */
const SECRET_PARAMS =
  /^(api[_-]?key|key|token|access[_-]?token|secret|password)$/i;

/**
 * The URL as it may appear in an error message: every secret-looking query value replaced by
 * `[redacted]`. Exists because every adapter's failure path is `throw new Error(\`… ${url}\`)`
 * and that message ends up wherever the run's output does — Coolify's task log, a transcript, a
 * pasted bug report. Phase 8.1's first server-side smoke printed the Smithsonian key into the
 * Coolify UI 34 times this way (one per failing call). Works on the raw string rather than
 * `new URL()` so a malformed URL still produces a usable message.
 */
export function redactUrl(url: string): string {
  return url.replace(
    /([?&])([^=&#]+)=([^&#]*)/g,
    (whole, sep: string, name: string, _value: string) =>
      SECRET_PARAMS.test(decodeURIComponent(name))
        ? `${sep}${name}=[redacted]`
        : whole,
  );
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
  /**
   * Per-attempt deadline, headers-to-body-read inclusive; default DEFAULT_TIMEOUT_MS. Added
   * 09-02-26 after a thisiscolossal walk hung for good: 13.9 MB in over one keep-alive socket,
   * then zero bytes forever — the far end had dropped the connection and `fetch` has no timeout
   * of its own. A request that never answers is now a failed attempt like a 503, with the same
   * backoff and retry (a retry opens a fresh socket). Generous by default because the slowest
   * honest answers this code sees are museum searches in the tens of seconds.
   */
  timeoutMs?: number;
}

export const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * The one retry loop, parameterized by how the body is read. Retry-with-backoff on failure (see
 * the module header): the retry exists chiefly for the Met, whose rate limit surfaces as an HTTP
 * 403 that looks exactly like a permanent denial but clears after a short pause (phase0/NOTES.md)
 * — so any non-ok response is treated as retryable, not just network errors, unless `noRetryOn`
 * says otherwise. Reading the body happens *inside* the attempt on purpose: a truncated or
 * malformed body is a failed attempt like any other, and gets the same backoff.
 */
async function fetchWithRetry<T>(
  url: string,
  opts: FetchJsonOpts | undefined,
  read: (res: Response) => Promise<T>,
): Promise<{ data: T; headers: Headers }> {
  let lastErr: unknown;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  for (let attempt = 1; attempt <= 4; attempt++) {
    // One controller per attempt, armed with a plain setTimeout rather than AbortSignal.timeout
    // so the unit tests' fake timers can drive it. Cleared on every exit path below.
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), timeoutMs);
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
        signal: controller.signal,
      });
      if (!res.ok) {
        if (opts?.noRetryOn?.includes(res.status))
          throw new HttpRefusedError(res.status, url);
        throw new Error(`HTTP ${res.status} for ${redactUrl(url)}`);
      }
      return { data: await read(res), headers: res.headers };
    } catch (err) {
      // A refusal is the caller's decision, not a transport failure: straight out, no backoff.
      if (err instanceof HttpRefusedError) throw err;
      lastErr = controller.signal.aborted
        ? new Error(
            `timed out after ${timeoutMs}ms for ${redactUrl(url)} (attempt ${attempt})`,
          )
        : err;
      // Exponential backoff (1s → 3s → 9s) plus up to 500ms of jitter so concurrent adapters
      // don't all retry in lockstep — same shape phase0/harvest.ts and phase0/curate.ts both use.
      if (attempt < 4)
        await sleep(1000 * 3 ** (attempt - 1) + Math.random() * 500);
    } finally {
      clearTimeout(deadline);
    }
  }
  throw lastErr;
}

/**
 * GET a JSON endpoint and return the parsed body *and* the response headers, under
 * fetchWithRetry's policy. Headers are returned because WordPress paginates by header
 * (`x-wp-totalpages`), and a walker that cannot read it has to guess when the corpus ends. Most
 * callers want `fetchJson` below.
 */
export function fetchJsonResponse(
  url: string,
  opts?: FetchJsonOpts,
): Promise<{ data: unknown; headers: Headers }> {
  return fetchWithRetry(url, opts, (res) => res.json() as Promise<unknown>);
}

/**
 * The same policy, body handed back as text. Exists for the sources whose "JSON" endpoint is not
 * JSON on the wire — Tumblr's legacy `/api/read/json` answers `var tumblr_api_read = {...};`
 * (Phase 6.3's second blog) — so the adapter can unwrap it itself while still inheriting the
 * retry, the refusal rule, and the User-Agent. `Accept: application/json` is still sent: it is
 * what these endpoints expect, and it costs a text endpoint nothing.
 */
export async function fetchTextResponse(
  url: string,
  opts?: FetchJsonOpts,
): Promise<{ text: string; headers: Headers }> {
  const { data, headers } = await fetchWithRetry(url, opts, (res) =>
    res.text(),
  );
  return { text: data, headers };
}

/** The common case: just the body. Identical policy to fetchJsonResponse. */
export async function fetchJson(
  url: string,
  opts?: FetchJsonOpts,
): Promise<unknown> {
  return (await fetchJsonResponse(url, opts)).data;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
