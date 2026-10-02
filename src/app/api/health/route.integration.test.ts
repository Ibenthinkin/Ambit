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

    // Real ingest_run rows read back through the real query. Stamped in the future so they are
    // the newest whatever else the local database holds, and deleted afterwards.
    describe("ingest", () => {
      const stamp = Date.now();
      const ids = [`test-run-pictures-${stamp}`, `test-run-any-${stamp}`];

      afterAll(async () => {
        const { db } = await import("~/server/db/client");
        const { ingestRun } = await import("~/server/db/schema");
        for (const id of ids)
          await db.delete(ingestRun).where(eq(ingestRun.id, id));
      });

      const row = (id: string, finishedAt: Date, kind: "pictures" | null) => ({
        id,
        startedAt: new Date(),
        finishedAt,
        exitCode: 0,
        inserted: 3,
        dryRun: false,
        perSource: null,
        error: null,
        kind,
      });

      it("counts a pictures run toward pictures only", async () => {
        const { recordIngestRun, lastSuccessfulIngestAt } =
          await import("~/server/db/ingest-runs");
        const at = new Date(stamp + 60_000);
        await recordIngestRun(row(ids[0]!, at, "pictures"));

        expect((await lastSuccessfulIngestAt("pictures"))?.getTime()).toBe(
          at.getTime(),
        );
        expect((await lastSuccessfulIngestAt("writing"))?.getTime()).not.toBe(
          at.getTime(),
        );
      });

      it("counts a run with no kind — every row written before 10-02-26 — toward both", async () => {
        const { recordIngestRun, lastSuccessfulIngestAt } =
          await import("~/server/db/ingest-runs");
        const at = new Date(stamp + 120_000);
        await recordIngestRun(row(ids[1]!, at, null));

        expect((await lastSuccessfulIngestAt("pictures"))?.getTime()).toBe(
          at.getTime(),
        );
        expect((await lastSuccessfulIngestAt("writing"))?.getTime()).toBe(
          at.getTime(),
        );

        const res = await GET();
        expect(await res.json()).toMatchObject({
          ingest: "ok",
          lastIngestAt: at.toISOString(),
          ingestKinds: {
            pictures: { status: "ok", lastAt: at.toISOString() },
            writing: { status: "ok", lastAt: at.toISOString() },
          },
        });
      });
    });
  },
);
