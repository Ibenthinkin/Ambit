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
    expect(out).toMatchObject({ fetched: 1, none: 0, deferred: 0 });
  });

  it("keeps an item bodiless when the source has no body for it — that will never change", async () => {
    const out = await enrichBodies([makeItem({ sourceId: "empty" })], fetchers);
    expect(out.items.map((i) => i.body)).toEqual([null]);
    expect(out).toMatchObject({ fetched: 0, none: 1, deferred: 0 });
  });

  // A throw is a blip, not an answer. Kept, the item would be curated from its lede and stored
  // bodiless for good (ingest never revisits a row); dropped, tomorrow's run finds it new again.
  it("drops an item whose fetch threw, so the next run retries it, and says so", async () => {
    const warned: string[] = [];
    const out = await enrichBodies(
      [makeItem({ sourceId: "boom" }), makeItem({ sourceId: "a" })],
      fetchers,
      (msg) => warned.push(msg),
    );
    expect(out.items.map((i) => i.sourceId)).toEqual(["a"]);
    expect(out).toMatchObject({ fetched: 1, none: 0, deferred: 1 });
    expect(warned.join()).toMatch(/boom.*503/);
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
