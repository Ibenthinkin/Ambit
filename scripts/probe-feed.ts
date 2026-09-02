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
const tierCounts: Record<Tier, number> = { CORE: 0, DRIFT: 0, JUMP: 0 };
const topicCounts = new Map<string, number>();
let adjacencyViolations = 0;

for (let p = 0; p < pages; p++) {
  const page = await getFeedPage(userId, cursor, knobOverrides);
  console.log(`\n── page ${p + 1} ${"─".repeat(60)}`);
  console.log(
    [
      "tier".padEnd(6),
      "topic".padEnd(16),
      "source".padEnd(10),
      "score".padEnd(6),
      "title".padEnd(40),
      "drift path",
    ].join(" | "),
  );

  let lastSource: string | null = null;
  for (const card of page.cards) {
    tierCounts[card.tier]++;
    // The feed never serves an un-homed card (pools exclude them, db/feed.ts), but `FeedCard`'s
    // topic is `string | null` since Cut 1, so the probe stays honest about the type rather than
    // asserting past it — a `(none)` row here would be a real finding.
    const t = card.topicId ?? "(none)";
    topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1);
    if (lastSource && card.item.source === lastSource) adjacencyViolations++;
    lastSource = card.item.source;

    console.log(
      [
        card.tier.padEnd(6),
        (card.topicId ?? "(none)").padEnd(16),
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
}

process.exit(0);
