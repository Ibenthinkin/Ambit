import { describe, expect, it } from "vitest";

import { EITHER, SKIP } from "./config";
import { NARROW, TEST_BANK, WIDE } from "./fixtures";
import { answersToward } from "./path";
import type { Question } from "./types";

const byId = (listed: ReadonlySet<string>, wanted: string[]) =>
  Object.fromEntries(
    answersToward(TEST_BANK, listed, wanted).map((a) => [a.questionId, a.keys]),
  );

describe("answersToward", () => {
  it("answers Either when both sides of a pair hold something wanted", () => {
    expect(byId(WIDE, ["astronomy", "botany"])["space-or-garden"]).toEqual([
      EITHER,
    ]);
  });

  it("answers one side when only that side does", () => {
    expect(byId(WIDE, ["botany"])["space-or-garden"]).toEqual(["garden"]);
  });

  it("chooses every multi answer that adds a wanted topic, up to the question's max", () => {
    expect(byId(WIDE, ["music"]).evening).toEqual(["music"]);
    expect(byId(WIDE, ["music", "poetry", "food"]).evening).toEqual([
      "music",
      "books",
    ]);
  });

  it("never steers by an answer that only subtracts", () => {
    // "Not really" touches eerie but adds nothing; "Yes" is the one that adds it.
    expect(byId(WIDE, ["eerie"]).unsettle).toEqual(["yes"]);
  });

  it("skips what it has no use for — a text question always", () => {
    const a = byId(WIDE, ["music"]);
    expect(a.words).toEqual([SKIP]);
    expect(a["space-or-garden"]).toEqual([SKIP]);
  });

  it("answers only the questions this database is asked", () => {
    expect(Object.keys(byId(NARROW, ["music"]))).not.toContain("unsettle");
  });

  it("applies show.top with the scores of the answers it has produced so far", () => {
    const bank: Question[] = [
      {
        id: "first",
        kind: "choice",
        prompt: "?",
        options: [
          {
            key: "a",
            label: "A",
            effects: [{ topics: ["astronomy"], score: 1 }],
          },
          { key: "b", label: "B", effects: [{ topics: ["botany"], score: 1 }] },
        ],
      },
      {
        id: "playoff",
        kind: "choice",
        prompt: "?",
        show: { top: 1 },
        options: [
          { key: "b", label: "B", effects: [{ topics: ["botany"], score: 1 }] },
          {
            key: "a",
            label: "A",
            effects: [{ topics: ["astronomy"], score: 1 }],
          },
        ],
      },
    ];
    const listed = new Set(["astronomy", "botany"]);
    // Wanting astronomy: "first" → a; then only the top ONE option is on screen, and because
    // astronomy already scored, that is "a" — so the playoff is answered, not skipped.
    expect(answersToward(bank, listed, ["astronomy"])).toEqual([
      { questionId: "first", keys: ["a"] },
      { questionId: "playoff", keys: ["a"] },
    ]);
    // Wanting both: "first" → a (bank order), so the playoff's one card is "a" — the path must
    // answer from what is on screen, not from "b", which sits first in the bank but is hidden.
    expect(answersToward(bank, listed, ["astronomy", "botany"])[1]).toEqual({
      questionId: "playoff",
      keys: ["a"],
    });
    // Wanting botany: the playoff shows "b" (bank order wins the tie after "first" → b scores it).
    expect(answersToward(bank, listed, ["botany"])[1]).toEqual({
      questionId: "playoff",
      keys: ["b"],
    });
  });

  it("skips an `always` option that adds nothing wanted", () => {
    const answers = answersToward(TEST_BANK, WIDE, ["food"]);
    expect(answers.find((a) => a.questionId === "read")).toEqual({
      questionId: "read",
      keys: [SKIP],
    });
  });
});
