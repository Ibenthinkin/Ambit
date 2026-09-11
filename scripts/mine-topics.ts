#!/usr/bin/env bun
// Cut 2a, step one: read the corpus, rank its tags, and write the proposal file Ben verdicts.
// WRITES NOTHING TO THE DATABASE — it only reads `item` and `topic`, and writes one Markdown file.
//
//   bun run mine:topics                          # defaults: minUnhomed 20, minSources 2
//   bun run mine:topics --min-unhomed 40         # the conservative set (36 topics, 70% of backlog)
//   bun run mine:topics --allow "street art,public art"
//   bun run mine:topics --out docs/topic-proposals-round2.md   # keep an earlier verdict file intact
//   bun run mine:topics --rank total --min-total 300         # round 2 (09-11-26): see below
//
// The output is Markdown with a `- [ ]` per candidate. Ben ticks the ones to promote, edits any
// label he dislikes, and scripts/promote-topics.ts reads the ticked lines back. The file is the
// interface between a frequency count and a product decision, which is why it is prose a person
// can read rather than JSON a script can parse conveniently.
import { writeFile } from "node:fs/promises";

import { listAllTopics } from "~/server/db/topics";
import {
  DEFAULT_MINING,
  proposalLine,
  rankCandidates,
  tallyTags,
} from "~/server/services/topic-mining";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i > -1 ? args[i + 1] : undefined;
};
const list = (name: string) =>
  (flag(name) ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const opts = {
  ...DEFAULT_MINING,
  minUnhomed: Number(flag("min-unhomed") ?? DEFAULT_MINING.minUnhomed),
  minSources: Number(flag("min-sources") ?? DEFAULT_MINING.minSources),
  allow: list("allow"),
};
// Where the proposals go. The default is the file promote:topics reads; pass --out when the
// current file still holds a verdict someone is about to apply (round 2, 09-11-26: production
// was promoting Cut 2a's file at the moment round 2 was mined).
const out = flag("out") ?? "docs/topic-proposals.md";
// `--rank total` ranks by how many items carry the tag AT ALL, not how many un-homed ones. The
// un-homed lens is Cut 2a's: "which topic rescues the most invisible items". By round 2 the
// corpus was 99% homed (1,272 of 164,423 un-homed) and that lens finds ten topics, while the
// picker needs a vocabulary — `spaceship` is 4,409 items and one of them is un-homed. Ranking by
// total is that vocabulary. Read the write-up before ticking a total-ranked file: until the feed
// draws from `item_topic`, a promoted topic's DISPLAY pool is only its un-homed items.
const rank = flag("rank") === "total" ? "total" : "unhomed";
const minTotal = Number(flag("min-total") ?? 0);

const { db } = await import("~/server/db/client");
const { item } = await import("~/server/db/schema");
const rows = await db
  .select({
    tags: item.tags,
    // Since 09-06-26 the curator's vocabulary is mined alongside the sources' own — see
    // topic-mining.ts's header. On a caption-less picture blog it is the ONLY vocabulary.
    aestheticTags: item.aestheticTags,
    source: item.source,
    topicId: item.topicId,
  })
  .from(item);

const stats = tallyTags(
  rows.map((r) => ({
    tags: r.tags ?? [],
    aestheticTags: r.aestheticTags ?? [],
    source: r.source,
    homed: r.topicId !== null,
  })),
);
const existing = (await listAllTopics()).map((t) => t.id);
const ranked = rankCandidates(
  stats,
  existing,
  rank === "total" ? { ...opts, minUnhomed: 0 } : opts,
);
const byRank = (a: { total: number; unhomed: number }, b: typeof a) =>
  rank === "total" ? b.total - a.total : b.unhomed - a.unhomed;
const promoted = ranked.promoted.filter((s) => s.total >= minTotal).sort(byRank);
const singleSource = ranked.singleSource.filter((s) => s.total >= minTotal).sort(byRank);

const unhomedTotal = rows.filter((r) => r.topicId === null).length;
const keep = new Set(promoted.map((p) => p.tag));
const rescued = rows.filter(
  (r) =>
    r.topicId === null &&
    [...(r.tags ?? []), ...(r.aestheticTags ?? [])].some((t) =>
      keep.has(t.toLowerCase().trim()),
    ),
).length;

const doc = `# Topic proposals — Cut 2a

**Generated:** ${new Date().toISOString().slice(0, 10)} by \`bun run mine:topics\`
(rank ${rank}, minUnhomed ${opts.minUnhomed}, minTotal ${minTotal}, minSources ${opts.minSources}${opts.allow.length ? `, allow: ${opts.allow.join(", ")}` : ""}).
**Do not hand-edit the \`<!-- tag: … -->\` comments** — \`bun run promote:topics\` reads them.
**Do** replace each \`<!-- facet: ? -->\` with one of \`subject\`, \`medium\`, \`look\`, \`place\` on
every line you tick; \`promote:topics\` refuses a ticked line that still says \`?\`.

## How to verdict this

Tick \`- [x]\` for every candidate that should become a topic. Leave \`- [ ]\` to reject.
Edit the **bold label** freely; it is what the chip and the credit line will say.
Move a line from *Single-source* up into *Candidates* to rescue it.

**\`via curator N/M\` means N of the M items carrying this tag never had it from their SOURCE** —
the curator wrote it, looking at the picture (09-06-26). That is not a reason to reject: on a
caption-less picture blog the curator's words are the only words the item has, and those blogs are
exactly the ones sitting in the un-homed pile. It is a reason to look twice, because the curator's
vocabulary leans toward how a thing *looks* where a source's leans toward what it *is*. The
obvious look-descriptors (\`muted palette\`, \`monochrome\`, \`grainy\`, …) are stopworded and never
reach this list; the judgement call is the rest.

**The test is not subject-vs-medium.** Ambit's original sixteen already mix them — \`ceramics\`,
\`textiles\`, \`typography\`, \`cartography\` and \`portraiture\` are media or forms. The test is
**"does this name a kind of thing a person could be curious about?"** — which \`sculpture\`,
\`painting\` and \`food\` pass, and \`20th century\` fails.

**Corpus:** ${rows.length} items, ${unhomedTotal} un-homed (${Math.round((unhomedTotal / rows.length) * 100)}%).
**If every candidate below is accepted:** ${promoted.length} new topics, rescuing ${rescued} of ${unhomedTotal} un-homed items (${Math.round((rescued / unhomedTotal) * 100)}%).

## Candidates (${promoted.length})

${promoted.map(proposalLine).join("\n")}

## Single-source (${singleSource.length}) — rejected by the multi-source rule, shown so you can rescue one

These clear the un-homed floor but appear on only one source, so they may be one blog's house
vocabulary rather than shared language. Some are real (\`street art\`, \`public art\`); move any of
those up into Candidates, or pass \`--allow\` to make it permanent.

${singleSource.map(proposalLine).join("\n")}
`;

await writeFile(out, doc);
console.log(
  `wrote ${out} — ${promoted.length} candidates, ${singleSource.length} single-source, ` +
    `${rescued}/${unhomedTotal} un-homed rescued if all accepted`,
);
process.exit(0);
