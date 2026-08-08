import { describe, expect, it } from "vitest";

import { RateLimiter } from "./rate-limit";

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
