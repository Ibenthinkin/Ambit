// The weekly split (docs/PLAN_judge-on-vm202.md, design D10): pictures one night, writing another.
import { describe, expect, it } from "vitest";

import { BLOGS } from "~/server/config/blogs";
import { PUBLICATIONS } from "~/server/config/publications";

import {
  INGEST_KINDS,
  itemKind,
  ofKind,
  parseKind,
  recordedKind,
  SOURCE_KINDS,
  sourceYields,
} from "./ingest-kind";

describe("parseKind", () => {
  it("is null when the flag is absent — a run of everything, as before", () => {
    expect(parseKind(undefined)).toBeNull();
  });
  it("reads the two kinds", () => {
    expect(parseKind("pictures")).toBe("pictures");
    expect(parseKind("writing")).toBe("writing");
  });
  it("refuses a word it does not know rather than running everything", () => {
    expect(() => parseKind("photos")).toThrow(/--kind/);
  });
});

describe("itemKind", () => {
  it("is the item's type, in the schedule's words", () => {
    expect(itemKind({ type: "image" })).toBe("pictures");
    expect(itemKind({ type: "article" })).toBe("writing");
  });
});

describe("SOURCE_KINDS", () => {
  it("files every publication under writing and every blog under pictures", () => {
    for (const p of PUBLICATIONS)
      expect(SOURCE_KINDS[p.id], p.id).toEqual(["writing"]);
    for (const b of BLOGS)
      expect(SOURCE_KINDS[b.id], b.id).toEqual(["pictures"]);
  });
  it("knows the two sources that carry both", () => {
    expect(SOURCE_KINDS.pdr).toEqual(INGEST_KINDS);
    expect(SOURCE_KINDS.loupe).toEqual(INGEST_KINDS);
  });
  it("gives no source an empty list — that source would run on neither night", () => {
    for (const [id, kinds] of Object.entries(SOURCE_KINDS))
      expect(kinds.length, id).toBeGreaterThan(0);
  });
});

describe("sourceYields", () => {
  it("is always true without a kind", () => {
    expect(sourceYields("smithsonian", null)).toBe(true);
    expect(sourceYields("wikipedia", null)).toBe(true);
  });
  it("skips a museum on the writing night and Wikipedia on the pictures night", () => {
    expect(sourceYields("smithsonian", "writing")).toBe(false);
    expect(sourceYields("wikipedia", "pictures")).toBe(false);
  });
  it("walks PDR on both nights", () => {
    expect(sourceYields("pdr", "pictures")).toBe(true);
    expect(sourceYields("pdr", "writing")).toBe(true);
  });
});

describe("ofKind", () => {
  const items = [
    { type: "image" as const, sourceId: "a" },
    { type: "article" as const, sourceId: "b" },
  ];
  it("keeps only the night's kind — PDR's pictures are not judged on the writing night", () => {
    expect(ofKind(items, "writing").map((i) => i.sourceId)).toEqual(["b"]);
    expect(ofKind(items, "pictures").map((i) => i.sourceId)).toEqual(["a"]);
  });
  it("keeps everything without a kind", () => {
    expect(ofKind(items, null)).toHaveLength(2);
  });
});

describe("recordedKind", () => {
  it("is the flag when one was given", () => {
    expect(recordedKind("pictures", undefined)).toBe("pictures");
    expect(recordedKind("writing", "pdr")).toBe("writing");
  });
  it("is a one-kind source's kind for a manual --source run", () => {
    expect(recordedKind(null, "aeon")).toBe("writing");
    expect(recordedKind(null, "smithsonian")).toBe("pictures");
  });
  it("is null — counts for both — for a two-kind source or a run of everything", () => {
    expect(recordedKind(null, "pdr")).toBeNull();
    expect(recordedKind(null, undefined)).toBeNull();
    expect(recordedKind(null, "not-a-source")).toBeNull();
  });
});
