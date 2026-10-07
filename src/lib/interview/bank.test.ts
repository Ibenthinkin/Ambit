// The bank is copy Ben edits freely, so these tests pin its *structure*, never its wording:
// every id it names exists, and — the one that matters for CI — it still works on a database
// holding only the sixteen original topics.
import { describe, expect, it } from "vitest";

import { DESTINATIONS } from "~/server/config/interview-destinations";
import { WINGS } from "~/server/config/interview-wings";
import { TOPIC_FACETS } from "~/server/config/topic-facets";
import { TOPIC_GROUPS } from "~/server/config/topic-groups";
import { TOPICS } from "~/server/config/topics";

import { askable } from "./askable";
import { BANK_VERSION, QUESTIONS, STARTER_TOPICS } from "./bank";
import { MIN_PICKS, NEITHER, SENTINELS, SKIP } from "./config";
import { answersToward } from "./path";
import { picksFrom } from "./picks";
import { scoreAnswers } from "./score";
import { STEP_COUNT, STEP_LABELS, STEP_OF, stepsAsked } from "./steps";

/** Production's shape: every pickable topic. */
const WIDE = new Set(Object.keys(TOPIC_FACETS));
/** CI's shape: a freshly seeded database — the sixteen originals. */
const NARROW = new Set(TOPICS.map((t) => t.id));
const GROUPS = new Set(TOPIC_GROUPS.map((g) => g.id));
/** Effects may also name *proposed* ids — the wings' and destinations' vocabulary that is not
 *  listed yet. `targetsOf` drops them until a vocabulary round lists them (design §1). */
const KNOWN = new Set([
  ...WIDE,
  ...WINGS.flatMap((w) => w.proposed),
  ...DESTINATIONS.flatMap((d) => d.topics),
]);

describe("the bank's structure", () => {
  // v3 (docs/DESIGN_redesign.md §5.1): the reading amount moved to the reveal, and the two
  // free-text questions became one. A question's meaning changed, so the version did.
  it("is version 3", () => {
    expect(BANK_VERSION).toBe(3);
  });

  it("asks between ten and twenty questions, each id once", () => {
    expect(QUESTIONS.length).toBeGreaterThanOrEqual(10);
    expect(QUESTIONS.length).toBeLessThanOrEqual(20);
    expect(new Set(QUESTIONS.map((q) => q.id)).size).toBe(QUESTIONS.length);
  });

  it("names only topics and groups that exist", () => {
    const dead: string[] = [];
    for (const q of QUESTIONS)
      for (const o of q.options) {
        for (const e of o.effects) {
          for (const t of e.topics ?? [])
            if (!KNOWN.has(t)) dead.push(`${q.id}/${o.key}: ${t}`);
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
      // The playoff's display rule is for a single choice only (show.ts).
      if (q.show) expect(q.kind, q.id).toBe("choice");
      // A reading card scores the item it shows, not effects, so it must be offered regardless.
      for (const o of q.options)
        if (o.face?.writing) expect(o.always, q.id).toBe(true);
    }
  });

  it("asks no reading amount — the reveal's Reading row sets it", () => {
    expect(QUESTIONS.filter((q) => q.id === "amount")).toEqual([]);
  });

  it("ends on exactly one free-text question, look-at (the Bonus)", () => {
    const texts = QUESTIONS.filter((q) => q.kind === "text");
    expect(texts.map((q) => q.id)).toEqual(["look-at"]);
    expect(QUESTIONS.at(-1)!.id).toBe("look-at");
    expect(QUESTIONS.some((q) => q.id === "read-watch")).toBe(false);
  });
});

describe("the bank on a sixteen-topic database", () => {
  it("still asks at least three topic questions", () => {
    const asked = askable(QUESTIONS, NARROW).filter((q) => q.kind !== "text");
    expect(asked.length).toBeGreaterThanOrEqual(3);
  });

  it("asks the three wing screens, each with at least two live wings", () => {
    const wings = askable(QUESTIONS, NARROW).filter((q) =>
      q.id.startsWith("wings-"),
    );
    expect(wings).toHaveLength(3);
    for (const q of wings)
      expect(q.options.length, q.id).toBeGreaterThanOrEqual(2);
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

  // e2e/onboarding.spec.ts's retake steers here instead (the-ocean has had no path since bank v2).
  it.each([
    ["production's vocabulary", WIDE],
    ["the sixteen originals", NARROW],
  ])(
    "reaches geology and music on %s — the retake spec's path",
    (_, listed) => {
      const want = ["geology", "music"];
      const answers = answersToward(QUESTIONS, listed, want);
      const picks = picksFrom(
        scoreAnswers(QUESTIONS, answers, listed),
        listed,
        STARTER_TOPICS,
      );
      expect(picks.map((p) => p.topicId)).toEqual(expect.arrayContaining(want));
    },
  );

  // Final review, finding 1: "None of these" on a wing screen scores every wing's spread down,
  // which reaches every starter — and the reveal has no way to add a topic. The screens say Skip
  // there now (SKIP, 10-06-26), but NEITHER still scores for the answer logs that carry it.
  it.each([
    ["production's vocabulary", WIDE],
    ["the sixteen originals", NARROW],
  ])(
    "None on every wing screen and the playoff still proposes three on %s",
    (_, listed) => {
      const answers = askable(QUESTIONS, listed).map((q) => ({
        questionId: q.id,
        keys: [
          q.id.startsWith("wings-") || q.id === "playoff" ? NEITHER : SKIP,
        ],
      }));
      const picks = picksFrom(
        scoreAnswers(QUESTIONS, answers, listed),
        listed,
        STARTER_TOPICS,
      );
      expect(picks.length).toBeGreaterThanOrEqual(MIN_PICKS);
    },
  );

  it("skipping everything proposes exactly the starters", () => {
    const picks = picksFrom(new Map(), NARROW, STARTER_TOPICS);
    expect(picks.map((p) => p.topicId)).toEqual(
      STARTER_TOPICS.slice(0, MIN_PICKS),
    );
  });
});

describe("the eight steps", () => {
  it("has eight", () => {
    expect(STEP_COUNT).toBe(8);
  });
  it("files every question into exactly one step, numbered 1…STEP_COUNT with no gaps", () => {
    for (const q of QUESTIONS) expect(STEP_OF[q.id], q.id).toBeDefined();
    const used = [...new Set(QUESTIONS.map((q) => STEP_OF[q.id]!))].sort(
      (a, b) => a - b,
    );
    expect(used).toEqual(Array.from({ length: STEP_COUNT }, (_, i) => i + 1));
    expect(STEP_LABELS).toHaveLength(STEP_COUNT);
  });
  it("stepsAsked lists the steps that survive, in order", () => {
    expect(stepsAsked(askable(QUESTIONS, NARROW))).toEqual([
      ...new Set(askable(QUESTIONS, NARROW).map((q) => STEP_OF[q.id]!)),
    ]);
  });
});
