import { describe, expect, it } from "vitest";

import { SKIP } from "./config";
import { TEST_BANK } from "./fixtures";
import { defaultReadingAmount, picksFrom, readingAmountFrom } from "./picks";

const listed = (ids: string[]) => new Set(ids);
const STARTERS = ["astronomy", "botany", "music", "geology"];

describe("picksFrom", () => {
  it("keeps positive scores only, best first", () => {
    const picks = picksFrom(
      new Map([
        ["music", 0.7],
        ["food", 2],
        ["eerie", -0.4],
        ["books", 0.2],
        ["poetry", 0],
      ]),
      listed(["music", "food", "eerie", "books", "poetry"]),
      [],
    );
    expect(picks.map((p) => p.topicId)).toEqual(["food", "music", "books"]);
  });

  it("turns a score into a level's canonical weight", () => {
    const picks = picksFrom(
      new Map([
        ["food", 1.5],
        ["music", 0.6],
        ["books", 0.59],
      ]),
      listed(["food", "music", "books"]),
      [],
    );
    // a lot / some / a little — the edges belong to the higher band.
    expect(picks.map((p) => p.weight)).toEqual([2, 1, 0.5]);
  });

  it("takes at most three topics from one group", () => {
    const space = ["astronomy", "moon", "alien", "robot", "ufo"];
    const picks = picksFrom(
      new Map(space.map((t, i) => [t, 1 - i * 0.1])),
      listed(space),
      [],
    );
    expect(picks.map((p) => p.topicId)).toEqual(["astronomy", "moon", "alien"]);
  });

  it("breaks a tie in the order the scores were first touched", () => {
    const picks = picksFrom(
      new Map([
        ["music", 0.5],
        ["sound", 0.5],
        ["food", 0.5],
      ]),
      listed(["music", "sound", "food"]),
      [],
    );
    expect(picks.map((p) => p.topicId)).toEqual(["music", "sound", "food"]);
  });

  it("stops at twelve", () => {
    // Twelve-plus singleton-ish topics from different groups.
    const many = [
      "astronomy",
      "zoology",
      "botany",
      "geology",
      "clouds",
      "anatomy",
      "machines",
      "architecture",
      "mythology",
      "music",
      "food",
      "soviet",
      "painting",
      "comics",
    ];
    const picks = picksFrom(new Map(many.map((t) => [t, 1])), listed(many), []);
    expect(picks).toHaveLength(12);
  });

  it("tops up to three from the starters when the answers gave fewer", () => {
    const picks = picksFrom(
      new Map([["food", 1]]),
      listed(["food", ...STARTERS]),
      STARTERS,
    );
    expect(picks.map((p) => p.topicId)).toEqual([
      "food",
      "astronomy",
      "botany",
    ]);
    // A starter is offered at "some".
    expect(picks[1]!.weight).toBe(1);
  });

  it("skip-everything is exactly the first three listed starters", () => {
    const picks = picksFrom(
      new Map(),
      listed(["botany", "music", "geology"]),
      STARTERS,
    );
    expect(picks.map((p) => p.topicId)).toEqual(["botany", "music", "geology"]);
  });

  it("never tops up with a topic the reader pushed away, or one already picked", () => {
    const picks = picksFrom(
      new Map([
        ["astronomy", -0.5],
        ["botany", 1],
      ]),
      listed(STARTERS),
      STARTERS,
    );
    expect(picks.map((p) => p.topicId)).toEqual(["botany", "music", "geology"]);
  });

  it("ignores a scored topic the database does not list", () => {
    expect(picksFrom(new Map([["food", 1]]), listed([]), [])).toEqual([]);
  });
});

describe("readingAmountFrom", () => {
  it("reads the amount question's answer", () => {
    expect(
      readingAmountFrom(TEST_BANK, [
        { questionId: "reading-amount", keys: ["lot"] },
      ]),
    ).toBe("lot");
  });

  it("is null when skipped or never asked", () => {
    expect(
      readingAmountFrom(TEST_BANK, [
        { questionId: "reading-amount", keys: [SKIP] },
      ]),
    ).toBeNull();
    expect(readingAmountFrom(TEST_BANK, [])).toBeNull();
  });
});

describe("defaultReadingAmount", () => {
  it("is null when no reading question was asked at all", () => {
    expect(defaultReadingAmount([], 0)).toBeNull();
  });
  it("pictures every time → none", () => {
    expect(defaultReadingAmount([], 2)).toBe("none");
  });
  it("one card opened → a little", () => {
    expect(defaultReadingAmount([{ minutes: 5 }], 1)).toBe("little");
  });
  it("two opened → some, or a lot when both ran 12 minutes or more", () => {
    expect(defaultReadingAmount([{ minutes: 5 }, { minutes: 14 }], 0)).toBe(
      "some",
    );
    expect(defaultReadingAmount([{ minutes: 12 }, { minutes: 20 }], 0)).toBe(
      "lot",
    );
  });
});
