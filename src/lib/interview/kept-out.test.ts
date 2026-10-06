import { describe, expect, it } from "vitest";

import { QUESTIONS } from "./bank";
import { SKIP } from "./config";
import { allow, keptOut } from "./kept-out";
import { scoreAnswers } from "./score";
import type { Answer } from "./types";

const answers: Answer[] = [
  { questionId: "wings-1", keys: ["space"] },
  { questionId: "rather-not", keys: ["insects", "horror"] },
];

describe("keptOut", () => {
  it("lists what the reader chose to keep out, in the question's order, by label", () => {
    expect(keptOut(QUESTIONS, answers)).toEqual([
      { key: "horror", label: "Horror & gore" },
      { key: "insects", label: "Insects" },
    ]);
  });
  it("is empty for a skip, and when the question was never reached", () => {
    expect(
      keptOut(QUESTIONS, [{ questionId: "rather-not", keys: [SKIP] }]),
    ).toEqual([]);
    expect(keptOut(QUESTIONS, [])).toEqual([]);
  });
});

describe("allow", () => {
  it("lets one choice back in and leaves every other answer alone", () => {
    const next = allow(answers, "insects");
    expect(next[1]).toEqual({ questionId: "rather-not", keys: ["horror"] });
    expect(next[0]).toBe(answers[0]);
    expect(answers[1]!.keys).toEqual(["insects", "horror"]);
  });
  it("leaves a skip when the last one is allowed", () => {
    const next = allow(allow(answers, "insects"), "horror");
    expect(next[1]).toEqual({ questionId: "rather-not", keys: [SKIP] });
  });
  it("returns the same array for a key that was never chosen", () => {
    expect(allow(answers, "death")).toBe(answers);
    expect(allow(answers, SKIP)).toBe(answers);
  });
  it("undoes the score: an allowed subject is no longer scored down", () => {
    const listed = new Set(["insects", "horror", "astronomy"]);
    expect(
      scoreAnswers(QUESTIONS, answers, listed).get("insects"),
    ).toBeLessThan(0);
    const after = scoreAnswers(QUESTIONS, allow(answers, "insects"), listed);
    expect(after.get("insects") ?? 0).toBe(0);
    expect(after.get("horror")).toBeLessThan(0);
  });
});
