// Which questions to ask, given the topics this database has. This is what lets one bank serve a
// 160-topic production and CI's sixteen originals: an answer with nowhere to land isn't offered,
// and a question that no longer has a real choice in it isn't asked.
import { optionTargets } from "./targets";
import type { Question } from "./types";

/**
 * The bank, filtered:
 *   - a `text` question is always asked — it needs no topic to exist;
 *   - an answer none of whose topics are listed is hidden — unless it is `always`;
 *   - a `pair` with a dead side is skipped (one card is not a face-off);
 *   - a `choice` or `multi` left with fewer than two answers is skipped.
 * Returned questions carry only their live options, in bank order.
 */
export function askable(
  bank: readonly Question[],
  listed: ReadonlySet<string>,
): Question[] {
  const out: Question[] = [];
  for (const q of bank) {
    if (q.kind === "text") {
      out.push(q);
      continue;
    }
    // An `always` option is offered regardless — its point is the log, or its scoring comes from
    // the item it shows rather than from effects (the reading cards). Everything else must have
    // somewhere to land.
    const live = q.options.filter(
      (o) => o.always === true || optionTargets(o, listed).length > 0,
    );
    if (q.kind === "pair" ? live.length < q.options.length : live.length < 2)
      continue;
    out.push({ ...q, options: live });
  }
  return out;
}
