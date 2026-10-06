import { describe, expect, it } from "vitest";

import {
  exhibitionSubtitle,
  exhibitionTitle,
  readingSummary,
  topByFacet,
  wingRanking,
} from "./exhibition";
import { joinAnd } from "./join";

const listed = new Set([
  "astronomy",
  "moon",
  "botany",
  "plants",
  "music",
  "minimal",
  "eerie",
  "photography",
  "engraving",
  "painting",
]);

describe("wingRanking", () => {
  it("ranks wings by the mean positive score over their listed topics, best first", () => {
    const r = wingRanking(
      new Map([
        ["astronomy", 2],
        ["botany", 1],
      ]),
      listed,
    );
    expect(r[0]!.id).toBe("space");
    expect(r[1]!.id).toBe("growing");
    expect(r.find((w) => w.id === "stage")!.score).toBe(0);
  });
});

describe("topByFacet", () => {
  it("lists the top n listed topics of one facet, positive scores only", () => {
    const scores = new Map([
      ["photography", 2],
      ["engraving", 1],
      ["painting", -1],
      ["astronomy", 9],
    ]);
    expect(topByFacet(scores, listed, "medium", 2)).toEqual([
      "photography",
      "engraving",
    ]);
  });
});

describe("exhibitionTitle", () => {
  it("takes the adjective from the top look over the floor and the noun from the top wing", () => {
    expect(
      exhibitionTitle(
        new Map([
          ["eerie", 0.7],
          ["astronomy", 1],
        ]),
        listed,
      ),
    ).toEqual({
      adjective: "Nocturnal",
      noun: "Orbits",
    });
  });
  it("falls back to the top medium when no look clears the floor", () => {
    expect(
      exhibitionTitle(
        new Map([
          ["eerie", 0.5],
          ["engraving", 1],
          ["botany", 2],
        ]),
        listed,
      ),
    ).toEqual({
      adjective: "Engraved",
      noun: "Gardens",
    });
  });
  it("is 'First Exhibition' with nothing scored, so a reader always has a title", () => {
    expect(exhibitionTitle(new Map(), listed)).toEqual({
      adjective: "First",
      noun: "Exhibition",
    });
  });
  it("a look or medium with no adjective in the table does not block the fallbacks", () => {
    // `eerie` → Nocturnal is in the table; `painting` is too. Use an unlisted-table topic:
    const s = new Map([
      ["pattern", 2],
      ["music", 1],
    ]);
    expect(exhibitionTitle(s, new Set([...listed, "pattern"]))).toEqual({
      adjective: "First",
      noun: "Performances",
    });
  });
});

describe("joinAnd", () => {
  it("lists one, two and many", () => {
    expect(joinAnd([])).toBe("");
    expect(joinAnd(["a"])).toBe("a");
    expect(joinAnd(["a", "b"])).toBe("a and b");
    expect(joinAnd(["a", "b", "c"])).toBe("a, b and c");
  });
});

describe("exhibitionSubtitle", () => {
  it("reads as a sentence: the wings, then mostly the mediums", () => {
    expect(
      exhibitionSubtitle(
        ["Creatures", "Growing things", "Myth"],
        ["Photography", "Painting"],
      ),
    ).toBe(
      "Creatures, growing things and myth. Mostly photography and painting.",
    );
  });
  it("leaves out the half that has nothing to say", () => {
    expect(exhibitionSubtitle(["Space"], [])).toBe("Space.");
    expect(exhibitionSubtitle([], ["Engraving"])).toBe("Mostly engraving.");
    expect(exhibitionSubtitle([], [])).toBe("");
  });
});

describe("readingSummary", () => {
  const essay = { kind: "essay" as const };
  const criticism = { kind: "criticism" as const };
  it("names the length and the kinds for a long reader", () => {
    expect(
      readingSummary({ opened: [essay, criticism], readingMinutes: 18 }),
    ).toBe("You like a long read, and you went for essays and criticism.");
  });
  it("says 'something short' for a short reader, and only the kinds in between", () => {
    expect(readingSummary({ opened: [essay], readingMinutes: 3 })).toBe(
      "You like something short, and you went for essays.",
    );
    expect(readingSummary({ opened: [essay], readingMinutes: 9 })).toBe(
      "You went for essays.",
    );
  });
  it("names a kind once when both cards were of it", () => {
    expect(readingSummary({ opened: [essay, essay], readingMinutes: 9 })).toBe(
      "You went for essays.",
    );
  });
  it("says the reader would rather look when no card was opened — and promises nothing", () => {
    expect(readingSummary({ opened: [], readingMinutes: null })).toBe(
      "You’d rather look than read.",
    );
  });
});
