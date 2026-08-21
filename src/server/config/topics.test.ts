// Guards the contract described in topics.ts's header: the topic ids in config, the keys in
// topic-graph.json, and (transitively) every item.topic_id and user_topic.topic_id all have to
// name the same sixteen things.
//
// This is cheap insurance against a whole class of bug that would otherwise surface much later and
// much more confusingly — as a feed that mysteriously can't drift out of one topic, or an
// ingestion run that dies on a foreign key. Recomputing the topic graph in Phase 6 is exactly the
// kind of change that could break it silently.
import { describe, expect, it } from "vitest";

import topicGraph from "./topic-graph.json";
import { TOPICS, V1_SOURCES } from "./topics";

const ids = TOPICS.map((t) => t.id);
const graphKeys = Object.keys(topicGraph.graph);

describe("TOPICS config", () => {
  it("holds exactly the 16 graph-validated topics", () => {
    expect(TOPICS).toHaveLength(16);
  });

  it("has no duplicate ids", () => {
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses slug-shaped ids", () => {
    for (const id of ids) expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it("gives every topic a non-empty label", () => {
    for (const t of TOPICS) expect(t.label.trim()).not.toBe("");
  });

  // The settled 07-17-26 mapping: thirteen labels pass through unchanged, Cartography takes the
  // design handoff's chip term while keeping its graph slug, Portraiture and Zoology keep theirs.
  it("labels Cartography as the handoff's 'Maps' while keeping the slug", () => {
    expect(TOPICS.find((t) => t.id === "cartography")?.label).toBe("Maps");
  });
});

describe("TOPICS ↔ topic-graph.json", () => {
  // The load-bearing assertion. DRIFT walks the graph to pick a neighbouring topic and JUMP draws
  // from the bottom half of a row (SPEC §9) — both look topics up by id, so a mismatch in either
  // direction is a feed that breaks at runtime rather than here.
  it("has an id for every graph row, and a graph row for every id", () => {
    expect([...ids].sort()).toEqual([...graphKeys].sort());
  });

  it("only references known topics in its neighbour rows", () => {
    const known = new Set(ids);
    for (const [from, neighbours] of Object.entries(topicGraph.graph)) {
      for (const n of neighbours) {
        expect(known, `${from} → ${n.topic}`).toContain(n.topic);
      }
    }
  });
});

describe("seed queries", () => {
  it("covers every v1 source for every topic", () => {
    for (const t of TOPICS) {
      expect(Object.keys(t.seedQueries).sort()).toEqual([...V1_SOURCES].sort());
    }
  });

  // A source with an empty array would be silently skipped at ingestion, starving that topic on
  // that source — the failure mode Phase 0 spent real time diagnosing (see the walkthrough).
  it("gives every source at least one non-empty, trimmed query", () => {
    for (const t of TOPICS) {
      for (const source of V1_SOURCES) {
        const queries = t.seedQueries[source];
        expect(queries.length, `${t.id}/${source}`).toBeGreaterThan(0);
        for (const q of queries) {
          expect(q, `${t.id}/${source}`).toBe(q.trim());
          expect(q, `${t.id}/${source}`).not.toBe("");
        }
      }
    }
  });

  it("has no duplicate queries within a source", () => {
    for (const t of TOPICS) {
      for (const source of V1_SOURCES) {
        const queries = t.seedQueries[source];
        expect(new Set(queries).size, `${t.id}/${source}`).toBe(queries.length);
      }
    }
  });
});
