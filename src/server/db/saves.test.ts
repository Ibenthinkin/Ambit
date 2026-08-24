// Pure unit tests for taste-keyword derivation (Phase 6.1) — no database. The DB-backed half
// (`getTasteKeywords`, and the ordering of the underlying saved_item scan) is covered in
// routers.integration.test.ts's "6.1 — a save teaches the feed" block; this file pins the
// flatten/dedupe/cap contract that `pickItem`'s tag boost depends on.
import { describe, expect, it } from "vitest";

import { deriveTasteKeywords } from "~/server/db/saves";

describe("deriveTasteKeywords", () => {
  it("flattens in recency order — most recent save's tags first, each list's order preserved", () => {
    expect(
      deriveTasteKeywords(
        [
          ["botanical plate", "sepia"],
          ["etching", "woodcut"],
        ],
        24,
      ),
    ).toEqual(["botanical plate", "sepia", "etching", "woodcut"]);
  });

  it("dedupes case-insensitively, keeping the first-seen form", () => {
    expect(
      deriveTasteKeywords(
        [
          ["Botanical Plate", "sepia"],
          ["botanical plate", "Sepia", "etching"],
        ],
        24,
      ),
    ).toEqual(["Botanical Plate", "sepia", "etching"]);
  });

  it("caps at the requested window size, counting only unique keywords", () => {
    const lists = [
      ["a", "b", "a"],
      ["c", "b", "d"],
    ];
    expect(deriveTasteKeywords(lists, 3)).toEqual(["a", "b", "c"]);
    // The default 24-sized window in getTasteKeywords is just this cap with cap=24 — prove the
    // cap binds exactly, not off-by-one.
    const many = Array.from({ length: 30 }, (_, i) => [`tag-${i}`]);
    expect(deriveTasteKeywords(many, 24)).toHaveLength(24);
  });

  it("returns [] for an empty save history", () => {
    expect(deriveTasteKeywords([], 24)).toEqual([]);
  });
});
