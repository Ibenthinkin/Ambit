import { describe, expect, it } from "vitest";

import { EITHER, SKIP } from "./config";
import { NARROW, TEST_BANK, WIDE } from "./fixtures";
import { answersToward } from "./path";

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

  it("skips what it has no use for — text and amount questions always", () => {
    const a = byId(WIDE, ["music"]);
    expect(a.words).toEqual([SKIP]);
    expect(a["reading-amount"]).toEqual([SKIP]);
    expect(a["space-or-garden"]).toEqual([SKIP]);
  });

  it("answers only the questions this database is asked", () => {
    expect(Object.keys(byId(NARROW, ["music"]))).not.toContain("unsettle");
  });
});
