import { describe, expect, it } from "vitest";

import { NEITHER, SKIP } from "./config";
import { TEST_BANK } from "./fixtures";
import { isAnswered, keepOrPass, pickAnswer, toggleAnswer } from "./answer";
import type { Question } from "./types";

const fixture = (id: string) => TEST_BANK.find((q) => q.id === id)!;

// A keep-shaped question: a picture multi with no cap (bank.ts's `keep`).
const KEEP: Question = {
  id: "keep",
  kind: "multi",
  prompt: "Keep or pass.",
  options: ["a", "b", "c"].map((key) => ({
    key,
    label: key.toUpperCase(),
    face: { topic: "botany" },
    effects: [{ topics: ["botany"], score: 1 }],
  })),
};

describe("pickAnswer", () => {
  it("is the one key, alone", () => {
    expect(pickAnswer(fixture("rooms"), "garden", {})).toEqual({
      questionId: "rooms",
      keys: ["garden"],
    });
  });

  it("carries a reading card's article memberships, so the piece is what scores", () => {
    const faces = {
      "read/essay": {
        itemId: "e1",
        title: "Long",
        writing: {
          title: "Long",
          dek: "",
          minutes: 14,
          kind: "essay" as const,
          topicIds: ["astronomy"],
        },
      },
    };
    expect(pickAnswer(fixture("read"), "essay", faces)).toEqual({
      questionId: "read",
      keys: ["essay"],
      topicIds: ["astronomy"],
    });
  });
});

describe("toggleAnswer", () => {
  const evening = fixture("evening"); // max 2

  it("adds and removes a key", () => {
    expect(toggleAnswer(evening, [], "music").keys).toEqual(["music"]);
    expect(toggleAnswer(evening, ["music"], "music").keys).toEqual([]);
  });

  it("at the cap, the newest answer pushes out the oldest", () => {
    expect(toggleAnswer(evening, ["music", "books"], "food").keys).toEqual([
      "books",
      "food",
    ]);
  });

  it("a key picked after a sentinel replaces it", () => {
    expect(
      toggleAnswer(fixture("rather-not"), [NEITHER], "horror").keys,
    ).toEqual(["horror"]);
  });
});

describe("keepOrPass", () => {
  it("Keep adds the card under the stack and moves on; Pass moves on without it", () => {
    const one = keepOrPass(KEEP, undefined, 0, true);
    expect(one).toEqual({
      answer: { questionId: "keep", keys: ["a"] },
      at: 1,
      done: false,
    });
    const two = keepOrPass(KEEP, one.answer, one.at, false);
    expect(two.answer.keys).toEqual(["a"]);
    expect(two.at).toBe(2);
    expect(two.done).toBe(false);
  });

  it("the last card's decision is the whole answer", () => {
    const last = keepOrPass(KEEP, { questionId: "keep", keys: ["a"] }, 2, true);
    expect(last.answer.keys).toEqual(["a", "c"]);
    expect(last.done).toBe(true);
  });

  // Back into the stack starts it again over what was kept: walking it a second time must be
  // able to change a Keep to a Pass, or the answer could only grow.
  it("Pass on a card kept earlier takes it out again", () => {
    const again = keepOrPass(
      KEEP,
      { questionId: "keep", keys: ["a", "b"] },
      0,
      false,
    );
    expect(again.answer.keys).toEqual(["b"]);
  });

  it("keeps the answer in the cards' order, once each", () => {
    const r = keepOrPass(KEEP, { questionId: "keep", keys: ["c"] }, 0, true);
    expect(r.answer.keys).toEqual(["a", "c"]);
    expect(
      keepOrPass(KEEP, { questionId: "keep", keys: ["a"] }, 0, true).answer
        .keys,
    ).toEqual(["a"]);
  });
});

describe("isAnswered", () => {
  it("is false for nothing, a skip, an emptied multi and a blank box", () => {
    expect(isAnswered(undefined)).toBe(false);
    expect(isAnswered({ questionId: "q", keys: [SKIP] })).toBe(false);
    expect(isAnswered({ questionId: "q", keys: [] })).toBe(false);
    expect(isAnswered({ questionId: "q", keys: [], text: "  " })).toBe(false);
  });

  it("is true for a key or some words", () => {
    expect(isAnswered({ questionId: "q", keys: [NEITHER] })).toBe(true);
    expect(isAnswered({ questionId: "q", keys: [], text: "owls" })).toBe(true);
  });
});
