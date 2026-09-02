#!/usr/bin/env bun
/**
 * The score-distribution report for a corpus-walk source's trial sample — the `--stats` cousin
 * of `bun run probe:walk` (sources round 2, 09-01-26; docs/HANDOFF_sources-round2.md §4).
 *
 * Why it exists: `bun run ingest --dry-run` prints the topic histogram and the floor breakdown
 * but NOT the score distribution, and a Keep/Park/Cut verdict needs the distribution plus a look
 * at the best and worst titles with their tags. Phase 6.3's numbers came from DB rows after a
 * real write; the Tumblr sample's came from a throwaway script that is gone. This is that script
 * made permanent.
 *
 * What it does: walks the source exactly the way ingest's walk lane does (newest first, up to
 * `--quota` offered), runs structuralFloor, then curateItems in classify mode. Since Cut 1 the
 * split is classified / **un-homed** rather than classified / refused — every curated item is
 * stored either way, so the un-homed share is a fact about the *vocabulary*, not about the
 * source, and the `un-homed tags` line is what a new topic gets proposed from. Run it AFTER the
 * dry-run of the same source and quota and every curator call answers from the on-disk
 * curation cache, so the report is free; run it first and it bills the same cents the dry-run
 * would. Writes nothing to the DB either way.
 *
 *   bun run stats:walk mossandfog                 # newest 150 offered (the trial-loop default)
 *   bun run stats:walk mossandfog --quota 300
 *   bun run stats:walk pdr --cursor e:0 --quota 60   # the essays phase on its own
 */
import type { WalkSourceId } from "~/server/config/topics";
import {
  type CuratedItem,
  curateItems,
  structuralFloor,
} from "~/server/services/curator";
import { tagHistogram } from "~/server/services/ingest-plan";
import { type NormalizedItem, walkers } from "~/server/services/sources";

const known = Object.keys(walkers) as WalkSourceId[];
const [source, ...rest] = process.argv.slice(2);
const flag = (name: string) => {
  const i = rest.indexOf(`--${name}`);
  return i > -1 ? rest[i + 1] : undefined;
};
const quota = Number(flag("quota") ?? 150);

if (
  !source ||
  !known.includes(source as WalkSourceId) ||
  !Number.isFinite(quota) ||
  quota <= 0
) {
  console.error(`usage: bun run stats:walk <source> [--quota N] [--cursor C]`);
  console.error(`known walk sources: ${known.join(", ")}`);
  process.exit(1);
}
const walker = walkers[source as WalkSourceId];

// ── walk, the way ingest does (scripts/ingest.ts processWalker, minus the bookkeeping) ────────
const offered: NormalizedItem[] = [];
let toItemErrors = 0;
let cursor: string | undefined = flag("cursor");
do {
  const page = await walker.walk(cursor, { limit: quota - offered.length });
  for (const raw of page.raw) {
    try {
      offered.push(walker.toItem(raw));
    } catch {
      toItemErrors++;
    }
    if (offered.length >= quota) break;
  }
  cursor = page.next;
} while (cursor !== undefined && offered.length < quota);

const { kept, dropped } = structuralFloor(offered);
const byRule = new Map<string, number>();
for (const d of dropped) byRule.set(d.rule, (byRule.get(d.rule) ?? 0) + 1);

const curated = await curateItems(kept, { classify: true });
const classified = curated.filter((c) => c.topics.length > 0);
const unhomed = curated.filter((c) => c.topics.length === 0);

// ── report ───────────────────────────────────────────────────────────────────────────────────
const avg = (xs: CuratedItem[]) =>
  xs.length
    ? (xs.reduce((s, c) => s + c.curationScore, 0) / xs.length).toFixed(2)
    : "–";
const pct = (n: number, d: number) =>
  d ? `${((100 * n) / d).toFixed(0)}%` : "–";
const scores = curated.map((c) => c.curationScore);
const hist = new Map<number, number>();
for (const s of scores) hist.set(s, (hist.get(s) ?? 0) + 1);

console.log(`\n${source} — newest ${offered.length} offered (quota ${quota})`);
console.log(
  `  toItem errors ${toItemErrors} · floored ${dropped.length} (` +
    [...byRule].map(([r, n]) => `${r} ${n}`).join(", ") +
    `) · curated ${curated.length}`,
);
console.log(
  `  curated: avg ${avg(curated)} · min ${Math.min(...scores)} · max ${Math.max(...scores)} · ` +
    `≥8 ${pct(scores.filter((s) => s >= 8).length, scores.length)}`,
);
console.log(
  `  histogram: ` +
    [...hist]
      .sort((a, b) => a[0] - b[0])
      .map(([s, n]) => `${s}:${n}`)
      .join("  "),
);
console.log(
  `  classified ${classified.length} (avg ${avg(classified)}) · un-homed ${unhomed.length} (avg ${avg(unhomed)}) · ` +
    `stored ${pct(curated.length, offered.length)} of offered · un-homed ${pct(unhomed.length, curated.length)} of stored`,
);

const topics = new Map<string, number>();
for (const c of classified)
  for (const t of c.topics) topics.set(t, (topics.get(t) ?? 0) + 1);
console.log(
  `  topics (${topics.size}/16): ` +
    [...topics]
      .sort((a, b) => b[1] - a[1])
      .map(([t, n]) => `${t} ${n}`)
      .join(", "),
);
console.log(
  `  un-homed tags: ` +
    tagHistogram(unhomed, 10)
      .map(({ tag, n }) => `${tag} ${n}`)
      .join(" · "),
);

const line = (c: CuratedItem) =>
  `    ${c.curationScore}  ${c.topics.join("+") || "(un-homed)"}`.padEnd(24) +
  `${c.title.slice(0, 58).padEnd(60)} [${c.aestheticTags.join(", ")}]`;
const byScore = [...curated].sort((a, b) => b.curationScore - a.curationScore);
console.log(`\n  top:`);
for (const c of byScore.slice(0, 8)) console.log(line(c));
console.log(`  bottom:`);
for (const c of byScore.slice(-5)) console.log(line(c));
console.log(`\n  un-homed, a sample:`);
for (const c of unhomed.slice(0, 6)) console.log(line(c));
console.log();
process.exit(0);
