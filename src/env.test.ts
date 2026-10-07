// The image proxy's budget knob (10-07-26). Two things worth pinning: the default is production's
// number — nothing in production sets the variable, so the default *is* the deployed budget — and
// the string a shell hands over becomes a number before the limiter sees it. `~/env` validates
// the whole schema the moment it is imported, so each case resets the module registry and
// imports it afresh with the variable set the way that case needs.
import { afterEach, describe, expect, it, vi } from "vitest";

const original = process.env.IMG_RATE_LIMIT_PER_MIN;

async function envWith(value: string | undefined) {
  if (value === undefined) delete process.env.IMG_RATE_LIMIT_PER_MIN;
  else process.env.IMG_RATE_LIMIT_PER_MIN = value;
  vi.resetModules();
  return (await import("./env")).env;
}

afterEach(() => {
  if (original === undefined) delete process.env.IMG_RATE_LIMIT_PER_MIN;
  else process.env.IMG_RATE_LIMIT_PER_MIN = original;
  vi.resetModules();
});

describe("IMG_RATE_LIMIT_PER_MIN", () => {
  it("defaults to 600 — the budget production runs", async () => {
    expect((await envWith(undefined)).IMG_RATE_LIMIT_PER_MIN).toBe(600);
  });

  it("is a number by the time the limiter reads it", async () => {
    expect((await envWith("6000")).IMG_RATE_LIMIT_PER_MIN).toBe(6000);
  });
});
