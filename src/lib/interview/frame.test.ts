import { describe, expect, it } from "vitest";

import { WINGS } from "~/server/config/interview-wings";
import { facetOf } from "~/server/config/topic-facets";

import { FRAME } from "./frame";

describe("FRAME", () => {
  it("has a noun for every wing and for nothing else — a new wing needs its word here", () => {
    expect(Object.keys(FRAME.nouns).sort()).toEqual(
      WINGS.map((w) => w.id).sort(),
    );
  });

  it("keys its adjectives by topics of the right facet, so a typo can't sit there unseen", () => {
    // Proposed in docs/first-exhibition/vocabulary-proposal.md and not ticked yet: the word
    // waits for the topic (temperament.ts marks the same ids "proposed"). Its adjective cannot
    // fire until then. Named here so that anything *else* unknown is a typo and fails.
    const proposed = new Set(["gothic"]);
    for (const id of Object.keys(FRAME.lookAdjectives))
      if (!proposed.has(id)) expect(facetOf(id), id).toBe("look");
    for (const id of Object.keys(FRAME.mediumAdjectives))
      expect(facetOf(id), id).toBe("medium");
    // …and the list above holds nothing that has since become a topic.
    for (const id of proposed) expect(facetOf(id), id).toBeUndefined();
  });

  it("leaves no word empty", () => {
    const words = [
      FRAME.eyebrow,
      FRAME.untitled.adjective,
      FRAME.untitled.noun,
      ...Object.values(FRAME.lookAdjectives),
      ...Object.values(FRAME.mediumAdjectives),
      ...Object.values(FRAME.nouns),
    ];
    for (const w of words) expect(w.trim()).not.toBe("");
  });
});
