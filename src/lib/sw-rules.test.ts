import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isAuthApi,
  isFeedDocument,
  isImageProxy,
  isNextStatic,
  isStaticAsset,
  isTrpc,
  PAGES_CACHE,
  purgePagesCache,
  type MatchInput,
} from "./sw-rules";

const ORIGIN = "https://ambit.example";

function req(
  path: string,
  {
    mode = "cors",
    destination = "",
    origin = ORIGIN,
  }: {
    mode?: RequestMode;
    destination?: RequestDestination;
    origin?: string;
  } = {},
): MatchInput {
  const url = new URL(path, origin);
  return {
    url,
    sameOrigin: url.origin === ORIGIN,
    request: { mode, destination },
  };
}

const nav = (path: string) =>
  req(path, { mode: "navigate", destination: "document" });

/** Every rule that puts a response into a cache. */
const CACHING_RULES = [
  isImageProxy,
  isFeedDocument,
  isNextStatic,
  isStaticAsset,
];

describe("isAuthApi", () => {
  it("matches Better Auth's endpoints", () => {
    expect(isAuthApi(req("/api/auth/session"))).toBe(true);
    expect(isAuthApi(req("/api/auth/sign-in/email"))).toBe(true);
  });

  it("ignores everything else", () => {
    expect(isAuthApi(req("/api/trpc/feed.page"))).toBe(false);
    expect(isAuthApi(req("/feed"))).toBe(false);
  });
});

describe("isTrpc", () => {
  it("matches a batched query, which is how the feed actually travels", () => {
    expect(isTrpc(req("/api/trpc/feed.page?batch=1&input=%7B%7D"))).toBe(true);
  });

  it("does not match the image proxy or a page", () => {
    expect(isTrpc(req("/api/img/abc123"))).toBe(false);
    expect(isTrpc(nav("/feed"))).toBe(false);
  });

  it("does not match another origin's tRPC", () => {
    expect(
      isTrpc(req("/api/trpc/x", { origin: "https://elsewhere.test" })),
    ).toBe(false);
  });
});

describe("isImageProxy", () => {
  it("matches proxied item images", () => {
    expect(isImageProxy(req("/api/img/01HXY"))).toBe(true);
  });

  it("does not match the API root or a landing slide", () => {
    expect(isImageProxy(req("/api/trpc/items.byId"))).toBe(false);
    expect(isImageProxy(req("/landing/great-wave.jpg"))).toBe(false);
  });
});

describe("isFeedDocument", () => {
  it("matches a real navigation to the feed", () => {
    expect(isFeedDocument(nav("/feed"))).toBe(true);
  });

  it("ignores the feed's own data fetches — only the document is cached", () => {
    expect(isFeedDocument(req("/feed"))).toBe(false);
  });

  it("ignores every other page, including the landing redirect", () => {
    expect(isFeedDocument(nav("/"))).toBe(false);
    expect(isFeedDocument(nav("/feed/"))).toBe(false);
    expect(isFeedDocument(nav("/saved"))).toBe(false);
    expect(isFeedDocument(nav("/i/abc"))).toBe(false);
  });

  it("ignores another origin", () => {
    expect(
      isFeedDocument({
        ...nav("/feed"),
        sameOrigin: false,
      }),
    ).toBe(false);
  });
});

describe("isNextStatic", () => {
  it("matches build output", () => {
    expect(isNextStatic(req("/_next/static/chunks/main-abc.js"))).toBe(true);
  });

  it("does not match Next's image optimizer or an API route", () => {
    expect(isNextStatic(req("/_next/image?url=%2Ffoo.png"))).toBe(false);
    expect(isNextStatic(req("/api/img/x"))).toBe(false);
  });
});

describe("isStaticAsset", () => {
  it("matches the landing slideshow and the app icons", () => {
    expect(isStaticAsset(req("/landing/great-wave.jpg"))).toBe(true);
    expect(isStaticAsset(req("/icon-192.png"))).toBe(true);
    expect(isStaticAsset(req("/icon-512-maskable.png"))).toBe(true);
  });

  it("does not match the favicon or arbitrary root files", () => {
    expect(isStaticAsset(req("/favicon.ico"))).toBe(false);
    expect(isStaticAsset(req("/icon.png"))).toBe(false);
  });
});

// The invariant the whole strategy exists to protect. Stated as a test rather than a comment so a
// future rule that widens a matcher — a `/api/` prefix, say — fails here instead of shipping.
describe("the personalized-data invariant", () => {
  it("routes no tRPC request into any caching rule", () => {
    const trpcRequests = [
      req("/api/trpc/feed.page?batch=1"),
      req("/api/trpc/saves.list"),
      req("/api/trpc/user.me"),
      nav("/api/trpc/feed.page"),
    ];

    for (const request of trpcRequests) {
      expect(isTrpc(request)).toBe(true);
      for (const rule of CACHING_RULES) {
        expect(rule(request)).toBe(false);
      }
    }
  });

  it("routes no auth request into any caching rule", () => {
    const request = req("/api/auth/session");
    expect(isAuthApi(request)).toBe(true);
    for (const rule of CACHING_RULES) {
      expect(rule(request)).toBe(false);
    }
  });
});

describe("purgePagesCache", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("deletes the pages bucket by name", async () => {
    const del = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("caches", { delete: del });

    await purgePagesCache();

    expect(del).toHaveBeenCalledWith(PAGES_CACHE);
  });

  it("is a no-op where the Cache API doesn't exist", async () => {
    await expect(purgePagesCache()).resolves.toBeUndefined();
  });

  it("swallows a failing delete — signing out must not depend on it", async () => {
    vi.stubGlobal("caches", {
      delete: vi.fn().mockRejectedValue(new Error("nope")),
    });

    await expect(purgePagesCache()).resolves.toBeUndefined();
  });
});
