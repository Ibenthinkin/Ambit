// Repository for `topic`/`user_topic` (SPEC §6.3). Typed stub — real implementation lands in
// Phase 4.2 with the `topics.list`/`topics.setMine` tRPC procedures. Note this is distinct from
// seeding: Phase 2.3's `scripts/seed-topics.ts` upserts the 16 config-defined topic rows directly,
// since that's a one-off config load, not a user-facing repository operation.
import type { topic } from "~/server/db/schema";

export type Topic = typeof topic.$inferSelect;

export function listTopics(): Promise<Topic[]> {
  throw new Error("listTopics: not implemented until Phase 4.2");
}

export function setUserTopics(
  _userId: string,
  _topicIds: string[],
): Promise<void> {
  throw new Error("setUserTopics: not implemented until Phase 4.2");
}
