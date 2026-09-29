// The write half of `bun run recurate:writing` (docs/PLAN_writing.md Phase 1): what re-scoring
// one article with the writing curator does to its row. Split out of the script so the rules
// below are integration-tested rather than trusted.
//
//  - **Score, tags, kind and reading time are replaced.** They are the writing curator's answer
//    and nothing else writes them for an article.
//  - **A `news` piece is demoted to 1, never deleted** — saves and seen rows may point at it, and
//    a 1 is as good as gone from the feed's curated-weighted draw. The script lists each one.
//  - **Memberships are additive** (`origin: "curator"`, ON CONFLICT DO NOTHING): the seed topic
//    that surfaced an article stays, the curator's homes join it.
//  - **The display topic is set only where it is NULL** — `scripts/promote-topics.ts`'s pattern
//    (`isNull(item.topicId)` in the WHERE), not `repair:rehome`'s, which also rewrites a topic.

import { and, eq, isNull } from "drizzle-orm";

import type { db as client } from "~/server/db/client";
import { item, itemTopic } from "~/server/db/schema";
import type { WritingKind } from "~/server/config/writing";
import type { CuratedItem } from "./curator";

// `import type` only: the client's type without loading it, so a suite with no env can import
// this file (the same reason db/test-fixtures.ts takes `db` as an argument).
type Db = typeof client;

export type WritingRescore = {
  itemId: string;
  score: number;
  tags: string[];
  kind: WritingKind | null;
  readingMinutes: number | null;
  topics: string[];
  /** The curator called it news; `score` is already 1. */
  news: boolean;
};

/** Pure: one curated answer → what gets written. */
export function planWritingRescore(
  itemId: string,
  curated: Pick<
    CuratedItem,
    | "curationScore"
    | "aestheticTags"
    | "kind"
    | "timeliness"
    | "topics"
    | "readingMinutes"
  >,
): WritingRescore {
  const news = curated.timeliness === "news";
  return {
    itemId,
    score: news ? 1 : curated.curationScore,
    tags: curated.aestheticTags,
    kind: curated.kind ?? null,
    readingMinutes: curated.readingMinutes ?? null,
    topics: curated.topics,
    news,
  };
}

/** Apply one plan in a transaction. Returns how many memberships were new and whether the row
 *  gained a display topic. */
export async function applyWritingRescore(
  db: Db,
  plan: WritingRescore,
): Promise<{ membershipsAdded: number; gainedDisplay: boolean }> {
  return db.transaction(async (tx) => {
    await tx
      .update(item)
      .set({
        curationScore: plan.score,
        aestheticTags: plan.tags,
        kind: plan.kind,
        readingMinutes: plan.readingMinutes,
      })
      .where(eq(item.id, plan.itemId));

    const added =
      plan.topics.length === 0
        ? []
        : await tx
            .insert(itemTopic)
            .values(
              plan.topics.map((topicId) => ({
                itemId: plan.itemId,
                topicId,
                origin: "curator" as const,
              })),
            )
            .onConflictDoNothing()
            .returning({ topicId: itemTopic.topicId });

    const primary = plan.topics[0];
    const gained = primary
      ? await tx
          .update(item)
          .set({ topicId: primary })
          .where(and(eq(item.id, plan.itemId), isNull(item.topicId)))
          .returning({ id: item.id })
      : [];

    return { membershipsAdded: added.length, gainedDisplay: gained.length > 0 };
  });
}
