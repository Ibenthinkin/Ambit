#!/usr/bin/env bun
/**
 * Times the feed, so a change to it can be judged rather than guessed at (Phase 7.3, T1).
 *
 *   bun run bench:feed
 *   bun run bench:feed --user ben@example.com --pages 20
 *
 * Two measurements, because they answer two different questions:
 *
 *   1. **`getFeedPage`, N consecutive pages**, following the real cursor — what a reader actually
 *      waits for. SPEC §4's bar is p50 under 300 ms.
 *   2. **One `getTopicPools` call across every topic** — what the *engine* drags out of Postgres to
 *      compose one page. On a laptop with a fast local socket this barely shows up in (1), which is
 *      exactly why it needs measuring separately: on a small VPS with the database a hop away, the
 *      payload is the number that hurts.
 *
 * **Not a test.** It hits the dev database directly, its numbers depend on what else the machine is
 * doing, and it writes `seen_item` rows for whichever user it runs as (a page served is a page
 * spent — see feed.ts). Always compare a before and an after **on the same machine in the same
 * minute**; a number from last week means nothing.
 */
import { and, eq, notLike } from "drizzle-orm";

import { db } from "~/server/db/client";
import { topic, user } from "~/server/db/schema";
import { getTopicPools } from "~/server/db/feed";
import { getFeedPage } from "~/server/services/feed";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const userEmail = flag("user");
const pages = Number(flag("pages") ?? "12");

/** Resolve the user to bench as: the named one, or the first real account on the box. */
let userId: string;
let userLabel: string;
if (userEmail) {
  const [row] = await db.select().from(user).where(eq(user.email, userEmail));
  if (!row) {
    console.error(`no user found for ${userEmail}`);
    process.exit(1);
  }
  userId = row.id;
  userLabel = row.email;
} else {
  // Anything but an e2e leftover — those have almost no history, which makes the seen-exclusion
  // half of the query unrealistically cheap.
  const [row] = await db
    .select()
    .from(user)
    .where(and(notLike(user.email, "ambit-%@example.com")))
    .limit(1);
  if (!row) {
    console.error("no non-e2e user in the database; pass --user <email>");
    process.exit(1);
  }
  userId = row.id;
  userLabel = row.email;
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!;
}

console.log(`bench: ${userLabel} · ${pages} pages\n`);

// ── 1. getFeedPage, page by page, following the cursor ───────────────────────────────────────────
const timings: number[] = [];
let cursor: string | undefined;
let cards = 0;
for (let p = 0; p < pages; p++) {
  const started = performance.now();
  const page = await getFeedPage(userId, cursor);
  timings.push(performance.now() - started);
  cards += page.cards.length;
  cursor = page.nextCursor;
  if (!cursor) {
    console.log(`(pool exhausted after ${p + 1} pages)`);
    break;
  }
}

const sorted = [...timings].sort((a, b) => a - b);
const ms = (n: number) => `${n.toFixed(0)} ms`;
console.log("getFeedPage");
console.log(`  pages   ${timings.length} (${cards} cards)`);
console.log(`  min     ${ms(sorted[0]!)}`);
console.log(`  p50     ${ms(percentile(sorted, 0.5))}`);
console.log(`  p95     ${ms(percentile(sorted, 0.95))}`);
console.log(`  max     ${ms(sorted[sorted.length - 1]!)}`);

// ── 2. getTopicPools on its own ──────────────────────────────────────────────────────────────────
const topics = await db.select({ id: topic.id }).from(topic);
const topicIds = topics.map((t) => t.id);

const poolsStarted = performance.now();
const pools = await getTopicPools(topicIds, {
  userId,
  anchor: new Date(),
  scoreFloor: 4,
  excludeIds: [],
});
const poolsMs = performance.now() - poolsStarted;

let rows = 0;
for (const pool of pools.values()) rows += pool.length;
// A rough stand-in for the bytes crossing the wire — `JSON.stringify` is not the postgres wire
// format, but it is the right order of magnitude and it moves the same way the real payload does.
const mb = JSON.stringify([...pools.values()].flat()).length / (1024 * 1024);

console.log("\ngetTopicPools (all topics, one call)");
console.log(`  topics  ${topicIds.length}`);
console.log(`  wall    ${ms(poolsMs)}`);
console.log(`  rows    ${rows}`);
console.log(`  payload ${mb.toFixed(1)} MB (JSON, approximate)`);

process.exit(0);
