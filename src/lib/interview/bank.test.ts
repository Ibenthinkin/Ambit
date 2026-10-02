// The bank is copy Ben edits freely, so these tests pin its *structure*, never its wording:
// every id it names exists, and — the one that matters for CI — it still works on a database
// holding only the sixteen original topics.
import { describe, expect, it } from "vitest";

import { READING_AMOUNTS } from "~/server/config/reading-amount";
import { TOPIC_FACETS } from "~/server/config/topic-facets";
import { TOPIC_GROUPS } from "~/server/config/topic-groups";
import { TOPICS } from "~/server/config/topics";

import { askable } from "./askable";
import { BANK_VERSION, QUESTIONS, STARTER_TOPICS } from "./bank";
import { MIN_PICKS, SENTINELS } from "./config";
import { answersToward } from "./path";
import { picksFrom } from "./picks";
import { scoreAnswers } from "./score";

/** Production's shape: every pickable topic. */
const WIDE = new Set(Object.keys(TOPIC_FACETS));
/** CI's shape: a freshly seeded database — the sixteen originals. */
const NARROW = new Set(TOPICS.map((t) => t.id));
const GROUPS = new Set(TOPIC_GROUPS.map((g) => g.id));

describe("the bank's structure", () => {
  it("has a positive integer version", () => {
    expect(Number.isInteger(BANK_VERSION) && BANK_VERSION > 0).toBe(true);
  });

  it("asks between four and fifteen questions, each id once", () => {
    expect(QUESTIONS.length).toBeGreaterThanOrEqual(4);
    expect(QUESTIONS.length).toBeLessThanOrEqual(15);
    expect(new Set(QUESTIONS.map((q) => q.id)).size).toBe(QUESTIONS.length);
  });

  it("names only topics and groups that exist", () => {
    const dead: string[] = [];
    for (const q of QUESTIONS)
      for (const o of q.options) {
        for (const e of o.effects) {
          for (const t of e.topics ?? [])
            if (!WIDE.has(t)) dead.push(`${q.id}/${o.key}: ${t}`);
          for (const g of e.groups ?? [])
            if (!GROUPS.has(g)) dead.push(`${q.id}/${o.key}: ${g}`);
        }
        if (o.face && !WIDE.has(o.face.topic))
          dead.push(`${q.id}/${o.key} face: ${o.face.topic}`);
      }
    expect(dead).toEqual([]);
  });

  it("gives every option a key that is unique in its question and is not a sentinel", () => {
    for (const q of QUESTIONS) {
      const keys = q.options.map((o) => o.key);
      expect(new Set(keys).size, q.id).toBe(keys.length);
      expect(
        keys.filter((k) => SENTINELS.includes(k)),
        q.id,
      ).toEqual([]);
    }
  });

  it("shapes each kind correctly", () => {
    for (const q of QUESTIONS) {
      if (q.kind === "text") expect(q.options, q.id).toHaveLength(0);
      if (q.kind === "pair") {
        expect(q.options, q.id).toHaveLength(2);
        // A face-off is two pictures.
        expect(
          q.options.every((o) => o.face),
          q.id,
        ).toBe(true);
      }
      if (q.kind === "choice" || q.kind === "multi")
        expect(q.options.length, q.id).toBeGreaterThanOrEqual(2);
    }
  });

  it("has exactly one amount question, offering all four amounts", () => {
    const amounts = QUESTIONS.filter((q) => q.kind === "amount");
    expect(amounts).toHaveLength(1);
    expect(amounts[0]!.options.map((o) => o.reading)).toEqual([
      ...READING_AMOUNTS,
    ]);
  });
});

describe("the bank on a sixteen-topic database", () => {
  it("still asks at least three topic questions", () => {
    const asked = askable(QUESTIONS, NARROW).filter(
      (q) => q.kind !== "text" && q.kind !== "amount",
    );
    expect(asked.length).toBeGreaterThanOrEqual(3);
  });

  it("has at least three starters among the originals", () => {
    expect(
      STARTER_TOPICS.filter((t) => NARROW.has(t)).length,
    ).toBeGreaterThanOrEqual(MIN_PICKS);
    expect(STARTER_TOPICS.filter((t) => !WIDE.has(t))).toEqual([]);
  });
});

describe("the e2e path", () => {
  // e2e's `completeOnboarding` defaults to these three and asserts on them afterwards.
  const WANTED = ["astronomy", "botany", "music"];

  it.each([
    ["production's vocabulary", WIDE],
    ["the sixteen originals", NARROW],
  ])("reaches astronomy, botany and music on %s", (_, listed) => {
    const answers = answersToward(QUESTIONS, listed, WANTED);
    const picks = picksFrom(
      scoreAnswers(QUESTIONS, answers, listed),
      listed,
      STARTER_TOPICS,
    );
    expect(picks.map((p) => p.topicId)).toEqual(expect.arrayContaining(WANTED));
  });

  it("skipping everything proposes exactly the starters", () => {
    const picks = picksFrom(new Map(), NARROW, STARTER_TOPICS);
    expect(picks.map((p) => p.topicId)).toEqual(
      STARTER_TOPICS.slice(0, MIN_PICKS),
    );
  });
});
