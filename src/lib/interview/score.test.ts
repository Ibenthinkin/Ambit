import { describe, expect, it } from "vitest";

import { EITHER, NEITHER, READ_SCORE, SKIP, TEXT_SCORE } from "./config";
import { NARROW, TEST_BANK, WIDE } from "./fixtures";
import { scoreAnswers } from "./score";

const score = (
  answers: Parameters<typeof scoreAnswers>[1],
  listed: ReadonlySet<string> = WIDE,
) => scoreAnswers(TEST_BANK, answers, listed);

describe("scoreAnswers", () => {
  it("gives a single-topic answer its whole score", () => {
    expect(
      score([{ questionId: "evening", keys: ["music"] }]).get("music"),
    ).toBe(1);
  });

  it("splits an answer over n topics by √n, so a wide answer doesn't swamp a narrow one", () => {
    const s = score([{ questionId: "evening", keys: ["books"] }]);
    expect(s.get("books")).toBeCloseTo(1 / Math.sqrt(3));
    expect(s.get("poetry")).toBeCloseTo(1 / Math.sqrt(3));
  });

  it("counts n over the *listed* targets — on a narrow database the survivor gets more", () => {
    const s = score([{ questionId: "evening", keys: ["books"] }], NARROW);
    expect(s.get("poetry")).toBe(1);
    expect(s.has("books")).toBe(false);
  });

  it("flattens a pair side's group", () => {
    const s = score([{ questionId: "space-or-garden", keys: ["space"] }]);
    // Four of the group's members are listed in WIDE.
    expect(s.get("astronomy")).toBeCloseTo(0.5);
    expect(s.has("botany")).toBe(false);
  });

  it("Either adds both sides at 0.75", () => {
    const s = score([{ questionId: "space-or-garden", keys: [EITHER] }]);
    expect(s.get("astronomy")).toBeCloseTo(0.75 * 0.5);
    expect(s.get("botany")).toBeCloseTo(0.75 * 0.5);
  });

  it("Neither takes both sides down at -0.5", () => {
    const s = score([{ questionId: "space-or-garden", keys: [NEITHER] }]);
    expect(s.get("astronomy")).toBeCloseTo(-0.25);
    expect(s.get("trees")).toBeCloseTo(-0.25);
  });

  it("a skip, an unknown question and an unknown key add nothing", () => {
    expect(
      score([
        { questionId: "evening", keys: [SKIP] },
        { questionId: "retired-question", keys: ["x"] },
        { questionId: "evening", keys: ["no-such-answer"] },
      ]).size,
    ).toBe(0);
  });

  it("adds across questions, and a negative answer subtracts", () => {
    const s = score([
      { questionId: "unsettle", keys: ["yes"] },
      { questionId: "unsettle", keys: ["no"] },
    ]);
    expect(s.get("eerie")).toBeCloseTo((1 - 0.5) / Math.sqrt(2));
  });

  it("scores a free-text answer's interpreted topics as one effect", () => {
    const one = score([
      { questionId: "words", keys: [], text: "stars", topicIds: ["astronomy"] },
    ]);
    expect(one.get("astronomy")).toBe(TEXT_SCORE);
    const four = score([
      {
        questionId: "words",
        keys: [],
        text: "…",
        topicIds: ["astronomy", "music", "food", "not-listed"],
      },
    ]);
    // Three listed targets, not four.
    expect(four.get("music")).toBeCloseTo(TEXT_SCORE / Math.sqrt(3));
    expect(four.has("not-listed")).toBe(false);
  });

  it("an amount answer scores nothing", () => {
    expect(score([{ questionId: "reading-amount", keys: ["lot"] }]).size).toBe(
      0,
    );
  });

  it("None of these on a choice takes each option's FIRST effect down at -0.5 — not the face bonus", () => {
    const s = score([{ questionId: "rooms", keys: [NEITHER] }]);
    // First effects only: {astronomy, moon} and {botany, plants}, each -0.5 shared by √2.
    expect(s.get("astronomy")).toBeCloseTo(-0.5 / Math.sqrt(2));
    expect(s.get("moon")).toBeCloseTo(-0.5 / Math.sqrt(2));
    expect(s.get("botany")).toBeCloseTo(-0.5 / Math.sqrt(2));
    // The face bonus (second effect) is untouched: astronomy is not -0.5/√2 - 0.25.
    expect(s.get("astronomy")).not.toBeCloseTo(-0.5 / Math.sqrt(2) - 0.25);
  });

  it("an `always` option with no effects adds nothing when chosen", () => {
    expect(score([{ questionId: "rather-not", keys: ["nudity"] }]).size).toBe(
      0,
    );
  });

  // "Show it all" on Rather not (Ben, 10-05-26) is NEITHER on a multi: the reader said nothing
  // is to be kept out. It must add nothing — NEITHER_FACTOR on a -2 effect would *raise* horror.
  it("NEITHER on a multi (Rather not's Show it all) adds nothing", () => {
    expect(score([{ questionId: "rather-not", keys: ["neither"] }]).size).toBe(
      0,
    );
  });

  it("a reading card scores the item's memberships at READ_SCORE, plus its kind's form topic", () => {
    const s = score([
      { questionId: "read", keys: ["essay"], topicIds: ["astronomy", "music"] },
    ]);
    expect(s.get("astronomy")).toBeCloseTo(READ_SCORE / Math.sqrt(2));
    expect(s.get("music")).toBeCloseTo(READ_SCORE / Math.sqrt(2));
    // KIND_FORM.essay = "essays", listed in WIDE: its own effect, whole.
    expect(s.get("essays")).toBeCloseTo(READ_SCORE);
  });

  it("a reading card for a kind with no form, or on a database without the form topic, scores memberships only", () => {
    const curiosity = score([
      { questionId: "read", keys: ["curiosity"], topicIds: ["astronomy"] },
    ]);
    expect(curiosity.get("astronomy")).toBeCloseTo(READ_SCORE);
    expect(curiosity.size).toBe(1);
    const narrow = score(
      [{ questionId: "read", keys: ["essay"], topicIds: ["astronomy"] }],
      NARROW,
    );
    expect(narrow.has("essays")).toBe(false);
    expect(narrow.get("astronomy")).toBeCloseTo(READ_SCORE);
  });
});
