// The bearer decision is a pure function of (source, env), so it is unit-tested here and the two
// fetch sites (curator.ts, image-cache.ts) only test that they *merge* what it returns.
import { afterEach, describe, expect, it, vi } from "vitest";

import { imageFetchHeaders } from "./image-auth";

describe("imageFetchHeaders", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("sends the Loupe bearer for a loupe item", () => {
    vi.stubEnv("LOUPE_API_TOKEN", "tok-123");
    expect(imageFetchHeaders("loupe")).toEqual({
      Authorization: "Bearer tok-123",
    });
  });

  it("sends nothing for every other source, token or no token", () => {
    vi.stubEnv("LOUPE_API_TOKEN", "tok-123");
    expect(imageFetchHeaders("met")).toEqual({});
    expect(imageFetchHeaders("archive")).toEqual({});
    expect(imageFetchHeaders("pdr")).toEqual({});
  });

  it("sends nothing for loupe when the token is unset — the upstream 401 is the report", () => {
    vi.stubEnv("LOUPE_API_TOKEN", "");
    expect(imageFetchHeaders("loupe")).toEqual({});
  });
});
