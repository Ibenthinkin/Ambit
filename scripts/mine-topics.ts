#!/usr/bin/env bun
// Cut 2a, step one: read the corpus, rank its tags, and write the proposal file Ben verdicts.
// WRITES NOTHING TO THE DATABASE — it only reads `item` and `topic`, and writes one Markdown file.
//
//   bun run mine:topics                          # defaults: minUnhomed 20, minSources 2
//   bun run mine:topics --min-unhomed 40         # the conservative set (36 topics, 70% of backlog)
//   bun run mine:topics --allow "street art,public art"
//
// The output is Markdown with a `- [ ]` per candidate. Ben ticks the ones to promote, edits any
// label he dislikes, and scripts/promote-topics.ts reads the ticked lines back. The file is the
// interface between a frequency count and a product decision, which is why it is prose a person
// can read rather than JSON a script can parse conveniently.
import { writeFile } from "node:fs/promises";

import { listAllTopics } from "~/server/db/topics";
import {
  DEFAULT_MINING,
  rankCandidates,
  tallyTags,
  topicIdFor,
  topicLabelFor,
  type TagStat,
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

const { db } = await import("~/server/db/client");
const { item } = await import("~/server/db/schema");
const rows = await db
  .select({ tags: item.tags, source: item.source, topicId: item.topicId })
  .from(item);

const stats = tallyTags(
  rows.map((r) => ({
    tags: r.tags ?? [],
    source: r.source,
    homed: r.topicId !== null,
  })),
);
const existing = (await listAllTopics()).map((t) => t.id);
const { promoted, singleSource } = rankCandidates(stats, existing, opts);

const unhomedTotal = rows.filter((r) => r.topicId === null).length;
const keep = new Set(promoted.map((p) => p.tag));
const rescued = rows.filter(
  (r) => r.topicId === null && (r.tags ?? []).some((t) => keep.has(t)),
).length;

const row = (s: TagStat) =>
  `- [ ] \`${topicIdFor(s.tag)}\` — **${topicLabelFor(s.tag)}** ` +
  `<!-- tag: ${s.tag} --> · ${s.unhomed} un-homed / ${s.total} total · ` +
  `${s.sources.length} sources (${s.sources.join(", ")})`;

const doc = `# Topic proposals — Cut 2a

**Generated:** ${new Date().toISOString().slice(0, 10)} by \`bun run mine:topics\`
(minUnhomed ${opts.minUnhomed}, minSources ${opts.minSources}${opts.allow.length ? `, allow: ${opts.allow.join(", ")}` : ""}).
**Do not hand-edit the \`<!-- tag: … -->\` comments** — \`bun run promote:topics\` reads them.

## How to verdict this

Tick \`- [x]\` for every candidate that should become a topic. Leave \`- [ ]\` to reject.
Edit the **bold label** freely; it is what the chip and the credit line will say.
Move a line from *Single-source* up into *Candidates* to rescue it.

**The test is not subject-vs-medium.** Ambit's original sixteen already mix them — \`ceramics\`,
\`textiles\`, \`typography\`, \`cartography\` and \`portraiture\` are media or forms. The test is
**"does this name a kind of thing a person could be curious about?"** — which \`sculpture\`,
\`painting\` and \`food\` pass, and \`20th century\` fails.

**Corpus:** ${rows.length} items, ${unhomedTotal} un-homed (${Math.round((unhomedTotal / rows.length) * 100)}%).
**If every candidate below is accepted:** ${promoted.length} new topics, rescuing ${rescued} of ${unhomedTotal} un-homed items (${Math.round((rescued / unhomedTotal) * 100)}%).

## Candidates (${promoted.length})

${promoted.map(row).join("\n")}

## Single-source (${singleSource.length}) — rejected by the multi-source rule, shown so you can rescue one

These clear the un-homed floor but appear on only one source, so they may be one blog's house
vocabulary rather than shared language. Some are real (\`street art\`, \`public art\`); move any of
those up into Candidates, or pass \`--allow\` to make it permanent.

${singleSource.map(row).join("\n")}
`;

await writeFile("docs/topic-proposals.md", doc);
console.log(
  `wrote docs/topic-proposals.md — ${promoted.length} candidates, ${singleSource.length} single-source, ` +
    `${rescued}/${unhomedTotal} un-homed rescued if all accepted`,
);
process.exit(0);
