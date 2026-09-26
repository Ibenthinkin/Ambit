import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listLandingPool = vi.hoisted(() => vi.fn());
vi.mock("~/server/db/items", () => ({ listLandingPool }));

import {
  FALLBACK_PICTURE,
  getReels,
  pickReel,
  POOL_TTL_MS,
  REEL_SIZE,
  reelPicture,
  resetLandingPoolForTests,
} from "./landing-pool";

// Tall rows by default; `wide` for the computer reel.
const row = (id: string, shape: "tall" | "wide" = "tall") => ({
  id,
  imageUrl: `https://m.test/${id}.jpg`,
  width: shape === "tall" ? 900 : 1600,
  height: shape === "tall" ? 1400 : 1000,
});

beforeEach(() => {
  vi.useFakeTimers();
  resetLandingPoolForTests();
  listLandingPool
    .mockReset()
    .mockResolvedValue(["a", "b", "c", "d", "e"].map((id) => row(id)));
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("pickReel", () => {
  it("is a shuffled subset of n, without repeats, deterministic under an injected rng", () => {
    let i = 0;
    const rng = () => [0.1, 0.9, 0.5, 0.3, 0.7][i++ % 5]!;
    const a = pickReel(["a", "b", "c", "d", "e"], 3, rng);
    expect(a).toHaveLength(3);
    expect(new Set(a).size).toBe(3);
    i = 0;
    expect(pickReel(["a", "b", "c", "d", "e"], 3, rng)).toEqual(a);
  });

  it("returns the whole pool, shuffled, when n exceeds it", () => {
    expect(pickReel(["a", "b"], 12, () => 0).sort()).toEqual(["a", "b"]);
  });

  it("does not mutate its input", () => {
    const ids = ["a", "b", "c"];
    pickReel(ids, 2, () => 0);
    expect(ids).toEqual(["a", "b", "c"]);
  });
});

describe("reelPicture", () => {
  // 09-25-26: the master, not the 960 rendition — a full-bleed picture on a 3× phone needs every
  // pixel it has (the tall pool's median master is 893 px high, under 960 anyway).
  it("is the proxied master for an http image", () => {
    expect(reelPicture("id1", "https://museum.test/x.jpg")).toEqual({
      id: "id1",
      src: "/api/img/id1",
      srcSet: null,
    });
  });

  it("passes a data: URL through (the e2e fixtures)", () => {
    expect(reelPicture("id2", "data:image/png;base64,AAAA")).toEqual({
      id: "id2",
      src: "data:image/png;base64,AAAA",
      srcSet: null,
    });
  });
});

describe("getReels", () => {
  it("picks a tall reel for phones and a wide one for computers, never mixing shapes", async () => {
    listLandingPool.mockResolvedValue([
      ...Array.from({ length: 20 }, (_, i) => row(`t${i}`, "tall")),
      ...Array.from({ length: 20 }, (_, i) => row(`w${i}`, "wide")),
      {
        id: "sq",
        imageUrl: "https://m.test/sq.jpg",
        width: 1000,
        height: 1000,
      },
      {
        id: "tiny",
        imageUrl: "https://m.test/tiny.jpg",
        width: 300,
        height: 500,
      },
    ]);
    const { portrait, landscape } = await getReels();
    expect(portrait).toHaveLength(REEL_SIZE);
    expect(landscape).toHaveLength(REEL_SIZE);
    expect(portrait.every((p) => p.id.startsWith("t"))).toBe(true);
    expect(landscape.every((p) => p.id.startsWith("w"))).toBe(true);
    expect(portrait[0]!.src).toMatch(/^\/api\/img\/t\d+$/);
  });

  it("queries once, then serves picks from the memo until the TTL passes (Review Focus 4)", async () => {
    await getReels(2);
    await getReels(2);
    expect(listLandingPool).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(POOL_TTL_MS + 1);
    await getReels(2);
    expect(listLandingPool).toHaveBeenCalledTimes(2);
  });

  it("a shape with no pictures falls back to the committed picture; the other is unaffected", async () => {
    listLandingPool.mockResolvedValue(
      ["a", "b", "c"].map((id) => row(id, "tall")),
    );
    const { portrait, landscape } = await getReels();
    expect(portrait.map((p) => p.id).sort()).toEqual(["a", "b", "c"]);
    expect(landscape).toEqual([FALLBACK_PICTURE]);
  });

  it("falls back on both when the pool is empty", async () => {
    listLandingPool.mockResolvedValue([]);
    expect(await getReels()).toEqual({
      portrait: [FALLBACK_PICTURE],
      landscape: [FALLBACK_PICTURE],
    });
    expect(FALLBACK_PICTURE.src).toBe("/landing/fallback.webp");
  });

  it("does not memoise an empty pool — the first rows to land are picked up on the next visit", async () => {
    listLandingPool.mockResolvedValueOnce([]);
    await getReels();
    const { portrait } = await getReels(2);
    expect(listLandingPool).toHaveBeenCalledTimes(2);
    expect(portrait[0]!.src).toMatch(/^\/api\/img\//);
  });

  it("falls back, and does not memoise the failure, when the query throws", async () => {
    listLandingPool.mockRejectedValueOnce(new Error("db down"));
    expect((await getReels()).portrait).toEqual([FALLBACK_PICTURE]);
    await getReels();
    expect(listLandingPool).toHaveBeenCalledTimes(2);
  });
});
