import { describe, expect, it } from "vitest";

import { RateLimiter, trustedClientIp } from "./rate-limit";

// A tiny fake clock — same "injected seam" idea as services/random.ts's rng, so these tests move
// time deterministically instead of using a real sleep.
function fakeClock(start = 0) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("RateLimiter", () => {
  it("allows requests under the limit", () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({
      limit: 3,
      windowMs: 1000,
      now: clock.now,
    });

    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("a")).toBe(true);
  });

  it("blocks requests once the limit is hit within the window", () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({
      limit: 2,
      windowMs: 1000,
      now: clock.now,
    });

    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("a")).toBe(false); // third hit within the same window
    expect(limiter.allow("a")).toBe(false); // still blocked, not reset by retrying
  });

  it("slides the window: old hits expire and free up budget", () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({
      limit: 2,
      windowMs: 1000,
      now: clock.now,
    });

    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("a")).toBe(false);

    clock.advance(1001); // past the window — both earlier hits have now aged out
    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("a")).toBe(false);
  });

  it("partial sliding: only hits older than windowMs age out, not the whole bucket at once", () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({
      limit: 2,
      windowMs: 1000,
      now: clock.now,
    });

    expect(limiter.allow("a")).toBe(true); // t=0
    clock.advance(600);
    expect(limiter.allow("a")).toBe(true); // t=600, still 2 hits in the 1000ms window
    expect(limiter.allow("a")).toBe(false); // t=600, budget used up

    clock.advance(500); // t=1100 — the t=0 hit has aged out (1100-0 > 1000), t=600 hasn't
    expect(limiter.allow("a")).toBe(true); // room for exactly one more
    expect(limiter.allow("a")).toBe(false); // but not two
  });

  it("keeps separate keys fully isolated from each other", () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({
      limit: 1,
      windowMs: 1000,
      now: clock.now,
    });

    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("a")).toBe(false);
    // "b" has its own budget, untouched by "a" exhausting its own.
    expect(limiter.allow("b")).toBe(true);
    expect(limiter.allow("b")).toBe(false);
  });

  it("defaults to the real clock when none is injected", () => {
    const limiter = new RateLimiter({ limit: 1, windowMs: 1000 });
    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("a")).toBe(false);
  });
});

describe("trustedClientIp", () => {
  it("returns null when there's no x-forwarded-for header at all", () => {
    expect(trustedClientIp(new Headers())).toBeNull();
  });

  it("returns the single value when there's exactly one hop", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.7" });
    expect(trustedClientIp(headers)).toBe("203.0.113.7");
  });

  it("takes the LAST hop, not the first, from a multi-hop chain", () => {
    // client -> proxy1 -> proxy2 (our trusted reverse proxy) -> us. The client-supplied first
    // entry must never be trusted; only the last hop (appended by our own proxy) can be.
    const headers = new Headers({
      "x-forwarded-for": "1.2.3.4, 5.6.7.8, 9.10.11.12",
    });
    expect(trustedClientIp(headers)).toBe("9.10.11.12");
  });

  it("is not fooled by a spoofed first hop that changes on every request", () => {
    // A malicious client can send any value it wants as the *first* entry, but our trusted proxy
    // always appends the same real address as the *last* entry — so the key stays stable across
    // requests from the same real client even as the attacker-controlled prefix changes.
    const attempt1 = trustedClientIp(
      new Headers({ "x-forwarded-for": "attacker-value-1, 9.10.11.12" }),
    );
    const attempt2 = trustedClientIp(
      new Headers({ "x-forwarded-for": "totally-different-9999, 9.10.11.12" }),
    );
    expect(attempt1).toBe("9.10.11.12");
    expect(attempt2).toBe("9.10.11.12");
    expect(attempt1).toBe(attempt2);
  });

  it("trims whitespace around the last hop", () => {
    const headers = new Headers({
      "x-forwarded-for": "1.2.3.4,  9.10.11.12  ",
    });
    expect(trustedClientIp(headers)).toBe("9.10.11.12");
  });

  it("returns null for an empty header value", () => {
    const headers = new Headers({ "x-forwarded-for": "" });
    expect(trustedClientIp(headers)).toBeNull();
  });
});
