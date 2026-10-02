// From an answer to the topic ids it touches. The one rule that matters: **intersect with what
// the server listed.** The bank names ~60 topics and a dozen groups; a fresh database (CI) has
// the sixteen originals, and an id that isn't listed is one `onboarding.complete` would refuse.
import { TOPIC_GROUPS } from "~/server/config/topic-groups";

import type { Effect, Option } from "./types";

const GROUP_TOPICS: ReadonlyMap<string, readonly string[]> = new Map(
  TOPIC_GROUPS.map((g) => [g.id, g.topics]),
);

/** One effect's targets: its topics, then its groups' members, each once, listed ones only.
 *  An unknown group id contributes nothing (bank.test.ts is what forbids one). */
export function targetsOf(
  effect: Effect,
  listed: ReadonlySet<string>,
): string[] {
  const out = new Set<string>();
  for (const t of effect.topics ?? []) if (listed.has(t)) out.add(t);
  for (const g of effect.groups ?? [])
    for (const t of GROUP_TOPICS.get(g) ?? []) if (listed.has(t)) out.add(t);
  return [...out];
}

function collect(
  option: Option,
  listed: ReadonlySet<string>,
  keep: (e: Effect) => boolean,
): string[] {
  const out = new Set<string>();
  for (const e of option.effects)
    if (keep(e)) for (const t of targetsOf(e, listed)) out.add(t);
  return [...out];
}

/** Every listed topic an answer touches, whichever way — what decides whether it is shown. */
export function optionTargets(
  option: Option,
  listed: ReadonlySet<string>,
): string[] {
  return collect(option, listed, () => true);
}

/** The listed topics an answer would *add* (positive effects only) — the button's `data-topics`,
 *  and what path.ts steers by. "Not really" touches four topics and adds none. */
export function optionAdds(
  option: Option,
  listed: ReadonlySet<string>,
): string[] {
  return collect(option, listed, (e) => e.score > 0);
}
