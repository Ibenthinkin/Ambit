import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

// Both of the route's dependencies are mocked, which is what makes this a *unit* test of the
// probe's contract — the shape of the answer, and that a failure in either check is reported
// independently. The 200-with-a-real-database case is `route.integration.test.ts`'s job.
const execute = vi.hoisted(() => vi.fn());
vi.mock("~/server/db/client", () => ({ db: { execute } }));

const imageCacheDir = vi.hoisted(() => vi.fn());
vi.mock("~/server/services/image-cache", () => ({ imageCacheDir }));

/** A directory that exists and is writable — the healthy case. */
async function writableDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ambit-health-"));
}

/**
 * A path that cannot be created: a child of a regular *file*, so `mkdir -p` fails with ENOTDIR.
 * This stands in for the real failure 8.1 cares about — a persistent volume that didn't mount, or
 * mounted read-only — without needing to chmod anything (a test running as root would sail
 * straight through a 0444 directory).
 */
async function unusableDir(): Promise<string> {
  const dir = await writableDir();
  const file = join(dir, "not-a-directory");
  await writeFile(file, "");
  return join(file, "img");
}

describe("GET /api/health", () => {
  beforeEach(() => {
    execute.mockReset();
    imageCacheDir.mockReset();
    delete process.env.SOURCE_COMMIT;
  });

  afterEach(() => {
    delete process.env.SOURCE_COMMIT;
  });

  it("answers 200 with both checks ok when the database and the cache dir are healthy", async () => {
    execute.mockResolvedValue([{ "?column?": 1 }]);
    imageCacheDir.mockReturnValue(await writableDir());

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      db: "ok",
      imageCache: "ok",
      commit: null,
    });
  });

  it("answers 503 and names the database when the query fails", async () => {
    execute.mockRejectedValue(new Error("connection refused"));
    imageCacheDir.mockReturnValue(await writableDir());

    const res = await GET();

    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({
      ok: false,
      db: "error",
      imageCache: "ok",
    });
  });

  it("answers 503 and names the image cache when its directory can't be created or written", async () => {
    execute.mockResolvedValue([{ "?column?": 1 }]);
    imageCacheDir.mockReturnValue(await unusableDir());

    const res = await GET();

    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({
      ok: false,
      db: "ok",
      imageCache: "error",
    });
  });

  // The reason both checks run unconditionally: a probe that stopped at the first failure would
  // report a dead database and hide an unmounted volume until the database was fixed.
  it("reports both failures at once rather than short-circuiting", async () => {
    execute.mockRejectedValue(new Error("connection refused"));
    imageCacheDir.mockReturnValue(await unusableDir());

    expect(await (await GET()).json()).toMatchObject({
      ok: false,
      db: "error",
      imageCache: "error",
    });
  });

  it("returns the deployed commit when the platform sets one", async () => {
    execute.mockResolvedValue([{ "?column?": 1 }]);
    imageCacheDir.mockReturnValue(await writableDir());
    process.env.SOURCE_COMMIT = "8bb9237deadbeef";

    expect(await (await GET()).json()).toMatchObject({
      commit: "8bb9237deadbeef",
    });
  });

  it("is never cacheable", async () => {
    execute.mockResolvedValue([{ "?column?": 1 }]);
    imageCacheDir.mockReturnValue(await writableDir());

    expect((await GET()).headers.get("cache-control")).toBe("no-store");
  });

  // The route is public and unauthenticated, so the body is a fixed vocabulary: no env var, no
  // path, no driver message can ride out on it. Asserting the exact key set is what keeps a future
  // "just add the error message, it's easier to debug" from landing unnoticed.
  it("describes nothing about the machine, even when everything is broken", async () => {
    execute.mockRejectedValue(
      new Error("password authentication failed for user ambit"),
    );
    const dir = await unusableDir();
    imageCacheDir.mockReturnValue(dir);

    const body = (await (await GET()).json()) as Record<string, unknown>;

    expect(Object.keys(body).sort()).toEqual([
      "commit",
      "db",
      "imageCache",
      "ok",
    ]);
    expect(JSON.stringify(body)).not.toContain(dir);
    expect(JSON.stringify(body)).not.toContain("password");
  });
});
