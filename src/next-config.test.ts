// Pins the one Next flag this app turns off, and why (next.config.js carries the full story).
//
// `experimental.reactDebugChannel` defaults to `true` in Next 16.2, and with it on, a direct
// load of `/feed` in Firefox reloads itself before hydration for as long as the tab stays open —
// the dev client reads Firefox's not-yet-populated `transferSize` on a still-streaming response
// as "restored from the HTTP cache" and force-reloads to get a live debug channel. It cost two
// sessions (09-08 and 09-11-26) before it was caught, and nothing about a tidy-up of the
// `experimental` block would look wrong. This test is what makes silently flipping it back cost
// a red run instead. Retire it, and the key, once Next is on ≥ 16.3.5, which decides the cache
// question differently.
import { describe, expect, it } from "vitest";

describe("next.config.js", () => {
  it("keeps React's dev debug channel off (Firefox /feed reload loop, 09-11-26)", async () => {
    const { default: config } = await import("../next.config.js");
    expect(config.experimental?.reactDebugChannel).toBe(false);
  });
});
