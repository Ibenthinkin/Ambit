#!/usr/bin/env bun
// Cut 2a, step three: regenerate src/server/config/topic-graph.json so every topic — the original
// sixteen and everything promoted — has an adjacency row. Every topic the feed can land on needs
// one, or DRIFT and JUMP have nowhere to go from it.
//
//   bun run graph:rebuild                          # dry run: prints the shape and the invariant
//   bun run graph:rebuild --confirm                # rewrites the artifact
//   bun run graph:rebuild --grown-scale 0.7 --confirm
//                                                  # …with the feed's `grownEdgeScale` lever baked
//                                                  # into every co-occurrence cell (dev knob panel,
//                                                  # 09-05-26) so the knob can go back to 1
//
// **This is a HYBRID, by Ben's decision (09-02-26).** The maths and the reasoning live in
// src/server/services/topic-graph-build.ts (which is where the tests are); the rule it applies:
//
//   * an edge between two ORIGINAL topics keeps its embedding `sim`, untouched — Ben tuned the
//     drift feel against those values in Phase 0.5;
//   * an edge touching a PROMOTED topic is computed from tag co-occurrence;
//   * every co-occurrence row is RESCALED to the embedding graph's per-row spread, because the raw
//     values are ~4x flatter and pickDrift's softmax would turn that into a near-uniform draw.
//
// **Both tag columns since 09-06-26** (docs/PLAN_caption-less-and-wild.md T3): a topic's profile
// is the union of each member item's source tags and the curator's `aesthetic_tags`. Grown-topic
// edges therefore reflect the curator's vocabulary too — necessarily, since a topic mined FROM
// aesthetic tags would otherwise have an almost empty profile and land in the graph with almost
// no edges. If drift softens as a result, `--grown-scale` is still the lever, and it is still
// baked into the artifact rather than left on the knob.
//
// Cut 2b replaces the JSON with a `topic_edge` table; the computation is unchanged by that move,
// only the sink is.
import { writeFile } from "node:fs/promises";

import { isRealTopic } from "~/server/config/topics";

import graphData from "~/server/config/topic-graph.json";
import { TOPICS } from "~/server/config/topics";
import { listAllTopics } from "~/server/db/topics";
import {
  applyGrownScale,
  cooccurrenceSims,
  rescaleTo,
  stdDev,
  type Neighbor,
} from "~/server/services/topic-graph-build";

const confirm = process.argv.includes("--confirm");
const scaleArg = process.argv.indexOf("--grown-scale");
const grownScale = scaleArg === -1 ? 1 : Number(process.argv[scaleArg + 1]);
if (!Number.isFinite(grownScale) || grownScale < 0) {
  console.error("--grown-scale needs a non-negative number");
  process.exit(2);
}

// **Core = the config, not the JSON's keys.** The first version of this script read "tuned rows"
// off the artifact's own key set, which meant the sixteen exactly once — after its first run the
// artifact had 99 keys, and a re-run would have frozen every grown value as if Ben had tuned it.
// TOPICS is the contract (config/topics.ts's header; CORE_TOPIC_IDS in services/feed.ts is the
// same set), so the embedding values are taken from the artifact only for pairs inside it.
const embedded = graphData.graph as Record<string, Neighbor[]>;
const original = new Set(TOPICS.map((t) => t.id));

const { db } = await import("~/server/db/client");
const { item, itemTopic } = await import("~/server/db/schema");
const { eq } = await import("drizzle-orm");

const topics = (await listAllTopics()).filter(isRealTopic);
// Each topic's tag profile, from every item that is a member of it. Read through `item_topic`
// rather than `item.topic_id` on purpose: membership is the honest picture of what a topic
// contains, and it is what Cut 2b will draw from too.
const rows = await db
  .select({
    topicId: itemTopic.topicId,
    tags: item.tags,
    aestheticTags: item.aestheticTags,
  })
  .from(itemTopic)
  .innerJoin(item, eq(item.id, itemTopic.itemId));
const profiles = new Map<string, Map<string, number>>();
for (const t of topics) profiles.set(t.id, new Map());
for (const r of rows) {
  const m = profiles.get(r.topicId);
  if (!m) continue;
  // The UNION of both tag columns, deduped and normalized per item (09-06-26, T3) — the same
  // fold topic-mining.ts's tallyTags does, for the same reason: a topic grown from the curator's
  // vocabulary would otherwise have a near-empty profile and land with almost no edges.
  const tags = new Set(
    [...(r.tags ?? []), ...(r.aestheticTags ?? [])]
      .map((t) => t.toLowerCase().trim())
      .filter(Boolean),
  );
  for (const tag of tags) m.set(tag, (m.get(tag) ?? 0) + 1);
}

const cooc = cooccurrenceSims(profiles);
// The spread to match: the mean per-row standard deviation of the tuned embedding rows — and only
// their core×core cells, for the same reason as `original` above. Measured over the whole artifact
// this would drift with every rebuild (the rescaled rows are in there too); measured over the
// sixteen rows' fifteen embedding cells it is the same 0.1345 the first run saw, every time.
const target =
  [...original].reduce(
    (a, id) =>
      a +
      stdDev(
        (embedded[id] ?? [])
          .filter((n) => original.has(n.topic))
          .map((n) => n.sim),
      ),
    0,
  ) / original.size;
console.log(
  `target per-row sim spread (from the embedding graph): ${target.toFixed(4)}`,
);
console.log(`grown-edge scale baked into co-occurrence cells: ${grownScale}`);

// An original topic missing from the DB would mean someone deleted a seeded row; the hybrid has
// no defined answer for that, so say so rather than write a graph with a hole in it.
const missing = [...original].filter((id) => !topics.some((t) => t.id === id));
if (missing.length > 0) {
  console.error(
    `REFUSING TO WRITE — these tuned topics are in topic-graph.json but not in the database: ${missing.join(", ")}`,
  );
  process.exit(1);
}

const graph: Record<string, Neighbor[]> = {};
for (const t of topics) {
  const isOriginal = original.has(t.id);
  // Rescale this topic's co-occurrence row ONCE, then read the values we need out of it, so a
  // new topic's edges are on the same scale whichever row they are read from. `--grown-scale`
  // applies last, after the rescale, which is exactly where the feed's own lever multiplies.
  const scaled = applyGrownScale(
    new Map(
      rescaleTo(
        [...(cooc.get(t.id) ?? new Map<string, number>())].map(
          ([topic, sim]) => ({
            topic,
            sim,
          }),
        ),
        target,
      ).map((n) => [n.topic, n.sim]),
    ),
    grownScale,
  );
  const kept = isOriginal
    ? new Map(embedded[t.id]!.map((n) => [n.topic, n.sim]))
    : new Map<string, number>();
  graph[t.id] = topics
    .filter((o) => o.id !== t.id)
    .map((o) => ({
      // An edge between two originals keeps its tuned value; anything touching a promoted
      // topic comes from the rescaled co-occurrence.
      topic: o.id,
      sim:
        isOriginal && original.has(o.id)
          ? (kept.get(o.id) ?? 0)
          : (scaled.get(o.id) ?? 0),
    }))
    .sort((a, b) => b.sim - a.sim);
}

// The invariant this whole script exists to protect. If it ever fails, the hybrid logic is wrong
// and a hand-tuned drift feel is about to be silently overwritten.
const preserved = [...original].every((a) =>
  embedded[a]!.every((n) => {
    if (!original.has(n.topic)) return true;
    return graph[a]!.find((m) => m.topic === n.topic)?.sim === n.sim;
  }),
);
console.log(`original 16x16 sims preserved exactly: ${preserved}`);
if (!preserved) {
  console.error(
    "REFUSING TO WRITE — a tuned edge changed. Investigate before continuing.",
  );
  process.exit(1);
}
console.log(
  `${topics.length} topics · ${topics.length * (topics.length - 1)} edges`,
);
// What a re-run would actually change, so a dry run says more than "the invariant held". Core×core
// must be zero by construction; the rest moves when the corpus has (or `--grown-scale` did).
let changedCore = 0;
let changedOther = 0;
let newCells = 0;
for (const [from, row] of Object.entries(graph)) {
  const before = new Map((embedded[from] ?? []).map((n) => [n.topic, n.sim]));
  for (const n of row) {
    const prev = before.get(n.topic);
    if (prev === undefined) newCells++;
    else if (prev !== n.sim) {
      if (original.has(from) && original.has(n.topic)) changedCore++;
      else changedOther++;
    }
  }
}
console.log(
  `vs the current artifact: ${changedCore} core×core cells changed · ${changedOther} other cells changed · ${newCells} new cells`,
);

if (!confirm) {
  console.log("dry run — re-run with --confirm to write");
  process.exit(0);
}
await writeFile(
  "src/server/config/topic-graph.json",
  JSON.stringify(
    {
      ...graphData,
      recipe:
        "Hybrid (Cut 2a, 09-02-26): the original sixteen keep their Phase 0 embedding sims; " +
        "every edge touching a promoted topic is IDF-weighted tag co-occurrence, rescaled per " +
        `row to the embedding graph's mean spread, then × grownScale: ${grownScale}. ` +
        "See scripts/rebuild-topic-graph.ts.",
      rebuiltAt: new Date().toISOString(),
      graph,
    },
    null,
    2,
  ) + "\n",
);
console.log("wrote src/server/config/topic-graph.json");
process.exit(0);
