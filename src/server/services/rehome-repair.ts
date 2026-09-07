// The pure core of scripts/repair-rehome.ts (09-07-26): what to do about ONE item whose own tags
// name a topic the vocabulary lacked when it was classified. The third dated exception to Cut 1's
// additivity rule, and the same argument as the first two (membership-trim.ts, period-repair.ts):
// the row being removed is not a claim about the item, it is the classifier reaching for the
// nearest word it had. 70sscifiart is the case that made it: 19,589 of 32,000 sci-fi paintings
// filed under `science`, a topic with 1,226 members the day before — see REHOME_RULES in
// config/topics.ts for the numbers and the evidence regexes.
//
// The mining cannot see this. `mine:topics` ranks tags by un-homed count, and a mis-homed source
// is 99.9% homed; `promote:topics` then sets a display topic only where it is NULL. So a promoted
// `science-fiction` would collect memberships and leave every one of those items *displaying* as
// `science`. This planner is the missing step.
//
// THE RULES, each pinned in rehome-repair.test.ts:
//   1. Nothing happens without evidence — the item's own title, source tags or aesthetic tags
//      matching the rule's regex. Evidence is computed by the caller, which has the row.
//   2. With evidence, the item gains a membership in `to` (origin `tag`: it came from the tags)
//      unless it already has one.
//   3. The `from` row is removed only if it is `curator`-origin. A `tag` row came from a
//      promotion that matched the source's own tags; a `seed` row from a search query. Both are
//      evidence and stay — an item can honestly be both.
//   4. The display moves to `to` when it was `from` and that row is being removed, or when the
//      item was un-homed (the way promotion homes an un-homed item). Any other display is
//      someone else's honest answer and is left alone.
import type { ItemTopicOrigin } from "~/server/db/schema";

export interface RehomeInput {
  rule: { from: string; to: string };
  memberships: readonly { topicId: string; origin: ItemTopicOrigin }[];
  displayTopic: string | null;
  evidence: boolean;
}

export function planRehome(input: RehomeInput): {
  addMembership: boolean;
  removeFrom: boolean;
  /** `undefined` = leave `item.topic_id` alone. */
  newDisplay: string | undefined;
} {
  const { rule, memberships, displayTopic, evidence } = input;
  if (!evidence) {
    return { addMembership: false, removeFrom: false, newDisplay: undefined };
  }
  const addMembership = !memberships.some((m) => m.topicId === rule.to);
  const fromRow = memberships.find((m) => m.topicId === rule.from);
  const removeFrom = fromRow?.origin === "curator";
  const newDisplay =
    displayTopic === null || (displayTopic === rule.from && removeFrom)
      ? rule.to
      : undefined;
  return { addMembership, removeFrom, newDisplay };
}
