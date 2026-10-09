import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as RateLimitModule from "~/server/services/rate-limit";

import { POST } from "./route";

// The route's three collaborators are mocked, which makes this a test of the beacon's *contract*:
// what is let in, what is dropped, and that every path answers 204. The real writer has its own
// integration test (`db/usage.integration.test.ts`).
vi.mock("~/env", () => ({
  env: { BETTER_AUTH_URL: "https://ambit.example/some/path" },
}));

const getSession = vi.hoisted(() => vi.fn());
vi.mock("~/lib/auth", () => ({ auth: { api: { getSession } } }));

const recordEvents = vi.hoisted(() => vi.fn());
vi.mock("~/server/db/usage", () => ({ recordEvents }));

// A stand-in limiter, as in the image proxy's test: the over-limit branch is one flag away and
// the key the route chose is recorded for assertion.
const limiterState = vi.hoisted(() => ({
  allow: true,
  keys: [] as string[],
  options: undefined as { limit: number; windowMs: number } | undefined,
}));
vi.mock("~/server/services/rate-limit", async () => {
  const actual = await vi.importActual<typeof RateLimitModule>(
    "~/server/services/rate-limit",
  );
  return {
    ...actual,
    RateLimiter: class {
      constructor(options: { limit: number; windowMs: number }) {
        limiterState.options = options;
      }
      allow(key: string) {
        limiterState.keys.push(key);
        return limiterState.allow;
      }
    },
  };
});

const ORIGIN = "https://ambit.example";
const NOW = new Date("2026-10-09T12:00:00.000Z");
const iso = (msFromNow: number) =>
  new Date(NOW.getTime() + msFromNow).toISOString();

const SCREEN_OPEN = { kind: "screen.open", at: iso(-1000), screen: "feed" };

function post(
  body: unknown,
  headers: Record<string, string> = { Origin: ORIGIN },
) {
  return POST(
    new Request("https://ambit.example/api/usage", {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

const beacon = (events: unknown[], visit = "visit-abcdef") => ({
  visit,
  events,
});

/** The rows handed to the writer on its (only) call, or null if it never ran. */
function written() {
  return recordEvents.mock.calls.length
    ? (recordEvents.mock.calls[0]![0] as Array<Record<string, unknown>>)
    : null;
}

// The limiter is built once, when the route module loads; read its options before any reset.
const limiterOptions = limiterState.options;

describe("POST /api/usage", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    getSession.mockReset();
    getSession.mockResolvedValue({ user: { id: "u1" } });
    recordEvents.mockReset();
    recordEvents.mockResolvedValue(0);
    limiterState.allow = true;
    limiterState.keys = [];
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("uses a 30-per-minute limiter", () => {
    expect(limiterOptions).toEqual({ limit: 30, windowMs: 60_000 });
  });

  it("records a valid batch and answers 204 with no-store", async () => {
    const res = await post(beacon([SCREEN_OPEN]));
    expect(res.status).toBe(204);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(written()).toEqual([
      {
        userId: "u1",
        visit: "visit-abcdef",
        kind: "screen.open",
        at: new Date(SCREEN_OPEN.at),
        screen: "feed",
        itemId: null,
        topicId: null,
        meta: null,
      },
    ]);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("carries itemId, topicId and a valid meta through", async () => {
    await post(
      beacon([
        {
          kind: "item.open",
          at: iso(-5),
          screen: "item",
          itemId: "item1",
          topicId: "astronomy",
          meta: { from: "rail" },
        },
      ]),
    );
    expect(written()![0]).toMatchObject({
      itemId: "item1",
      topicId: "astronomy",
      meta: { from: "rail" },
    });
  });

  // ---- (a) Origin ---------------------------------------------------------------------------
  describe("(a) Origin", () => {
    it("drops a foreign Origin, still 204, and does not even look up a session", async () => {
      const res = await post(beacon([SCREEN_OPEN]), {
        Origin: "https://evil.example",
      });
      expect(res.status).toBe(204);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(recordEvents).not.toHaveBeenCalled();
      expect(getSession).not.toHaveBeenCalled();
    });

    it("drops a request with no Origin at all", async () => {
      const res = await post(beacon([SCREEN_OPEN]), {});
      expect(res.status).toBe(204);
      expect(recordEvents).not.toHaveBeenCalled();
    });

    it("rejects the literal Origin: null and a prefix look-alike", async () => {
      await post(beacon([SCREEN_OPEN]), { Origin: "null" });
      await post(beacon([SCREEN_OPEN]), {
        Origin: "https://ambit.example.evil.test",
      });
      await post(beacon([SCREEN_OPEN]), {
        Origin: "https://ambit.example:8443",
      });
      expect(recordEvents).not.toHaveBeenCalled();
    });

    it("outside production also accepts the dev tailnet origins", async () => {
      const dev = "https://macbook-air-m5.halley-morpho.ts.net";
      await post(beacon([SCREEN_OPEN]), { Origin: dev });
      expect(recordEvents).toHaveBeenCalledTimes(1);
    });

    it("in production accepts only the app's own origin", async () => {
      vi.stubEnv("NODE_ENV", "production");
      await post(beacon([SCREEN_OPEN]), {
        Origin: "https://macbook-air-m5.halley-morpho.ts.net",
      });
      expect(recordEvents).not.toHaveBeenCalled();
      await post(beacon([SCREEN_OPEN]), { Origin: ORIGIN });
      expect(recordEvents).toHaveBeenCalledTimes(1);
      vi.unstubAllEnvs();
    });

    it("compares the origin, not the whole BETTER_AUTH_URL", async () => {
      await post(beacon([SCREEN_OPEN]), { Origin: ORIGIN });
      expect(recordEvents).toHaveBeenCalledTimes(1);
    });
  });

  // ---- (b) rate limit -----------------------------------------------------------------------
  describe("(b) rate limit", () => {
    it("keys on the user id when signed in", async () => {
      await post(beacon([SCREEN_OPEN]));
      expect(limiterState.keys).toEqual(["u1"]);
    });

    it("keys on the trusted (last) forwarded hop when signed out", async () => {
      getSession.mockResolvedValue(null);
      await post(beacon([SCREEN_OPEN]), {
        Origin: ORIGIN,
        "x-forwarded-for": "6.6.6.6, 10.0.0.9",
      });
      expect(limiterState.keys).toEqual(["10.0.0.9"]);
    });

    it("falls back to 'unknown'", async () => {
      getSession.mockResolvedValue(null);
      await post(beacon([SCREEN_OPEN]));
      expect(limiterState.keys).toEqual(["unknown"]);
    });

    it("drops everything over the limit, still 204", async () => {
      limiterState.allow = false;
      const res = await post(beacon([SCREEN_OPEN]));
      expect(res.status).toBe(204);
      expect(recordEvents).not.toHaveBeenCalled();
    });
  });

  // ---- (c) body size and shape --------------------------------------------------------------
  describe("(c) body", () => {
    it("drops a body over 64 KB before parsing it", async () => {
      const big = JSON.stringify(
        beacon([{ ...SCREEN_OPEN, pad: "x".repeat(70 * 1024) }]),
      );
      const res = await post(big);
      expect(res.status).toBe(204);
      expect(recordEvents).not.toHaveBeenCalled();
    });

    it("counts bytes, not characters", async () => {
      // 25,000 three-byte characters is 75 KB of bytes but only 25k characters.
      const wide = JSON.stringify(
        beacon([{ ...SCREEN_OPEN, pad: "€".repeat(25_000) }]),
      );
      expect(wide.length).toBeLessThan(64 * 1024);
      await post(wide);
      expect(recordEvents).not.toHaveBeenCalled();
    });

    it("refuses an oversized Content-Length without reading the body", async () => {
      const req = new Request("https://ambit.example/api/usage", {
        method: "POST",
        headers: { Origin: ORIGIN, "Content-Length": "70000" },
        body: JSON.stringify(beacon([SCREEN_OPEN])),
      });
      const text = vi.spyOn(req, "text");
      const res = await POST(req);
      expect(res.status).toBe(204);
      expect(recordEvents).not.toHaveBeenCalled();
      expect(text).not.toHaveBeenCalled();
    });

    it("cancels a streamed body that passes the cap, with no or a lying Content-Length", async () => {
      let pulled = 0;
      let cancelled = false;
      const chunk = new Uint8Array(16 * 1024).fill(120);
      const stream = new ReadableStream<Uint8Array>({
        pull(c) {
          pulled += 1;
          c.enqueue(chunk); // endless: only a cancel stops it
        },
        cancel() {
          cancelled = true;
        },
      });
      const req = new Request("https://ambit.example/api/usage", {
        method: "POST",
        headers: { Origin: ORIGIN, "Content-Length": "10" }, // lies
        body: stream,
        duplex: "half",
      } as RequestInit);
      const res = await POST(req);
      expect(res.status).toBe(204);
      expect(cancelled).toBe(true);
      expect(pulled).toBeLessThan(10);
      expect(recordEvents).not.toHaveBeenCalled();
    });

    it("drops invalid JSON, still 204", async () => {
      const res = await post("{not json");
      expect(res.status).toBe(204);
      expect(recordEvents).not.toHaveBeenCalled();
    });

    it.each([
      ["a visit that is too short", { visit: "short", events: [SCREEN_OPEN] }],
      [
        "a visit that is too long",
        { visit: "v".repeat(33), events: [SCREEN_OPEN] },
      ],
      ["a missing visit", { events: [SCREEN_OPEN] }],
      ["events that are not an array", { visit: "visit-abcdef", events: 1 }],
      ["a body that is not an object", [1, 2]],
    ])("drops the whole batch for %s", async (_name, body) => {
      const res = await post(body);
      expect(res.status).toBe(204);
      expect(recordEvents).not.toHaveBeenCalled();
    });
  });

  // ---- (d) per-event validation -------------------------------------------------------------
  describe("(d) per-event validation drops the event, not the batch", () => {
    const bad: Array<[string, unknown]> = [
      ["an unknown kind", { ...SCREEN_OPEN, kind: "page.view" }],
      ["an unknown screen", { ...SCREEN_OPEN, screen: "/feed?x=1" }],
      ["an unparseable at", { ...SCREEN_OPEN, at: "yesterday" }],
      ["a missing at", { kind: "screen.open" }],
      ["an over-long itemId", { ...SCREEN_OPEN, itemId: "i".repeat(33) }],
      ["an over-long topicId", { ...SCREEN_OPEN, topicId: "t".repeat(65) }],
      ["an unknown meta key", { ...SCREEN_OPEN, meta: { url: "/feed" } }],
      [
        "meta on a kind that carries none",
        { ...SCREEN_OPEN, meta: { anything: 1 } },
      ],
      [
        "an unknown meta key beside a valid one",
        { kind: "item.open", at: iso(-5), meta: { from: "feed", ua: "x" } },
      ],
      [
        "a meta value outside its enum",
        { kind: "item.open", at: iso(-5), meta: { from: "elsewhere" } },
      ],
      ["a missing required meta key", { kind: "item.open", at: iso(-5) }],
      [
        "a meta value of the wrong type",
        { kind: "item.magazine", at: iso(-5), meta: { on: "yes" } },
      ],
      [
        "onboarding.step with step 9",
        {
          kind: "onboarding.step",
          at: iso(-5),
          meta: { step: 9, action: "answer" },
        },
      ],
      [
        "onboarding.step with a topics.edit action",
        {
          kind: "onboarding.step",
          at: iso(-5),
          meta: { step: 2, action: "add" },
        },
      ],
      [
        "an over-long error digest",
        {
          kind: "client.error",
          at: iso(-5),
          meta: { digest: "d".repeat(33) },
        },
      ],
      [
        "visit.end seconds over 24 h",
        { kind: "visit.end", at: iso(-5), meta: { seconds: 86_401 } },
      ],
      [
        "visit.end seconds of 1e300",
        { kind: "visit.end", at: iso(-5), meta: { seconds: 1e300 } },
      ],
      [
        "visit.end negative seconds",
        { kind: "visit.end", at: iso(-5), meta: { seconds: -1 } },
      ],
      ["a non-object event", "screen.open"],
      ["a null event", null],
    ];

    it.each(bad)(
      "drops an event with %s and keeps its neighbour",
      async (_n, event) => {
        const res = await post(beacon([event, SCREEN_OPEN]));
        expect(res.status).toBe(204);
        expect(written()).toHaveLength(1);
        expect(written()![0]!.kind).toBe("screen.open");
      },
    );

    it("keeps valid meta of each shape (enum, bool, int, bounded string)", async () => {
      await post(
        beacon([
          {
            kind: "visit.start",
            at: iso(-9),
            meta: { device: "phone", standalone: true, via: "direct" },
          },
          { kind: "visit.end", at: iso(-8), meta: { seconds: 125 } },
          {
            kind: "onboarding.step",
            at: iso(-7),
            meta: { step: 8, action: "skip" },
          },
          {
            kind: "client.error",
            at: iso(-6),
            meta: { digest: "abc123" },
          },
        ]),
      );
      expect(written()!.map((r) => r.meta)).toEqual([
        { device: "phone", standalone: true, via: "direct" },
        { seconds: 125 },
        { step: 8, action: "skip" },
        { digest: "abc123" },
      ]);
    });

    it("keeps the first 50 events and drops the 51st onward", async () => {
      const events = Array.from({ length: 53 }, () => SCREEN_OPEN);
      const res = await post(beacon(events));
      expect(res.status).toBe(204);
      expect(written()).toHaveLength(50);
    });
  });

  // ---- (e) clamping `at` --------------------------------------------------------------------
  describe("(e) at is clamped to [now - 1 h, now]", () => {
    it("pulls a future timestamp back to now", async () => {
      await post(beacon([{ ...SCREEN_OPEN, at: iso(+3_600_000) }]));
      expect(written()![0]!.at).toEqual(NOW);
    });

    it("pushes a stale timestamp up to now - 1 h", async () => {
      await post(beacon([{ ...SCREEN_OPEN, at: iso(-86_400_000) }]));
      expect(written()![0]!.at).toEqual(new Date(NOW.getTime() - 3_600_000));
    });

    it("leaves a timestamp inside the window alone", async () => {
      await post(beacon([{ ...SCREEN_OPEN, at: iso(-1_800_000) }]));
      expect(written()![0]!.at).toEqual(new Date(NOW.getTime() - 1_800_000));
    });
  });

  // ---- (f) session --------------------------------------------------------------------------
  describe("(f) the session decides the userId", () => {
    const mixed = [
      {
        kind: "visit.start",
        at: iso(-9),
        meta: { device: "desktop", standalone: false, via: "link" },
      },
      { kind: "visit.end", at: iso(-8), meta: { seconds: 3 } },
      SCREEN_OPEN,
      { kind: "item.open", at: iso(-6), meta: { from: "feed" } },
      { kind: "item.zoom", at: iso(-5) },
      { kind: "client.error", at: iso(-4), meta: { digest: "x" } },
    ];

    it("signed out keeps only visit.* and screen.open, with userId null", async () => {
      getSession.mockResolvedValue(null);
      await post(beacon(mixed));
      expect(written()!.map((r) => [r.kind, r.userId])).toEqual([
        ["visit.start", null],
        ["visit.end", null],
        ["screen.open", null],
      ]);
    });

    it("signed in keeps everything, stamped with the user id", async () => {
      await post(beacon(mixed));
      expect(written()).toHaveLength(6);
      expect(new Set(written()!.map((r) => r.userId))).toEqual(new Set(["u1"]));
    });

    it("treats a throwing session lookup as signed out and still answers 204", async () => {
      getSession.mockRejectedValue(new Error("db down"));
      const res = await post(beacon(mixed));
      expect(res.status).toBe(204);
      expect(written()!.every((r) => r.userId === null)).toBe(true);
      expect(written()).toHaveLength(3);
    });
  });

  // ---- (g)/(h) writer and answer ------------------------------------------------------------
  describe("(g) the writer and (h) the answer", () => {
    it("does not call the writer when nothing survives", async () => {
      await post(beacon([{ ...SCREEN_OPEN, kind: "nope" }]));
      expect(recordEvents).not.toHaveBeenCalled();
    });

    it("still answers 204 when the writer throws", async () => {
      recordEvents.mockRejectedValue(new Error("boom"));
      const res = await post(beacon([SCREEN_OPEN]));
      expect(res.status).toBe(204);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    });
  });

  describe("the drop log", () => {
    it("is silent when the only drops are a signed-out reader's item events", async () => {
      getSession.mockResolvedValue(null);
      const res = await post(
        beacon([
          SCREEN_OPEN,
          { kind: "item.open", at: iso(-6), meta: { from: "feed" } },
          { kind: "item.zoom", at: iso(-5) },
        ]),
      );
      expect(res.status).toBe(204);
      expect(written()).toHaveLength(1);
      expect(console.warn).not.toHaveBeenCalled();
    });

    it("still warns when a signed-out beacon also carries an invalid event", async () => {
      getSession.mockResolvedValue(null);
      await post(
        beacon([
          { kind: "item.zoom", at: iso(-5) },
          { ...SCREEN_OPEN, kind: "secret-kind-name" },
        ]),
      );
      expect(console.warn).toHaveBeenCalledTimes(1);
    });

    it("warns once with counts only, never contents", async () => {
      await post(
        beacon([
          SCREEN_OPEN,
          { ...SCREEN_OPEN, kind: "secret-kind-name" },
          { ...SCREEN_OPEN, meta: { url: "https://private.example/x" } },
        ]),
      );
      expect(console.warn).toHaveBeenCalledTimes(1);
      const line = JSON.stringify(vi.mocked(console.warn).mock.calls[0]);
      expect(line).toContain("dropped");
      expect(line).not.toContain("secret-kind-name");
      expect(line).not.toContain("private.example");
      expect(line).not.toContain("visit-abcdef");
    });
  });
});
