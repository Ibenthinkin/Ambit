#!/usr/bin/env bun
/**
 * Dev CLI for eyeballing a source adapter against the live API — the fast "does this look right"
 * loop while an adapter is being built (Phase 3.1–3.2b), and a quick health check afterward. Not
 * a test: it hits the real network every time and prints for a human to read.
 *
 *   bun run probe wikipedia astronomy --limit 5
 *   bun run probe met "musical instrument" --limit 3
 *
 * As of Phase 3.2b all five v1 sources have adapters — see server/services/sources/index.ts,
 * the registry this CLI reuses directly rather than wiring adapters up by hand.
 */
import { adapters as registry } from "~/server/services/sources";
import type { SourceId } from "~/server/services/sources";

const knownSources = Object.keys(registry) as SourceId[];
const [source, query, ...rest] = process.argv.slice(2);
const limitFlagIdx = rest.indexOf("--limit");
const limit = limitFlagIdx > -1 ? Number(rest[limitFlagIdx + 1]) : 10;

if (!source || !query) {
  console.error("usage: bun run probe <source> <query> [--limit N]");
  console.error(`known sources: ${knownSources.join(", ")}`);
  process.exit(1);
}

// A CLI arg is always a plain string — narrow it to SourceId ourselves rather than widening the
// registry's key type, which would lose the exhaustiveness check everywhere else that imports it.
if (!knownSources.includes(source as SourceId)) {
  console.error(
    `unknown source "${source}" — known: ${knownSources.join(", ")}`,
  );
  process.exit(1);
}
const adapter = registry[source as SourceId];

console.log(`Probing ${source} for "${query}" (limit ${limit})…\n`);
const t0 = performance.now();
const raws = await adapter.search(query, { limit });
const items = raws.map((r: unknown) => adapter.toItem(r));
const elapsed = ((performance.now() - t0) / 1000).toFixed(1);

console.log(
  [
    "title".padEnd(42),
    "type".padEnd(8),
    "img".padEnd(4),
    "license".padEnd(24),
    "tags",
    "summary",
  ].join(" | "),
);
console.log("─".repeat(140));
for (const item of items) {
  console.log(
    [
      item.title.slice(0, 40).padEnd(42),
      item.type.padEnd(8),
      (item.imageUrl ? "yes" : "no").padEnd(4),
      item.license.slice(0, 22).padEnd(24),
      String(item.tags.length),
      item.summary.slice(0, 60).replace(/\n/g, " "),
    ].join(" | "),
  );
}
console.log(`\n${items.length} items in ${elapsed}s`);
