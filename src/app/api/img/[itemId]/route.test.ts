import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Item } from "~/server/db/items";
import type * as RateLimitModule from "~/server/services/rate-limit";
import { GET } from "./route";

// The DB is the route's *only* source of URLs — mocking it here is also what pins that contract:
// there is no other way for a caller to influence what gets fetched.
const getItemById = vi.hoisted(() => vi.fn());
vi.mock("~/server/db/items", () => ({ getItemById }));

// A stand-in limiter so the 429 branch is one flag away instead of 600 requests away. It records
// what it was constructed with and what key it was asked about, which is the part worth asserting:
// the real `RateLimiter` class has its own coverage in `services/rate-limit.test.ts`.
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

const itemWith = (imageUrl: string | null): Item =>
  ({
    id: "item-1",
    title: "A painting",
    imageUrl,
  }) as Item;

const request = (headers: Record<string, string> = {}) =>
  new Request("http://ambit.test/api/img/item-1", { headers });

const call = (itemId = "item-1", headers?: Record<string, string>) =>
  GET(request(headers), { params: Promise.resolve({ itemId }) });

beforeEach(() => {
  limiterState.allow = true;
  limiterState.keys = [];
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("GET /api/img/[itemId]", () => {
  it("streams the upstream image with an immutable cache header", async () => {
    getItemById.mockResolvedValue(itemWith("https://cdn.test/a.png"));
    vi.mocked(fetch).mockResolvedValue(
      new Response("PNGBYTES", { headers: { "Content-Type": "image/png" } }),
    );

    const res = await call();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(await res.text()).toBe("PNGBYTES");
  });

  // The whole reason the route exists: AIC's Cloudflare rules 403 a localhost referer, and a
  // server-side fetch that sends no referer at all sidesteps them (HANDOFF_aic-images.md §2.2).
  it("fetches the stored URL with Ambit's UA and no referer", async () => {
    getItemById.mockResolvedValue(
      itemWith("https://www.artic.edu/iiif/2/abc/full/843,/0/default.jpg"),
    );
    vi.mocked(fetch).mockResolvedValue(new Response("BYTES"));

    await call();

    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe(
      "https://www.artic.edu/iiif/2/abc/full/843,/0/default.jpg",
    );
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers["User-Agent"]).toContain("Ambit/");
    expect(Object.keys(headers).map((h) => h.toLowerCase())).not.toContain(
      "referer",
    );
  });

  it("404s an unknown item", async () => {
    getItemById.mockResolvedValue(undefined);

    const res = await call("nope");

    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("404s an item with no image", async () => {
    getItemById.mockResolvedValue(itemWith(null));

    expect((await call()).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  // `data:` images (the e2e corpus) are rendered straight by the client; anything non-http(s) is
  // not something this server should dereference on a caller's behalf.
  it("404s a non-http(s) image URL rather than dereferencing it", async () => {
    getItemById.mockResolvedValue(itemWith("data:image/gif;base64,R0lGOD"));

    expect((await call()).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("502s — uncached — when upstream refuses", async () => {
    getItemById.mockResolvedValue(itemWith("https://cdn.test/a.png"));
    vi.mocked(fetch).mockResolvedValue(new Response("no", { status: 403 }));

    const res = await call();

    expect(res.status).toBe(502);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("502s when the upstream fetch throws or times out", async () => {
    getItemById.mockResolvedValue(itemWith("https://cdn.test/a.png"));
    vi.mocked(fetch).mockRejectedValue(new Error("timed out"));

    expect((await call()).status).toBe(502);
  });

  it("rate limits on the trusted client IP, before any DB or upstream work", async () => {
    limiterState.allow = false;
    getItemById.mockResolvedValue(itemWith("https://cdn.test/a.png"));

    const res = await call("item-1", {
      "x-forwarded-for": "1.2.3.4, 10.0.0.1",
    });

    expect(res.status).toBe(429);
    expect(res.headers.get("cache-control")).toBe("no-store");
    // Last hop, not the spoofable first one — same rule as the tRPC limiter.
    expect(limiterState.keys).toEqual(["10.0.0.1"]);
    expect(getItemById).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("buys its own budget rather than sharing the API's", async () => {
    expect(limiterState.options).toEqual({ limit: 600, windowMs: 60_000 });
  });
});
