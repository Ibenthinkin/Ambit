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

// Phase 8.2: the ingest's last successful run. Defaults to "never ran" in beforeEach, so the
// original cases below keep describing a fresh database.
const lastSuccessfulIngestAt = vi.hoisted(() => vi.fn());
vi.mock("~/server/db/ingest-runs", () => ({ lastSuccessfulIngestAt }));

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
    lastSuccessfulIngestAt.mockReset();
    lastSuccessfulIngestAt.mockResolvedValue(null);
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
      ingest: "never",
      lastIngestAt: null,
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
      "ingest",
      "lastIngestAt",
      "ok",
    ]);
    expect(JSON.stringify(body)).not.toContain(dir);
    expect(JSON.stringify(body)).not.toContain("password");
  });

  // ── Phase 8.2: the ingest field (PHASE8_PLAN_8.2.md D3) ──────────────────────────────────────

  describe("ingest", () => {
    beforeEach(async () => {
      execute.mockResolvedValue([{ "?column?": 1 }]);
      imageCacheDir.mockReturnValue(await writableDir());
    });

    it("reports ok with the finish time after a recent successful run", async () => {
      const finished = new Date(Date.now() - 2 * 60 * 60 * 1000);
      lastSuccessfulIngestAt.mockResolvedValue(finished);

      const res = await GET();

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        ok: true,
        ingest: "ok",
        lastIngestAt: finished.toISOString(),
      });
    });

    // The line this whole field hangs on: /api/health is the Docker HEALTHCHECK, so a late cron
    // job must never make Docker restart a healthy app. The body says stale; the code stays 200.
    it("reports stale but still answers 200 when db and cache are fine", async () => {
      lastSuccessfulIngestAt.mockResolvedValue(
        new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      );

      const res = await GET();

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ ok: true, ingest: "stale" });
    });

    it("reports never on a database with no successful run, still 200", async () => {
      const res = await GET();

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        ingest: "never",
        lastIngestAt: null,
      });
    });

    // A read that fails (say the ingest_run migration has not run) is not "never" — that would be
    // a lie about the corpus — and it is not a reason to call the container unhealthy either.
    it("reports unknown when the ingest record cannot be read, without changing the status code", async () => {
      lastSuccessfulIngestAt.mockRejectedValue(
        new Error('relation "ingest_run" does not exist'),
      );

      const res = await GET();

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toMatchObject({ ingest: "unknown", lastIngestAt: null });
      expect(JSON.stringify(body)).not.toContain("ingest_run");
    });
  });
});
