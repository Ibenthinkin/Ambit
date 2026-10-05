import { describe, expect, it } from "vitest";

import { HAND_TOPICS } from "./hand-topics";
import { TOPIC_FACETS } from "./topic-facets";
import { groupOf } from "./topic-groups";
import { TOPICS, V1_SOURCES } from "./topics";

describe("HAND_TOPICS (First Exhibition round one)", () => {
  it("has slug ids, unique, and none that is an original", () => {
    const ids = HAND_TOPICS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    const originals = new Set(TOPICS.map((t) => t.id));
    expect(ids.filter((id) => originals.has(id))).toEqual([]);
  });

  it("gives every hand topic a facet and a group — the pickable contract", () => {
    for (const t of HAND_TOPICS) {
      expect(TOPIC_FACETS[t.id], t.id).toBeDefined();
      expect(groupOf(t.id), t.id).toBeDefined();
    }
  });

  it("gives every hand topic a cell for every v1 source (an empty cell is legal: looks and forms are not searched for)", () => {
    for (const t of HAND_TOPICS)
      for (const s of V1_SOURCES)
        expect(Array.isArray(t.seedQueries[s]), `${t.id}/${s}`).toBe(true);
  });

  it("is round one's thirty-three", () => {
    expect(HAND_TOPICS).toHaveLength(33);
  });
});
