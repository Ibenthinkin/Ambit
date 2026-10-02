import { describe, expect, it } from "vitest";

import {
  INGEST_PAUSED_SOURCES,
  SUSPENDED_SOURCES,
  isIngestSkipped,
  isSuspendedSource,
} from "./suspended-sources";

describe("crawl-paused sources", () => {
  it("pauses the Met's crawl without suspending its stored rows", () => {
    expect(isIngestSkipped("met")).toBe(true);
    // Suspended would also pull its rows from the feed; the pause must not.
    expect(isSuspendedSource("met")).toBe(false);
  });

  it("skips every suspended source at ingest too", () => {
    for (const id of SUSPENDED_SOURCES)
      expect(isIngestSkipped(id), id).toBe(true);
  });

  it("keeps the two lists disjoint, so each source has one reason to be off", () => {
    for (const id of INGEST_PAUSED_SOURCES) {
      expect(isSuspendedSource(id), id).toBe(false);
    }
  });

  it("leaves a live source alone", () => {
    expect(isIngestSkipped("cma")).toBe(false);
  });
});
