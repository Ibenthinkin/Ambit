// The facet map is hand-assigned (docs/DESIGN_topic-facets-and-personas.md §1). These tests keep
// it honest in the directions a typo can break: a value outside the four, an original topic
// left out, an era topic let in. The other direction — every key is a real topic in the DB, and
// every non-era topic in the DB is a key — is topics.integration.test.ts's job, since only the
// database knows the grown tier.
import { describe, expect, it } from "vitest";

import { TOPICS } from "./topics";
import {
  ERA_TOPICS,
  FACETS,
  FACET_LABELS,
  TOPIC_FACETS,
  facetOf,
} from "./topic-facets";

describe("TOPIC_FACETS", () => {
  it("uses only the four facet values", () => {
    const allowed = new Set<string>(FACETS);
    for (const [id, facet] of Object.entries(TOPIC_FACETS)) {
      expect(allowed.has(facet), `${id}: ${facet}`).toBe(true);
    }
  });

  it("gives every original topic a facet", () => {
    for (const t of TOPICS) {
      expect(facetOf(t.id), t.id).toBeDefined();
    }
  });

  it("leaves era topics out", () => {
    for (const id of ERA_TOPICS) {
      expect(facetOf(id), id).toBeUndefined();
    }
  });

  it("has a label for every facet, in display order", () => {
    expect(FACETS).toEqual(["subject", "medium", "look", "place"]);
    expect(FACETS.map((f) => FACET_LABELS[f])).toEqual([
      "Subject",
      "Medium",
      "Look",
      "Place",
    ]);
  });

  it("has exactly 159 entries — 100 from the design doc plus round 2 (09-12-26); update both if the vocabulary grows", () => {
    expect(Object.keys(TOPIC_FACETS)).toHaveLength(159);
  });
});
