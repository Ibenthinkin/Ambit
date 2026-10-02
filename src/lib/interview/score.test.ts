import { describe, expect, it } from "vitest";

import { EITHER, NEITHER, SKIP, TEXT_SCORE } from "./config";
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
});
