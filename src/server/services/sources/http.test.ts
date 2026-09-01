// fetchJson's retry policy, pinned. Every source adapter goes through it, so a change here is a
// change to how Ambit treats every host on the internet — worth a test even though the function
// is twenty lines. Fake timers make the 1s → 3s → 9s backoff instantaneous.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchJson,
  fetchJsonResponse,
  fetchTextResponse,
  HttpRefusedError,
} from "./http";

function stub(
  responses: { ok: boolean; status: number; body?: unknown; text?: string }[],
) {
  const calls: string[] = [];
  let i = 0;
  vi.stubGlobal("fetch", (input: string | URL) => {
    calls.push(String(input));
    const r = responses[Math.min(i++, responses.length - 1)]!;
    return Promise.resolve({
      ok: r.ok,
      status: r.status,
      headers: new Headers({ "x-wp-totalpages": "4" }),
      json: () => Promise.resolve(r.body ?? {}),
      text: () => Promise.resolve(r.text ?? ""),
    });
  });
  return calls;
}

describe("fetchJson", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("retries a non-ok response up to four attempts, then throws", async () => {
    const calls = stub([{ ok: false, status: 503 }]);
    const p = fetchJson("https://example.test/a");
    // Attach the rejection handler BEFORE advancing timers, or the rejection is unhandled.
    const outcome = expect(p).rejects.toThrow("HTTP 503");
    await vi.runAllTimersAsync();
    await outcome;
    expect(calls).toHaveLength(4);
  });

  it("does NOT retry a status listed in noRetryOn — a refusal is final", async () => {
    const calls = stub([{ ok: false, status: 403 }]);
    await expect(
      fetchJson("https://example.test/a", { noRetryOn: [401, 403] }),
    ).rejects.toBeInstanceOf(HttpRefusedError);
    expect(calls).toHaveLength(1);
  });

  it("still retries a 403 when noRetryOn is not given (the Met's rate limit looks like one)", async () => {
    const calls = stub([{ ok: false, status: 403 }]);
    const p = fetchJson("https://example.test/a");
    const outcome = expect(p).rejects.toThrow("HTTP 403");
    await vi.runAllTimersAsync();
    await outcome;
    expect(calls).toHaveLength(4);
  });

  it("redacts a secret-looking query param from a refusal's message", async () => {
    stub([{ ok: false, status: 403 }]);
    const p = fetchJson("https://example.test/a?q=x&api_key=SECRET123&rows=5", {
      noRetryOn: [403],
    });
    await expect(p).rejects.toThrow("api_key=[redacted]");
    await expect(p).rejects.not.toThrow("SECRET123");
  });

  it("redacts the same param from a retried failure's message", async () => {
    stub([{ ok: false, status: 503 }]);
    const p = fetchJson("https://example.test/a?api_key=SECRET123");
    const outcome = expect(p).rejects.toThrow(
      "HTTP 503 for https://example.test/a?api_key=[redacted]",
    );
    await vi.runAllTimersAsync();
    await outcome;
  });

  it("fetchJsonResponse hands back the headers alongside the parsed body", async () => {
    stub([{ ok: true, status: 200, body: [{ id: 1 }] }]);
    const { data, headers } = await fetchJsonResponse("https://example.test/a");
    expect(data).toEqual([{ id: 1 }]);
    expect(headers.get("x-wp-totalpages")).toBe("4");
  });

  // Phase 6.3's second blog (Tumblr) is the first source whose "JSON" endpoint is not JSON on
  // the wire — `var tumblr_api_read = {...};` — so the adapter needs the body as text, under the
  // same retry/refusal policy as everything else. One policy, two readers.
  it("fetchTextResponse hands back the raw body, unparsed, with the headers", async () => {
    stub([{ ok: true, status: 200, text: "var x = {};" }]);
    const { text, headers } = await fetchTextResponse("https://example.test/a");
    expect(text).toBe("var x = {};");
    expect(headers.get("x-wp-totalpages")).toBe("4");
  });

  it("fetchTextResponse honours noRetryOn exactly like fetchJson", async () => {
    const calls = stub([{ ok: false, status: 403 }]);
    await expect(
      fetchTextResponse("https://example.test/a", { noRetryOn: [403] }),
    ).rejects.toBeInstanceOf(HttpRefusedError);
    expect(calls).toHaveLength(1);
  });
});
