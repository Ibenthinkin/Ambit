import { describe, expect, it } from "vitest";

import { TEST_BANK } from "./fixtures";
import { keyKindOf, rendersCards } from "./layout";
import type { Question } from "./types";

const fixture = (id: string) => TEST_BANK.find((q) => q.id === id)!;
const destinations: Question = {
  id: "destinations",
  kind: "multi",
  prompt: "Where would you go?",
  options: [
    {
      key: "kyoto",
      label: "Kyoto",
      effects: [],
      card: { where: "Japan", line: "Moss gardens." },
    },
  ],
};

describe("rendersCards", () => {
  it("is true for a faced choice or multi and for typeset cards, false otherwise", () => {
    expect(rendersCards(fixture("rooms"))).toBe(true);
    expect(rendersCards(fixture("read"))).toBe(true);
    expect(rendersCards(destinations)).toBe(true);
    expect(rendersCards(fixture("evening"))).toBe(false);
    expect(rendersCards(fixture("space-or-garden"))).toBe(false);
  });
});

// The keyboard's layout names (keys.ts) for each question shape — what the shell hands keyAction.
describe("keyKindOf", () => {
  const keep: Question = {
    id: "keep",
    kind: "multi",
    prompt: "Keep or pass.",
    options: [
      { key: "a", label: "A", face: { topic: "botany" }, effects: [] },
      { key: "b", label: "B", face: { topic: "botany" }, effects: [] },
    ],
  };

  it("names the picture screens", () => {
    expect(keyKindOf(fixture("rooms"))).toBe("rooms");
    expect(keyKindOf(fixture("read"))).toBe("read");
    expect(keyKindOf(fixture("space-or-garden"))).toBe("pairs");
    expect(keyKindOf(keep)).toBe("keep");
  });

  it("names the lists: typeset cards are travel, chips to choose among are avoid", () => {
    expect(keyKindOf(destinations)).toBe("travel");
    expect(keyKindOf(fixture("rather-not"))).toBe("avoid");
    expect(keyKindOf(fixture("evening"))).toBe("avoid");
  });

  it("gives a text box and a choice of words no keys", () => {
    expect(keyKindOf(fixture("words"))).toBe("text");
    expect(keyKindOf(fixture("unsettle"))).toBe("none");
  });
});
