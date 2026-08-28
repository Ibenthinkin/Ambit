import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Item } from "~/server/db/items";
import type * as ImageCacheModule from "~/server/services/image-cache";
import { ImageFillError } from "~/server/services/image-cache";
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

// Phase 7.3: the route no longer fetches anything itself — it hands the item to the cache and
// turns what comes back into a response. So the cache is mocked here for the same reason the DB is
// (this file's subject is the handler's contract), and `image-cache.test.ts` owns the fetch,
// resize, atomic write, in-flight dedupe and the no-referer rule.
//
// `importActual` matters: the real `ImageFillError` class has to reach the route, because the
// route tells a cache failure from a programming mistake with `instanceof`.
const getOrFill = vi.hoisted(() => vi.fn());
vi.mock("~/server/services/image-cache", async () => ({
  ...(await vi.importActual<typeof ImageCacheModule>(
    "~/server/services/image-cache",
  )),
  getOrFill,
}));

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

/** What a filled cache hands back: the WebP bytes, and whether they came off disk. */
const cached = (text = "WEBPBYTES", hit = false) => ({
  bytes: Buffer.from(text),
  contentType: "image/webp" as const,
  hit,
});

beforeEach(() => {
  limiterState.allow = true;
  limiterState.keys = [];
  getOrFill.mockReset().mockResolvedValue(cached());
  // Still stubbed, and still asserted on below: after 7.3 the route reaching `fetch` at all would
  // mean it had gone around the cache.
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("GET /api/img/[itemId]", () => {
  it("serves the cached WebP with an immutable cache header", async () => {
    getItemById.mockResolvedValue(itemWith("https://cdn.test/a.png"));

    const res = await call();

    expect(res.status).toBe(200);
    // One variant per item since 7.3, always WebP (decision D2).
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("content-length")).toBe("9"); // "WEBPBYTES"
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(await res.text()).toBe("WEBPBYTES");
  });

  // The header exists so "the cache actually works" is observable rather than inferred from a
  // stopwatch — `bun run start` plus two curls is the live proof, and this is the unit one.
  it("reports whether the bytes came off disk or cost an upstream fetch", async () => {
    getItemById.mockResolvedValue(itemWith("https://cdn.test/a.png"));

    getOrFill.mockResolvedValueOnce(cached("A", false));
    expect((await call()).headers.get("x-ambit-cache")).toBe("fill");

    getOrFill.mockResolvedValueOnce(cached("A", true));
    expect((await call()).headers.get("x-ambit-cache")).toBe("hit");
  });

  // **The itemId is the whole security boundary** (SPEC §11): the URL comes from our own table and
  // there is no other way for a caller to influence what gets fetched. What the route hands the
  // cache is the row it just read — never anything off the request.
  it("hands the cache the row it read, and never fetches anything itself", async () => {
    const item = itemWith(
      "https://www.artic.edu/iiif/2/abc/full/843,/0/default.jpg",
    );
    getItemById.mockResolvedValue(item);

    await call();

    expect(getOrFill).toHaveBeenCalledWith(item);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("404s an unknown item", async () => {
    getItemById.mockResolvedValue(undefined);

    const res = await call("nope");

    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(getOrFill).not.toHaveBeenCalled();
  });

  it("404s an item with no image", async () => {
    getItemById.mockResolvedValue(itemWith(null));

    expect((await call()).status).toBe(404);
    expect(getOrFill).not.toHaveBeenCalled();
  });

  // `data:` images (the e2e corpus) are rendered straight by the client; anything non-http(s) is
  // not something this server should dereference on a caller's behalf.
  it("404s a non-http(s) image URL rather than dereferencing it", async () => {
    getItemById.mockResolvedValue(itemWith("data:image/gif;base64,R0lGOD"));

    expect((await call()).status).toBe(404);
    expect(getOrFill).not.toHaveBeenCalled();
  });

  // Decision D4: nothing about a failure is remembered, at any layer — the cache writes no file
  // and the response says no-store, so the next request tries again.
  it.each(["upstream", "decode", "too-large", "timeout"] as const)(
    "502s — uncached — on a %s fill failure",
    async (kind) => {
      getItemById.mockResolvedValue(itemWith("https://cdn.test/a.png"));
      getOrFill.mockRejectedValue(new ImageFillError(kind, "nope"));

      const res = await call();

      expect(res.status).toBe(502);
      expect(res.headers.get("cache-control")).toBe("no-store");
    },
  );

  // A cache failure is a 502; a *programming* mistake must not be quietly dressed up as one.
  it("lets a non-ImageFillError propagate rather than masking it as a 502", async () => {
    getItemById.mockResolvedValue(itemWith("https://cdn.test/a.png"));
    getOrFill.mockRejectedValue(new TypeError("undefined is not a function"));

    await expect(call()).rejects.toBeInstanceOf(TypeError);
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
    expect(getOrFill).not.toHaveBeenCalled();
  });

  it("buys its own budget rather than sharing the API's", async () => {
    expect(limiterState.options).toEqual({ limit: 600, windowMs: 60_000 });
  });
});
