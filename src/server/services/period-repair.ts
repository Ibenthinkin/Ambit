// The pure core of scripts/repair-period-topics.ts (09-07-26): what to do about ONE item that the
// classifier filed under a period topic. The second dated exception to Cut 1's additivity rule,
// for the same reason as the first (membership-trim.ts): the rows are not claims about the item,
// they are a model failure — see PERIOD_TOPICS in config/topics.ts for the measured numbers.
//
// THE RULES, each pinned in period-repair.test.ts:
//   1. Only a `curator`-origin row is ever removed. A `tag` row came from a promotion that
//      matched the source's own tags; a `seed` row from a search query. Both are evidence.
//   2. If the item's own text carries the period (`periodEvidence`), the row stays.
//   3. Otherwise the row goes — and if that topic was the item's DISPLAY topic (`item.topic_id`),
//      the display moves to the next honest membership: the first remaining curator row in the
//      cached answer's order, else any tag/seed row, else null. Null means un-homed, which the
//      WILD tier can still draw — better than a Soviet postcard displayed as nineteenth-century.
import type { ItemTopicOrigin } from "~/server/db/schema";

export interface PeriodRepairInput {
  periodTopic: string;
  memberships: readonly { topicId: string; origin: ItemTopicOrigin }[];
  /** The cached classify answer's order (best fit first); [] if none. */
  cachedOrder: readonly string[];
  displayTopic: string | null;
  /** `periodEvidence(periodTopic, item)` — computed by the caller, which has the row. */
  evidence: boolean;
}

export function planPeriodRepair(input: PeriodRepairInput): {
  remove: boolean;
  /** `undefined` = leave `item.topic_id` alone; `null` = set it to NULL (un-homed). */
  newDisplay: string | null | undefined;
} {
  const { periodTopic, memberships, cachedOrder, displayTopic, evidence } =
    input;
  const row = memberships.find((m) => m.topicId === periodTopic);
  if (row?.origin !== "curator" || evidence) {
    return { remove: false, newDisplay: undefined };
  }
  if (displayTopic !== periodTopic) {
    return { remove: true, newDisplay: undefined };
  }
  const rest = memberships.filter((m) => m.topicId !== periodTopic);
  const curatorInOrder = cachedOrder.filter((id) =>
    rest.some((m) => m.topicId === id && m.origin === "curator"),
  );
  const next =
    curatorInOrder[0] ??
    rest.find((m) => m.origin === "curator")?.topicId ??
    rest[0]?.topicId ??
    null;
  return { remove: true, newDisplay: next };
}
