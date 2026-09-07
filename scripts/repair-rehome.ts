#!/usr/bin/env bun
/**
 * Re-home items the classifier filed under the nearest word it had (09-07-26).
 *
 *   bun run repair:rehome            # report only: per rule and source, what would change
 *   bun run repair:rehome --confirm  # write
 *
 * For every REHOME_RULES entry (config/topics.ts — `science` → `science-fiction` and
 * `retrofuturism` today), every item whose title, source tags or aesthetic tags carry the rule's
 * evidence gains a `to` membership (origin `tag`), loses its curator-origin `from` row, and has
 * its display topic moved off `from` if that is what it was showing. Rules in
 * services/rehome-repair.ts and its test; this file is the plumbing. Tag- and seed-origin rows
 * are never touched. Nothing calls the LLM; nothing is re-billed.
 *
 * The third dated exception to Cut 1's additivity rule, after trim-memberships.ts and
 * repair-period-topics.ts, for the same reason: the rows removed are a measured model failure,
 * not claims about items. Idempotent — a second run finds the memberships present and the
 * curator rows gone. The `to` topic must exist first (`bun run promote:topics --confirm` with
 * its hand-written proposal line ticked); the script refuses to run otherwise rather than
 * writing memberships to a topic the feed cannot draw. Runs on production inside the app
 * container after a deploy, like the other two.
 */
import { and, eq, inArray, sql } from "drizzle-orm";

import { REHOME_RULES, rehomeEvidence } from "~/server/config/topics";
import { db } from "~/server/db/client";
import { item, itemTopic, topic } from "~/server/db/schema";
import { planRehome } from "~/server/services/rehome-repair";

const confirm = process.argv.includes("--confirm");

/** A JS regex source as a Postgres ARE: `\b` → `\y`, `(?:` → `(`. Only what REHOME_RULES uses. */
const postgresRegex = (re: RegExp) =>
  re.source.replace(/\\b/g, "\\y").replace(/\(\?:/g, "(");

const known = new Set(
  (await db.select({ id: topic.id }).from(topic)).map((r) => r.id),
);
for (const rule of REHOME_RULES) {
  for (const id of [rule.from, rule.to]) {
    if (!known.has(id)) {
      console.error(
        `topic \`${id}\` does not exist — promote it first (docs/topic-proposals.md → bun run promote:topics --confirm).`,
      );
      process.exit(1);
    }
  }
}

interface Change {
  itemId: string;
  rule: (typeof REHOME_RULES)[number];
  addMembership: boolean;
  removeFrom: boolean;
  newDisplay: string | undefined;
}
const changes: Change[] = [];
interface Stat {
  evidence: number;
  added: number;
  removed: number;
  displayMoved: number;
}
const stats = new Map<string, Stat>();
const bump = (key: string, k: keyof Stat) => {
  const s = stats.get(key) ?? {
    evidence: 0,
    added: 0,
    removed: 0,
    displayMoved: 0,
  };
  s[k]++;
  stats.set(key, s);
};

// An item can match more than one rule (a retro-futurist spaceship). Rules run in order and the
// second sees the first's plan, so the dry run counts each membership removal and display move
// once, and the write never removes a row twice or moves a display twice.
const overlay = new Map<
  string,
  { display: string | null; removed: Set<string>; added: Set<string> }
>();

for (const rule of REHOME_RULES) {
  // Candidates: anything that could carry evidence. The regex runs in TypeScript
  // (`rehomeEvidence`); the SQL side is a wide net — every item with a curator `from` row, plus
  // every item whose tags match the same regex in Postgres's dialect. That translation matters:
  // Postgres's ARE reads `\b` as a BACKSPACE, not a word boundary (`\y` is the boundary), and
  // does not know `(?:`. The first run of this script had the tag side silently matching nothing.
  const rows = await db
    .select({
      id: item.id,
      source: item.source,
      title: item.title,
      tags: item.tags,
      aestheticTags: item.aestheticTags,
      topicId: item.topicId,
    })
    .from(item)
    .where(
      sql`${item.id} IN (SELECT ${itemTopic.itemId} FROM ${itemTopic} WHERE ${itemTopic.topicId} = ${rule.from} AND ${itemTopic.origin} = 'curator')
          OR EXISTS (SELECT 1 FROM unnest(ARRAY[${item.title}] || ${item.tags} || COALESCE(${item.aestheticTags}, ARRAY[]::text[])) t WHERE t ~* ${postgresRegex(rule.evidence)})`,
    );
  const withEvidence = rows.filter((r) => rehomeEvidence(rule, r));
  console.log(
    `${rule.from} → ${rule.to}: ${rows.length} candidates, ${withEvidence.length} with evidence`,
  );
  if (withEvidence.length === 0) continue;

  const memberships = await db
    .select({
      itemId: itemTopic.itemId,
      topicId: itemTopic.topicId,
      origin: itemTopic.origin,
    })
    .from(itemTopic)
    .where(
      inArray(
        itemTopic.itemId,
        withEvidence.map((r) => r.id),
      ),
    );
  const byItem = new Map<
    string,
    { topicId: string; origin: (typeof memberships)[number]["origin"] }[]
  >();
  for (const m of memberships) {
    const list = byItem.get(m.itemId) ?? [];
    list.push({ topicId: m.topicId, origin: m.origin });
    byItem.set(m.itemId, list);
  }

  for (const row of withEvidence) {
    const o = overlay.get(row.id) ?? {
      display: row.topicId,
      removed: new Set<string>(),
      added: new Set<string>(),
    };
    const current = (byItem.get(row.id) ?? [])
      .filter((m) => !o.removed.has(m.topicId))
      .concat(
        [...o.added].map((topicId) => ({ topicId, origin: "tag" as const })),
      );
    const plan = planRehome({
      rule,
      memberships: current,
      displayTopic: o.display,
      evidence: true,
    });
    const key = `${rule.to.padEnd(18)} ${row.source}`;
    bump(key, "evidence");
    if (plan.addMembership) {
      bump(key, "added");
      o.added.add(rule.to);
    }
    if (plan.removeFrom) {
      bump(key, "removed");
      o.removed.add(rule.from);
    }
    if (plan.newDisplay !== undefined) {
      bump(key, "displayMoved");
      o.display = plan.newDisplay;
    }
    overlay.set(row.id, o);
    if (
      plan.addMembership ||
      plan.removeFrom ||
      plan.newDisplay !== undefined
    ) {
      changes.push({ itemId: row.id, rule, ...plan });
    }
  }
}

console.log(
  `\n${"rule → source".padEnd(44)}${"evidence".padEnd(10)}${"added".padEnd(8)}${"removed".padEnd(10)}display moved`,
);
for (const [key, s] of [...stats].sort(
  (a, b) => b[1].evidence - a[1].evidence,
)) {
  console.log(
    `${key.padEnd(44)}${String(s.evidence).padEnd(10)}${String(s.added).padEnd(8)}${String(s.removed).padEnd(10)}${s.displayMoved}`,
  );
}
console.log(
  `\ntotal: ${changes.filter((c) => c.addMembership).length} memberships to add, ` +
    `${changes.filter((c) => c.removeFrom).length} curator rows to remove, ` +
    `${changes.filter((c) => c.newDisplay !== undefined).length} display topics to move`,
);

if (!confirm) {
  console.log("\ndry run — pass --confirm to write");
  process.exit(0);
}

let added = 0;
let removed = 0;
let moved = 0;
await db.transaction(async (tx) => {
  const adds = changes.filter((c) => c.addMembership);
  for (let i = 0; i < adds.length; i += 1000) {
    const inserted = await tx
      .insert(itemTopic)
      .values(
        adds.slice(i, i + 1000).map((c) => ({
          itemId: c.itemId,
          topicId: c.rule.to,
          origin: "tag" as const,
        })),
      )
      .onConflictDoNothing()
      .returning({ itemId: itemTopic.itemId });
    added += inserted.length;
  }
  for (const c of changes) {
    if (c.removeFrom) {
      const gone = await tx
        .delete(itemTopic)
        .where(
          and(
            eq(itemTopic.itemId, c.itemId),
            eq(itemTopic.topicId, c.rule.from),
            eq(itemTopic.origin, "curator"),
          ),
        )
        .returning({ itemId: itemTopic.itemId });
      removed += gone.length;
    }
    if (c.newDisplay !== undefined) {
      await tx
        .update(item)
        .set({ topicId: c.newDisplay })
        .where(eq(item.id, c.itemId));
      moved++;
    }
  }
});
console.log(
  `added ${added} memberships; removed ${removed} curator rows; display moved for ${moved} items`,
);
process.exit(0);
