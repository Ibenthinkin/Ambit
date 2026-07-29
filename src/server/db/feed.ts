// Repository for feed composition (SPEC §6.3, §9). Typed stub — the real tiered topic-drift
// algorithm (CORE/DRIFT/JUMP tier draw, topic-graph walk, diversity constraints, seen-tracking)
// is built in Phase 4.1, ported from the validated reference implementation at
// `phase0/feed.html`. Nothing here is called yet.
import type { Item } from "~/server/db/items";

export interface FeedPage {
  items: Item[];
  nextCursor?: string;
}

// `cursor` is opaque: it encodes both pagination position and the page's RNG seed, so a refetch
// of the same cursor returns a stable page rather than re-rolling the random draws (SPEC §7).
export function getFeedPage(
  _userId: string,
  _cursor?: string,
): Promise<FeedPage> {
  throw new Error("getFeedPage: not implemented until Phase 4.1");
}
