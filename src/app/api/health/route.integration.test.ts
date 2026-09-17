import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { GET } from "./route";

// The probe against a *real* Postgres — the case the unit tests next door deliberately mock away.
// Self-skipping in the same style as the five db/ suites (vitest.config.ts explains why): CI's
// `check` job has no database and skips this; CI's `e2e` job and a local run with .env have one
// and run it. This is the test that would have caught a `select 1` the driver can't execute.
describe.skipIf(!process.env.DATABASE_URL)(
  "GET /api/health (integration)",
  () => {
    it("answers 200 with db ok against the real database", async () => {
      const res = await GET();

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        ok: true,
        db: "ok",
        imageCache: "ok",
      });
    });

    // Phase 8.2: a real ingest_run row read back through the real query. The row is stamped a
    // minute in the future so it is the newest whatever else the local database holds, and is
    // deleted afterwards.
    describe("ingest", () => {
      const runId = `test-ingest-run-${Date.now()}`;

      afterAll(async () => {
        const { db } = await import("~/server/db/client");
        const { ingestRun } = await import("~/server/db/schema");
        await db.delete(ingestRun).where(eq(ingestRun.id, runId));
      });

      it("reports ok after a successful run is recorded", async () => {
        const { recordIngestRun } = await import("~/server/db/ingest-runs");
        const finishedAt = new Date(Date.now() + 60_000);
        await recordIngestRun({
          id: runId,
          startedAt: new Date(),
          finishedAt,
          exitCode: 0,
          inserted: 3,
          dryRun: false,
          perSource: null,
          error: null,
        });

        const res = await GET();

        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({
          ingest: "ok",
          lastIngestAt: finishedAt.toISOString(),
        });
      });
    });
  },
);
