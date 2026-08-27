#!/usr/bin/env bun
/**
 * Dev CLI for eyeballing a corpus-walk adapter against the live source — the walk-shaped twin of
 * `bun run probe` (scripts/probe-adapter.ts), which is search-shaped and refuses walkers.
 *
 *   bun run probe:walk doorofperception              # page 1, up to 10 posts
 *   bun run probe:walk doorofperception --limit 3
 *   bun run probe:walk doorofperception --cursor 4   # a later page
 */
import type { WalkSourceId } from "~/server/config/topics";
import { walkers } from "~/server/services/sources";

const known = Object.keys(walkers) as WalkSourceId[];
const [source, ...rest] = process.argv.slice(2);
const flag = (name: string) => {
  const i = rest.indexOf(`--${name}`);
  return i > -1 ? rest[i + 1] : undefined;
};
const limit = Number(flag("limit") ?? 10);
const cursor = flag("cursor");

if (!source || !known.includes(source as WalkSourceId)) {
  console.error(`usage: bun run probe:walk <source> [--limit N] [--cursor C]`);
  console.error(`known walk sources: ${known.join(", ")}`);
  process.exit(1);
}
const walker = walkers[source as WalkSourceId];

console.log(
  `Walking ${source} from cursor ${cursor ?? "(start)"} (limit ${limit})…\n`,
);
const t0 = performance.now();
const page = await walker.walk(cursor, { limit });
const elapsed = ((performance.now() - t0) / 1000).toFixed(1);

for (const raw of page.raw) {
  try {
    const it = walker.toItem(raw);
    console.log(
      `${it.title.slice(0, 48).padEnd(50)} img:${it.imageUrl ? "y" : "n"}  ` +
        `sum:${String(it.summary.length).padStart(3)}ch  tags:${String(it.tags.length).padStart(2)}  ${it.sourceUrl}`,
    );
  } catch (err) {
    console.log(`  ✗ toItem: ${String(err)}`);
  }
}
console.log(
  `\n${page.raw.length} raw · next cursor: ${page.next ?? "(end)"} · ${elapsed}s`,
);
