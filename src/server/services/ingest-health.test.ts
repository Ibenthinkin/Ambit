import { describe, expect, it } from "vitest";

import { INGEST_STALE_AFTER_MS, ingestStatus } from "./ingest-health";

describe("ingestStatus", () => {
  const now = new Date("2026-09-18T12:00:00Z");

  it("is never when no run has ever succeeded", () => {
    expect(ingestStatus(null, now)).toBe("never");
  });

  it("is ok for last night's run", () => {
    expect(ingestStatus(new Date("2026-09-18T02:40:00Z"), now)).toBe("ok");
  });

  it("is stale once a whole nightly slot has been missed", () => {
    expect(ingestStatus(new Date("2026-09-17T02:40:00Z"), now)).toBe("stale");
  });

  it("turns stale exactly at 30 hours", () => {
    const edge = new Date(now.getTime() - INGEST_STALE_AFTER_MS);
    expect(ingestStatus(new Date(edge.getTime() + 1), now)).toBe("ok");
    expect(ingestStatus(edge, now)).toBe("stale");
  });
});
