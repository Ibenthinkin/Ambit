import { describe, expect, it } from "vitest";

import {
  INGEST_STALE_AFTER_MS,
  ingestStatus,
  worstIngestStatus,
} from "./ingest-health";

describe("ingestStatus", () => {
  // A Monday, two hours after the weekly pictures job starts.
  const now = new Date("2026-10-12T10:00:00Z");

  it("is never when no run has ever succeeded", () => {
    expect(ingestStatus(null, now)).toBe("never");
  });

  it("is ok all week after last Monday's run", () => {
    expect(ingestStatus(new Date("2026-10-05T09:10:00Z"), now)).toBe("ok");
  });

  it("is still ok when this week's run stopped at the ceiling and Tuesday's catch-up has not run yet", () => {
    const tuesdayMorning = new Date("2026-10-13T07:59:00Z");
    expect(ingestStatus(new Date("2026-10-05T09:10:00Z"), tuesdayMorning)).toBe(
      "ok",
    );
  });

  it("is stale once the week's run and its catch-up night have both been missed", () => {
    const wednesday = new Date("2026-10-14T10:00:00Z");
    expect(ingestStatus(new Date("2026-10-05T09:10:00Z"), wednesday)).toBe(
      "stale",
    );
  });

  it("turns stale exactly at eight days and six hours", () => {
    expect(INGEST_STALE_AFTER_MS).toBe((8 * 24 + 6) * 60 * 60 * 1000);
    const edge = new Date(now.getTime() - INGEST_STALE_AFTER_MS);
    expect(ingestStatus(new Date(edge.getTime() + 1), now)).toBe("ok");
    expect(ingestStatus(edge, now)).toBe("stale");
  });
});

describe("worstIngestStatus", () => {
  it("is ok only when every kind is ok", () => {
    expect(worstIngestStatus(["ok", "ok"])).toBe("ok");
    expect(worstIngestStatus(["ok", "stale"])).toBe("stale");
    expect(worstIngestStatus(["stale", "never"])).toBe("never");
    expect(worstIngestStatus(["ok", "never"])).toBe("never");
  });
});
