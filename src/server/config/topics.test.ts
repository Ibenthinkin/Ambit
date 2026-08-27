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
import {
  SEED_SOURCES,
  TOPICS,
  TRIAL_SOURCES,
  V1_SOURCES,
  WALK_SOURCES,
} from "./topics";

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
      const keys = Object.keys(t.seedQueries);
      for (const source of V1_SOURCES) expect(keys, t.id).toContain(source);
    }
  });

  // Phase 6.3: a walk source (a blog) has no seed queries at all — it is ingested by walking its
  // whole corpus and classifying each item, not by searching it per topic. A cell naming one is
  // therefore always a mistake, and the three tiers must not overlap or a source would be both
  // searched and walked.
  it("gives walk sources no cells, and keeps the three source tiers disjoint", () => {
    for (const t of TOPICS) {
      for (const source of WALK_SOURCES) {
        expect(t.seedQueries, `${t.id}/${source}`).not.toHaveProperty(source);
      }
    }
    const seed = new Set<string>(SEED_SOURCES);
    for (const source of WALK_SOURCES) expect(seed.has(source)).toBe(false);
  });

  // Phase 6.2 (decision 4): a trial source gets a cell only on the topics where it is honest —
  // PoetryDB has nothing to say about ceramics, and NASA has nothing to say about textiles. What
  // is NOT allowed is a cell naming a source that doesn't exist, which is the typo this catches.
  it("names only known sources", () => {
    const known = new Set<string>(SEED_SOURCES);
    for (const t of TOPICS) {
      for (const key of Object.keys(t.seedQueries)) {
        expect(known, `${t.id}/${key}`).toContain(key);
      }
    }
  });

  // Phase 6.2's verdicts, encoded (docs/PHASE6_WALKTHROUGH_6.2.md). Three of the four trial
  // sources were kept and carry cells; poetrydb was parked and carries none, which is what makes
  // it inert — ingest reads `seedQueries[sourceId] ?? []` and skips an empty list, so a source
  // with no cells is never searched no matter that its adapter is registered.
  //
  // If this fails because poetrydb was un-parked, the fix is to move it into the kept list here.
  // That is the intended way to notice, not a nuisance: "which sources actually ingest" is a
  // decision, and it should not be possible to change it without a test saying so.
  it("gives every kept trial source cells, and the parked one none", () => {
    const cellCount = (source: string) =>
      TOPICS.filter((t) => source in t.seedQueries).length;

    for (const source of ["smithsonian", "loc", "nasa-images"]) {
      expect(cellCount(source), source).toBeGreaterThan(0);
    }
    expect(cellCount("poetrydb"), "poetrydb is parked").toBe(0);

    // Every name checked above has to be a real trial source, or the assertions are vacuous.
    for (const source of ["smithsonian", "loc", "nasa-images", "poetrydb"]) {
      expect(TRIAL_SOURCES).toContain(source);
    }
  });

  // A source with an empty array would be silently skipped at ingestion, starving that topic on
  // that source — the failure mode Phase 0 spent real time diagnosing (see the walkthrough).
  it("gives every source at least one non-empty, trimmed query", () => {
    for (const t of TOPICS) {
      for (const source of SEED_SOURCES) {
        // An absent trial cell is fine and expected; a *present* one still has to carry real
        // queries, because an empty array is silently skipped at ingest — the failure mode Phase 0
        // spent real time diagnosing.
        const queries = t.seedQueries[source];
        if (queries === undefined) continue;
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
      for (const source of SEED_SOURCES) {
        const queries = t.seedQueries[source];
        if (queries === undefined) continue;
        expect(new Set(queries).size, `${t.id}/${source}`).toBe(queries.length);
      }
    }
  });
});
