// fetchJson's retry policy, pinned. Every source adapter goes through it, so a change here is a
// change to how Ambit treats every host on the internet — worth a test even though the function
// is twenty lines. Fake timers make the 1s → 3s → 9s backoff instantaneous.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchJson, fetchJsonResponse, HttpRefusedError } from "./http";

function stub(responses: { ok: boolean; status: number; body?: unknown }[]) {
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

  it("fetchJsonResponse hands back the headers alongside the parsed body", async () => {
    stub([{ ok: true, status: 200, body: [{ id: 1 }] }]);
    const { data, headers } = await fetchJsonResponse("https://example.test/a");
    expect(data).toEqual([{ id: 1 }]);
    expect(headers.get("x-wp-totalpages")).toBe("4");
  });
});
