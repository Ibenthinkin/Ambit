import { describe, expect, it } from "vitest";

import type { ReadingPhrase } from "~/server/config/reading-phrases";
import type { NormalizedItem } from "./sources/types";
import {
  DEFAULT_PHRASE_LIMIT,
  mergeUnseeded,
  planReadingQueries,
} from "./reading-plan";

const phrases: ReadingPhrase[] = [
  { topic: "astronomy", phrase: "history of the telescope" },
  { topic: "botany", phrase: "carnivorous plants", limit: 8 },
  { phrase: "scientific hoaxes", limit: 20 },
  { list: "unusual", limit: 40 },
];

describe("planReadingQueries", () => {
  it("splits tied phrases (claims for a topic) from untied phrases and lists", () => {
    const plan = planReadingQueries(phrases, null, 150);
    expect(plan.tied).toEqual([
      {
        topicId: "astronomy",
        query: "history of the telescope",
        limit: DEFAULT_PHRASE_LIMIT,
      },
      { topicId: "botany", query: "carnivorous plants", limit: 8 },
    ]);
    expect(plan.untied).toEqual([
      { query: "scientific hoaxes", limit: 20 },
      { query: "list:unusual", limit: 40 },
    ]);
  });

  it("--quota caps every limit (a smoke run asks for less)", () => {
    const plan = planReadingQueries(phrases, null, 5);
    expect([...plan.tied, ...plan.untied].every((q) => q.limit <= 5)).toBe(
      true,
    );
  });

  it("--topic keeps that topic's tied phrases and no untied ones", () => {
    const plan = planReadingQueries(phrases, "botany", 150);
    expect(plan.tied.map((q) => q.topicId)).toEqual(["botany"]);
    expect(plan.untied).toEqual([]);
  });

  it("drops a tied phrase whose topic the database does not have", () => {
    const plan = planReadingQueries(phrases, null, 150, new Set(["botany"]));
    expect(plan.tied.map((q) => q.topicId)).toEqual(["botany"]);
  });
});

describe("mergeUnseeded", () => {
  const item = (sourceId: string): NormalizedItem => ({
    source: "wikipedia",
    sourceId,
    type: "article",
    title: sourceId,
    summary: "",
    body: null,
    imageUrl: null,
    sourceUrl: "x",
    attribution: "",
    license: "",
    tags: [],
  });

  it("drops what a tied phrase already claimed, and repeats within the untied set", () => {
    const out = mergeUnseeded(
      [item("1"), item("2"), item("2"), item("3")],
      new Set(["wikipedia:1"]),
    );
    expect(out.map((i) => i.sourceId)).toEqual(["2", "3"]);
  });
});
