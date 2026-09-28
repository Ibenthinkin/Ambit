import { describe, expect, it } from "vitest";

import { enrichBodies } from "./enrich";
import type { NormalizedItem } from "./types";

function makeItem(overrides: Partial<NormalizedItem>): NormalizedItem {
  return {
    source: "wikipedia",
    sourceId: "1",
    type: "article",
    title: "T",
    summary: "S",
    body: null,
    imageUrl: null,
    sourceUrl: "https://example.com/1",
    attribution: "A",
    license: "L",
    tags: [],
    ...overrides,
  };
}

describe("enrichBodies", () => {
  const calls: string[] = [];
  const fetchers = {
    wikipedia: (it: NormalizedItem) => {
      calls.push(it.sourceId);
      if (it.sourceId === "boom") return Promise.reject(new Error("503"));
      if (it.sourceId === "empty") return Promise.resolve(null);
      return Promise.resolve(`body of ${it.sourceId}`);
    },
  };

  it("fills a body for a source that has a fetcher and only where it is missing", async () => {
    calls.length = 0;
    const items = [
      makeItem({ sourceId: "a" }),
      makeItem({ sourceId: "b", body: "already" }),
      makeItem({ source: "pdr", sourceId: "c" }),
    ];
    const out = await enrichBodies(items, fetchers);
    expect(calls).toEqual(["a"]);
    expect(out.items.map((i) => i.body)).toEqual([
      "body of a",
      "already",
      null,
    ]);
    expect(out).toMatchObject({ fetched: 1, failed: 0 });
  });

  it("keeps the item bodiless when a fetch fails or finds nothing, and counts it", async () => {
    const out = await enrichBodies(
      [makeItem({ sourceId: "boom" }), makeItem({ sourceId: "empty" })],
      fetchers,
    );
    expect(out.items.map((i) => i.body)).toEqual([null, null]);
    expect(out).toMatchObject({ fetched: 0, failed: 2 });
  });

  it("never touches an image", async () => {
    calls.length = 0;
    await enrichBodies(
      [makeItem({ type: "image", sourceId: "img" })],
      fetchers,
    );
    expect(calls).toEqual([]);
  });
});
