import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listLandingPool = vi.hoisted(() => vi.fn());
vi.mock("~/server/db/items", () => ({ listLandingPool }));

import {
  FALLBACK_PICTURE,
  getReel,
  pickReel,
  POOL_TTL_MS,
  REEL_SIZE,
  reelPicture,
  resetLandingPoolForTests,
} from "./landing-pool";

const row = (id: string) => ({ id, imageUrl: `https://m.test/${id}.jpg` });

beforeEach(() => {
  vi.useFakeTimers();
  resetLandingPoolForTests();
  listLandingPool
    .mockReset()
    .mockResolvedValue(["a", "b", "c", "d", "e"].map(row));
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
  it("builds the proxied 960 src and a two-candidate srcset for an http image", () => {
    expect(reelPicture("id1", "https://museum.test/x.jpg")).toEqual({
      id: "id1",
      src: "/api/img/id1?w=960",
      srcSet: "/api/img/id1?w=960 960w, /api/img/id1 1600w",
    });
  });

  it("passes a data: URL through with no srcset (the e2e fixtures)", () => {
    expect(reelPicture("id2", "data:image/png;base64,AAAA")).toEqual({
      id: "id2",
      src: "data:image/png;base64,AAAA",
      srcSet: null,
    });
  });
});

describe("getReel", () => {
  it("queries once, then serves picks from the memo until the TTL passes (Review Focus 4)", async () => {
    await getReel(2);
    await getReel(2);
    expect(listLandingPool).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(POOL_TTL_MS + 1);
    await getReel(2);
    expect(listLandingPool).toHaveBeenCalledTimes(2);
  });

  it("returns REEL_SIZE pictures by default, each proxied", async () => {
    listLandingPool.mockResolvedValue(
      Array.from({ length: 30 }, (_, i) => row(`id${i}`)),
    );
    const reel = await getReel();
    expect(reel).toHaveLength(REEL_SIZE);
    expect(reel[0]!.src).toMatch(/^\/api\/img\/id\d+\?w=960$/);
  });

  it("falls back to the one committed picture when the pool is empty", async () => {
    listLandingPool.mockResolvedValue([]);
    expect(await getReel()).toEqual([FALLBACK_PICTURE]);
    expect(FALLBACK_PICTURE.src).toBe("/landing/fallback.webp");
    expect(FALLBACK_PICTURE.srcSet).toBeNull();
  });

  it("falls back, and does not memoise the failure, when the query throws", async () => {
    listLandingPool.mockRejectedValueOnce(new Error("db down"));
    expect(await getReel()).toEqual([FALLBACK_PICTURE]);
    await getReel();
    expect(listLandingPool).toHaveBeenCalledTimes(2);
  });
});
