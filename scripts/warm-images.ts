#!/usr/bin/env bun
/**
 * Fills the image cache ahead of the readers, politely (Phase 7.3, T4).
 *
 *   bun run img:warm --source loc --rate 1        # one image per second, LoC only
 *   bun run img:warm --limit 50                   # every source, 2/s, first 50 uncached
 *   bun run img:warm --dry-run                    # count what would be fetched, fetch nothing
 *
 * **What this is for.** `tile.loc.gov` rate-limits **by IP with no published budget and no
 * `Retry-After`** — a 334-image ingest tripped a sustained 429 from every User-Agent it tried
 * (Phase 6.2). The cache means each image costs one upstream request *ever*; this script is how
 * that one request gets spent deliberately, at a rate we choose, rather than in a burst the first
 * time a reader scrolls past a screenful.
 *
 * **What it does to the outside world.** It calls third-party image servers, once per uncached
 * item, at `--rate` per second **per host**. It writes only cache files. There is nothing
 * destructive here and nothing to undo — deleting `IMAGE_CACHE_DIR` puts everything back — which
 * is why `--dry-run` is *off* by default, unlike the ingest scripts.
 *
 * **It stops itself.** Three consecutive 429s from one host and that host is abandoned for the
 * rest of the run, with the count printed. A budget you have already exceeded is not a budget you
 * should keep pushing on.
 */
import { and, inArray, isNotNull, like, notInArray } from "drizzle-orm";

import { db } from "~/server/db/client";
import { item } from "~/server/db/schema";
import { SUSPENDED_SOURCES } from "~/server/config/suspended-sources";
import {
  cachePathFor,
  fillCache,
  ImageFillError,
} from "~/server/services/image-cache";

import { stat } from "node:fs/promises";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}
function flagAll(name: string): string[] {
  return process.argv.flatMap((a, i) =>
    a === `--${name}` ? [process.argv[i + 1]!] : [],
  );
}

const sources = flagAll("source");
const rate = Number(flag("rate") ?? "2");
const limit = flag("limit") ? Number(flag("limit")) : undefined;
const dryRun = process.argv.includes("--dry-run");

/** The gap between two requests to the same host, in ms. */
const intervalMs = Math.max(0, Math.round(1000 / rate));
/** Consecutive 429s from one host before that host is abandoned for this run. */
const RATE_LIMIT_GIVE_UP = 3;

interface SourceTally {
  filled: number;
  skipped: number;
  upstream: number;
  decode: number;
  tooLarge: number;
  timeout: number;
}
const tally = new Map<string, SourceTally>();
function tallyFor(source: string): SourceTally {
  let row = tally.get(source);
  if (!row) {
    row = {
      filled: 0,
      skipped: 0,
      upstream: 0,
      decode: 0,
      tooLarge: 0,
      timeout: 0,
    };
    tally.set(source, row);
  }
  return row;
}

const conditions = [
  isNotNull(item.imageUrl),
  // http(s) only — `data:` images are rendered by the client and never reach the proxy, and
  // anything else is not something this process should be dereferencing.
  like(item.imageUrl, "http%"),
];
if (sources.length > 0) conditions.push(inArray(item.source, sources));
// A suspended source's images are pointless to warm: `aic` is behind a Cloudflare challenge, not
// a proxy problem (docs/HANDOFF_aic-images.md §8), and its rows can't be drawn into a feed anyway.
if (SUSPENDED_SOURCES.length > 0) {
  conditions.push(notInArray(item.source, SUSPENDED_SOURCES));
}

const rows = await db
  .select({ id: item.id, source: item.source, imageUrl: item.imageUrl })
  .from(item)
  .where(and(...conditions));

console.log(
  `warm: ${rows.length} candidate images` +
    (sources.length
      ? ` from ${sources.join(", ")}`
      : " from every live source") +
    ` · ${rate}/s per host${limit ? ` · limit ${limit}` : ""}` +
    (dryRun ? " · DRY RUN" : ""),
);

/** Already on disk? Then it costs nothing and is skipped without a request. */
async function isCached(itemId: string): Promise<boolean> {
  try {
    await stat(cachePathFor(itemId));
    return true;
  } catch {
    return false;
  }
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return "unknown";
  }
};

/** Last request time and consecutive-429 count, per upstream host. */
const lastRequestAt = new Map<string, number>();
const consecutive429 = new Map<string, number>();
const abandoned = new Set<string>();

const started = Date.now();
let attempted = 0;

for (const row of rows) {
  if (limit !== undefined && attempted >= limit) break;

  const tallyRow = tallyFor(row.source);
  if (await isCached(row.id)) {
    tallyRow.skipped++;
    continue;
  }

  const host = hostOf(row.imageUrl!);
  if (abandoned.has(host)) {
    tallyRow.skipped++;
    continue;
  }

  if (dryRun) {
    attempted++;
    tallyRow.filled++; // "would fill"
    continue;
  }

  // Per **host**, not globally: warming two museums at once is two independent budgets, and
  // serialising them would just make the run twice as long for no politeness gained.
  const since = Date.now() - (lastRequestAt.get(host) ?? 0);
  if (since < intervalMs) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs - since));
  }
  lastRequestAt.set(host, Date.now());
  attempted++;

  try {
    await fillCache(row);
    tallyRow.filled++;
    consecutive429.set(host, 0);
  } catch (err) {
    if (!(err instanceof ImageFillError)) throw err;

    // The 6.2 failure mode, watched for explicitly: a sustained 429 from one host means the
    // budget is already spent, and continuing to ask is the opposite of polite.
    if (err.message.includes("answered 429")) {
      const n = (consecutive429.get(host) ?? 0) + 1;
      consecutive429.set(host, n);
      if (n >= RATE_LIMIT_GIVE_UP) {
        abandoned.add(host);
        console.error(
          `\n!! ${host} answered 429 ${n} times in a row after ${attempted} requests — abandoning it for this run.`,
        );
      }
    } else {
      consecutive429.set(host, 0);
    }

    if (err.kind === "upstream") tallyRow.upstream++;
    else if (err.kind === "decode") tallyRow.decode++;
    else if (err.kind === "too-large") tallyRow.tooLarge++;
    else tallyRow.timeout++;
  }

  if (attempted % 25 === 0) {
    process.stdout.write(`  … ${attempted} requested\n`);
  }
}

const elapsed = (Date.now() - started) / 1000;
const line = "─".repeat(78);
console.log(`\n${line}\nWarm totals${dryRun ? " (dry run)" : ""}\n${line}`);
console.log(
  [
    "source".padEnd(16),
    "filled".padStart(7),
    "cached".padStart(7),
    "upstream".padStart(9),
    "decode".padStart(7),
    "too-big".padStart(8),
    "timeout".padStart(8),
  ].join(" "),
);
for (const [source, t] of [...tally].sort()) {
  console.log(
    [
      source.padEnd(16),
      String(t.filled).padStart(7),
      String(t.skipped).padStart(7),
      String(t.upstream).padStart(9),
      String(t.decode).padStart(7),
      String(t.tooLarge).padStart(8),
      String(t.timeout).padStart(8),
    ].join(" "),
  );
}
if (abandoned.size > 0) {
  console.log(`\nabandoned on sustained 429: ${[...abandoned].join(", ")}`);
}
console.log(`\nelapsed: ${elapsed.toFixed(1)}s`);

process.exit(0);
