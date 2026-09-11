#!/usr/bin/env bun
/**
 * Dev CLI for eyeballing the feed engine against the live dev DB — scripts/probe-adapter.ts's
 * sibling for Phase 4.1: the fast "does this feel right" loop for feel-tuning (SPEC §9's dev
 * affordances) and a quick health check of tier mix, topic spread, and diversity-constraint
 * adherence against real data.
 *
 *   bun run probe:feed --uniform --pages 3
 *   bun run probe:feed --user ben@example.com --pages 2 --knob temp=0.3 --knob hop2=0.8
 *
 * Not a test: it hits the real dev Postgres every time (through the same getFeedPage real users
 * hit) and prints for a human to read. Knob overrides only take effect when FEED_DEBUG resolves
 * truthy (unset defaults to "on" in development, which is what running this script directly gets
 * you — see src/env.js).
 */
import { eq } from "drizzle-orm";

import { db } from "~/server/db/client";
import { user } from "~/server/db/schema";
import { getFeedPage, type FeedKnobs, type Tier } from "~/server/services/feed";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}
function flagAll(name: string): string[] {
  return process.argv.flatMap((a, i) =>
    a === `--${name}` ? [process.argv[i + 1]!] : [],
  );
}

const userEmail = flag("user");
const uniform = process.argv.includes("--uniform");
const pages = Number(flag("pages") ?? "1");
const knobOverrides: Partial<FeedKnobs> = {};
for (const kv of flagAll("knob")) {
  const [key, val] = kv.split("=");
  if (key && val !== undefined) {
    (knobOverrides as Record<string, number>)[key] = Number(val);
  }
}

if (!userEmail && !uniform) {
  console.error(
    "usage: bun run probe:feed --user <email> | --uniform [--pages N] [--knob key=val ...]",
  );
  process.exit(1);
}

let userId: string;
if (uniform) {
  // A throwaway, idempotently-upserted user with zero user_topic rows — exercises the cold-start
  // uniform-weights path (SPEC §9 decision) without touching real account data. `seen_item` still
  // accumulates for it across runs (retained forever, per schema.ts), which is fine: it's a
  // dedicated probe identity, not shared with anything else.
  const probeId = "probe-uniform-user";
  await db
    .insert(user)
    .values({
      id: probeId,
      name: "Feed probe (uniform)",
      email: "probe-uniform@ambit.local",
      emailVerified: false,
    })
    .onConflictDoNothing();
  userId = probeId;
} else {
  const [row] = await db
    .select()
    .from(user)
    .where(eq(user.email, userEmail!))
    .limit(1);
  if (!row) {
    console.error(`no user found for ${userEmail}`);
    process.exit(1);
  }
  userId = row.id;
}

let cursor: string | undefined;
const tierCounts: Record<Tier, number> = {
  CORE: 0,
  DRIFT: 0,
  JUMP: 0,
  WILD: 0,
};
const topicCounts = new Map<string, number>();
// Every served card's curation score, for the summary. The pool-sampling change (09-08-26,
// docs/DESIGN_feed-pool-sampling.md) draws from a sample of each topic rather than the whole
// pool, and the one thing that could show is a drift of served scores toward the mean — this
// is what says whether it did.
const scores: number[] = [];
let adjacencyViolations = 0;
// Cards whose SLOT topic is not the item's display topic — only possible since the pools moved
// onto `item_topic` membership (09-11-26). Zero here on a real account would mean the join
// is not reaching the feed.
let slotIsNotDisplay = 0;

for (let p = 0; p < pages; p++) {
  const page = await getFeedPage(userId, cursor, knobOverrides);
  console.log(`\n── page ${p + 1} ${"─".repeat(60)}`);
  // The planned fetch's readout (FeedPage.debug, dev gate only): how many pools this page asked
  // for, and whether it composed short and took the full reachable fetch too.
  if (page.debug) {
    console.log(
      `(planned ${page.debug.plannedTopics} topics${page.debug.fallback ? " · FALLBACK to the reachable set" : ""})`,
    );
  }
  console.log(
    [
      "tier".padEnd(6),
      "topic".padEnd(16),
      "display".padEnd(16),
      "source".padEnd(10),
      "score".padEnd(6),
      "title".padEnd(40),
      "drift path",
    ].join(" | "),
  );

  let lastSource: string | null = null;
  for (const card of page.cards) {
    tierCounts[card.tier]++;
    scores.push(card.item.curationScore);
    // A topic card's `topicId` is the SLOT's topic; since 09-11-26 the pools come from
    // membership, so it can differ from the item's display topic — the `display` column beside
    // it shows when. `(none)` in the topic column is a WILD card (an un-homed item).
    const t = card.topicId ?? "(none)";
    topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1);
    if (lastSource && card.item.source === lastSource) adjacencyViolations++;
    if (card.topicId !== null && card.item.topicId !== card.topicId)
      slotIsNotDisplay++;
    lastSource = card.item.source;

    console.log(
      [
        card.tier.padEnd(6),
        (card.topicId ?? "(none)").padEnd(16),
        (card.item.topicId ?? "(none)").padEnd(16),
        card.item.source.padEnd(10),
        String(card.item.curationScore).padEnd(6),
        card.item.title.slice(0, 38).padEnd(40),
        (card.driftPath ?? []).join(" → "),
      ].join(" | "),
    );
  }

  if (page.cards.length === 0) {
    console.log("(empty page — feed exhausted for this user)");
  }
  if (!page.nextCursor) {
    console.log("\n(no next cursor — feed exhausted)");
    break;
  }
  cursor = page.nextCursor;
}

const total = tierCounts.CORE + tierCounts.DRIFT + tierCounts.JUMP;
console.log(`\n── summary ${"─".repeat(60)}`);
if (total === 0) {
  console.log("no cards served across any page.");
} else {
  console.log(
    `tier mix: CORE ${((tierCounts.CORE / total) * 100).toFixed(0)}% · ` +
      `DRIFT ${((tierCounts.DRIFT / total) * 100).toFixed(0)}% · ` +
      `JUMP ${((tierCounts.JUMP / total) * 100).toFixed(0)}%  (target 40/35/25)`,
  );
  console.log(
    `topic spread: ${topicCounts.size} distinct topics across ${total} cards`,
  );
  console.log(
    `source-adjacency violations: ${adjacencyViolations} (should be ~0)`,
  );
  console.log(
    `cards served under a topic other than their display topic: ${slotIsNotDisplay} of ${scores.length}`,
  );
  const sorted = [...scores].sort((a, b) => a - b);
  const mean = sorted.reduce((s, x) => s + x, 0) / sorted.length;
  const p10 = sorted[Math.floor(sorted.length * 0.1)]!;
  const topShare = sorted.filter((x) => x >= 9).length / sorted.length;
  console.log(
    `score mean: ${mean.toFixed(2)} · p10: ${p10} · share ≥ 9: ${(topShare * 100).toFixed(0)}%`,
  );
}

process.exit(0);
