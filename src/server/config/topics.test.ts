// Guards the contract described in topics.ts's header: every topic id in config has a row in
// topic-graph.json, and every row the graph references is a row the graph has.
//
// **This used to be an equality and Cut 2a (09-02-26) made it an inclusion.** Before, the config's
// sixteen ids and the graph's keys were the same set. Now the vocabulary grows from the corpus —
// `scripts/promote-topics.ts` inserts `grown` topics that exist only as database rows, and
// `scripts/rebuild-topic-graph.ts` gives each one an adjacency row — so the graph is a superset of
// config by design. What stays load-bearing is the other direction: a config topic with no graph
// row is a feed that cannot drift out of it, and a neighbour id with no row of its own is a
// runtime lookup failure. Both are still checked below, and without needing a database.
//
// This is cheap insurance against a whole class of bug that would otherwise surface much later and
// much more confusingly — as a feed that mysteriously can't drift out of one topic, or an
// ingestion run that dies on a foreign key.
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
  // from the bottom half of a row (SPEC §9), both by id — so a config topic the graph has never
  // heard of is a topic the feed can enter (a user picks its chip) and never leave.
  //
  // Only this direction. Since Cut 2a the graph also holds `grown` topics that exist as database
  // rows and not in config, which is the whole point of the vocabulary growing to fit the corpus.
  it("has a graph row for every config topic", () => {
    expect(graphKeys).toEqual(expect.arrayContaining(ids));
  });

  it("only references topics that have rows of their own", () => {
    // Was `new Set(ids)` — the sixteen — until Cut 2a. Checking against the graph's own keys is
    // what the assertion was really for (a neighbour id nothing can be looked up by breaks
    // pickDrift at runtime), and it now covers the promoted rows too rather than rejecting them.
    const known = new Set(graphKeys);
    for (const [from, neighbours] of Object.entries(topicGraph.graph)) {
      for (const n of neighbours) {
        expect(known, `${from} → ${n.topic}`).toContain(n.topic);
      }
    }
  });

  // A row that is missing a neighbour is a topic pair DRIFT can never traverse in one direction.
  // The rebuild emits full rows; this catches a hand-edit or a half-finished regeneration.
  it("gives every row an entry for every other topic", () => {
    for (const [from, neighbours] of Object.entries(topicGraph.graph)) {
      expect(neighbours.length, from).toBe(graphKeys.length - 1);
      expect(new Set(neighbours.map((n) => n.topic)).size, from).toBe(
        neighbours.length,
      );
    }
  });

  // The invariant scripts/rebuild-topic-graph.ts refuses to write without, asserted here too so it
  // is checked on every run rather than only when someone rebuilds: the sixteen rows encode a
  // drift feel Ben tuned by hand in Phase 0.5, and the hybrid exists to keep them.
  it("keeps the original sixteen's edges to each other on the tuned scale", () => {
    const core = new Set(ids);
    for (const from of ids) {
      const sims = topicGraph.graph[from as keyof typeof topicGraph.graph]
        .filter((n) => core.has(n.topic))
        .map((n) => n.sim);
      // The Phase 0 embedding rows span roughly -0.39..0.35; a row flattened to co-occurrence's
      // raw scale would sit inside ±0.1 and soften DRIFT to a near-uniform pick.
      expect(Math.max(...sims.map(Math.abs)), from).toBeGreaterThan(0.1);
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
