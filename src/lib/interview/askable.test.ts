import { describe, expect, it } from "vitest";

import { askable } from "./askable";
import { NARROW, TEST_BANK, WIDE } from "./fixtures";

const ids = (listed: ReadonlySet<string>) =>
  askable(TEST_BANK, listed).map((q) => q.id);

describe("askable", () => {
  it("asks everything when every answer has somewhere to land", () => {
    expect(ids(WIDE)).toEqual(TEST_BANK.map((q) => q.id));
  });

  it("always asks text and amount questions — they need no topics", () => {
    expect(ids(new Set())).toEqual(["words", "reading-amount"]);
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
});
