import { describe, expect, it } from "vitest";

import { askable } from "./askable";
import { NARROW, TEST_BANK, WIDE } from "./fixtures";

const ids = (listed: ReadonlySet<string>) =>
  askable(TEST_BANK, listed).map((q) => q.id);

describe("askable", () => {
  it("asks everything when every answer has somewhere to land", () => {
    expect(ids(WIDE)).toEqual(TEST_BANK.map((q) => q.id));
  });

  it("always asks a text question — it needs no topics", () => {
    // …and a question whose options are all `always` (the reading cards).
    expect(ids(new Set())).toEqual(["words", "read"]);
  });

  it("hides an answer with no listed topic, keeping the question while two remain", () => {
    const evening = askable(TEST_BANK, NARROW).find((q) => q.id === "evening")!;
    expect(evening.options.map((o) => o.key)).toEqual(["music", "books"]);
  });

  it("skips a choice left with fewer than two live answers", () => {
    expect(ids(NARROW)).not.toContain("unsettle");
    // Only music survives: one answer is not a question.
    expect(ids(new Set(["music"]))).not.toContain("evening");
  });

  it("skips a pair with a dead side", () => {
    expect(ids(new Set(["astronomy", "music", "poetry"]))).not.toContain(
      "space-or-garden",
    );
    expect(ids(NARROW)).toContain("space-or-garden");
  });

  it("keeps an `always` option whether or not its topics are listed", () => {
    const ratherNot = askable(TEST_BANK, new Set(["horror"])).find(
      (q) => q.id === "rather-not",
    )!;
    // horror is listed; nudity has no topics and survives on `always` — two live answers, so asked.
    expect(ratherNot.options.map((o) => o.key)).toEqual(["horror", "nudity"]);
    // With nothing listed, a multi left with only its `always` option is still skipped (one answer is no choice).
    expect(
      askable(TEST_BANK, new Set()).find((q) => q.id === "rather-not"),
    ).toBeUndefined();
    const read = askable(TEST_BANK, new Set()).find((q) => q.id === "read");
    // Both reading cards are `always`, so the question is asked on an empty database.
    expect(read?.options.map((o) => o.key)).toEqual(["essay", "curiosity"]);
  });
});
