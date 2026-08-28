import { describe, expect, it } from "vitest";

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
  },
);
