// Repository for the `item` table (SPEC §6.3). Typed stubs only, per docs/PHASE2_PLAN.md step
// 1.6: the point of this file right now is to make the shape of the system visible before it's
// built, not to build it early. Each function's real body lands with the phase that needs it.
import type { item } from "~/server/db/schema";

export type NewItem = typeof item.$inferInsert;
export type Item = typeof item.$inferSelect;

// Idempotent by (source, sourceId): re-running ingestion on an item already seen updates it in
// place instead of duplicating (SPEC §6.4). Built in Phase 3.4 (the ingestion job).
export function upsertItem(_values: NewItem): Promise<Item> {
  throw new Error("upsertItem: not implemented until Phase 3.4");
}

export function getItemById(_id: string): Promise<Item | undefined> {
  throw new Error("getItemById: not implemented until Phase 4");
}

// The feed's item-pick step (SPEC §9.2): weighted-random draw of unseen items in `topicId` above
// `scoreFloor` — weight = (score - floor + 1)^power, boosted by aesthetic-tag overlap with the
// user's taste keywords. Never similarity-ranked (SPEC §9 — that was the Phase 0.4 failure). Built
// in Phase 4.1 alongside the rest of the feed algorithm.
export function drawFromTopic(
  _topicId: string,
  _opts: {
    scoreFloor: number;
    excludeIds: string[];
    limit: number;
    tasteKeywords?: string[];
  },
): Promise<Item[]> {
  throw new Error("drawFromTopic: not implemented until Phase 4.1");
}
