// The writing curator (docs/DESIGN_writing.md D1, docs/PLAN_writing.md Phase 1): the floor,
// the parser, the cache key and the dispatch by type. Network-free — the dispatch tests stub
// `fetch` the way curator.test.ts does.
import { describe, expect, it } from "vitest";

import { writingFloor, WRITING_MIN_CHARS } from "./curator";
import type { NormalizedItem } from "./sources/types";

function makeItem(overrides: Partial<NormalizedItem>): NormalizedItem {
  return {
    source: "wikipedia",
    sourceId: "1",
    type: "article",
    title: "A clean, ordinary item title",
    summary: "A summary.",
    body: null,
    imageUrl: null,
    sourceUrl: "https://example.com/1",
    attribution: "Example",
    license: "CC0",
    tags: [],
    ...overrides,
  };
}

const text = (n: number) => "x".repeat(n);

describe("writingFloor — thin-text", () => {
  it(`drops an article whose text is under ${WRITING_MIN_CHARS} characters`, () => {
    const thin = makeItem({ sourceId: "thin", summary: text(WRITING_MIN_CHARS - 1) });
    const { kept, dropped } = writingFloor([thin]);
    expect(kept).toEqual([]);
    expect(dropped).toEqual([{ item: thin, rule: "thin-text" }]);
  });

  it("keeps an article at the floor", () => {
    const ok = makeItem({ summary: text(WRITING_MIN_CHARS) });
    expect(writingFloor([ok]).kept).toEqual([ok]);
  });

  it("reads the body when there is one, so a short dek over a long body survives", () => {
    const ok = makeItem({ summary: "Short dek.", body: text(WRITING_MIN_CHARS + 50) });
    expect(writingFloor([ok]).kept).toEqual([ok]);
  });

  it("does not count the apparatus toward the floor", () => {
    const padded = makeItem({
      body: `${text(100)}\n== References ==\n${text(WRITING_MIN_CHARS * 2)}`,
    });
    expect(writingFloor([padded]).dropped).toHaveLength(1);
  });

  it("never touches an image", () => {
    const img = makeItem({ type: "image", summary: "" });
    expect(writingFloor([img]).kept).toEqual([img]);
  });
});
