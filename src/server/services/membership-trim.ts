// The pure core of scripts/trim-memberships.ts (09-07-26): given everything the database and the
// curation cache know about one item, decide which `item_topic` rows go.
//
// WHY THIS EXISTS. Cut 1's rule is that membership is additive — `item_topic` rows are never
// retracted by code (docs/DESIGN_topic-vocabulary-growth.md §5). This is the one dated exception,
// and it exists because the rule assumed the rows were honest. Between 09-06 and 09-07-26 the
// classifier, handed all 99 topics, sometimes listed the vocabulary straight back: 89
// sovietpostcards items landed 20+ memberships, nine landed all 99. Those rows are not a claim
// about the item; they are a model failure that MAX_TOPICS (curator.ts) now stops at the parser.
// This planner applies the same cap to rows written before it existed, using the same evidence
// the parser would have used — the cached answer's own best-fit-first order.
//
// THE RULES, each pinned in membership-trim.test.ts:
//   1. Only `origin: "curator"` rows are candidates. `seed` rows came from a search query and
//      `tag` rows from a promotion Ben ticked — neither was the runaway.
//   2. Keep the first MAX_TOPICS in the cached order, always including the display topic
//      (`item.topic_id`), which is the answer's first entry by construction and must never be
//      orphaned from its own membership.
//   3. No cached answer ⇒ remove nothing. Without the order there is no honest way to choose
//      which three, and guessing would be worse than the over-filing.
import { MAX_TOPICS } from "./curator";
import type { ItemTopicOrigin } from "~/server/db/schema";

export interface MembershipTrimInput {
  memberships: readonly { topicId: string; origin: ItemTopicOrigin }[];
  /** The cached classify answer's `topics`, best fit first — or null if no cache entry. */
  cachedOrder: readonly string[] | null;
  displayTopic: string | null;
}

export function planMembershipTrim(input: MembershipTrimInput): {
  keep: string[];
  remove: string[];
} {
  const { memberships, cachedOrder, displayTopic } = input;
  const nonCurator = memberships
    .filter((m) => m.origin !== "curator")
    .map((m) => m.topicId);
  const curatorIds = memberships
    .filter((m) => m.origin === "curator")
    .map((m) => m.topicId);

  if (cachedOrder === null) {
    return { keep: [...nonCurator, ...curatorIds], remove: [] };
  }

  // Rank every curator row: the display topic first, then the cache's order, then anything the
  // cache no longer mentions (a real row from an earlier answer — last, not dropped outright).
  const rank = (id: string): number => {
    if (id === displayTopic) return -1;
    const i = cachedOrder.indexOf(id);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const ordered = [...curatorIds].sort((a, b) => rank(a) - rank(b));
  const keepCurator = ordered.slice(0, MAX_TOPICS);
  const remove = ordered.slice(MAX_TOPICS);

  return { keep: [...nonCurator, ...keepCurator], remove };
}
