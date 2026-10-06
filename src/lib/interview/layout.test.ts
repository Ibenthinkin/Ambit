import { describe, expect, it } from "vitest";

import { TEST_BANK } from "./fixtures";
import { columnFor, rendersCards } from "./layout";
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

describe("columnFor", () => {
  it("gives the picture steps the wide column", () => {
    expect(columnFor(fixture("space-or-garden"), "questions")).toBe("wide");
    expect(columnFor(fixture("rooms"), "questions")).toBe("wide");
    expect(columnFor(fixture("read"), "questions")).toBe("wide");
    expect(columnFor(destinations, "questions")).toBe("wide");
  });

  it("keeps words in the narrow column", () => {
    expect(columnFor(fixture("words"), "questions")).toBe("narrow");
    expect(columnFor(fixture("reading-amount"), "questions")).toBe("narrow");
    expect(columnFor(fixture("evening"), "questions")).toBe("narrow");
  });

  it("is narrow off the questions — the intro, the beat, and (until Cut 4) the reveal", () => {
    expect(columnFor(undefined, "intro")).toBe("narrow");
    expect(columnFor(fixture("rooms"), "intro")).toBe("narrow");
    expect(columnFor(undefined, "interpreting")).toBe("narrow");
    expect(columnFor(undefined, "reveal")).toBe("narrow");
  });
});
