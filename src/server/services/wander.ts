// "Where Ambit would wander next" — the teaser at the foot of every item page.
//
// **What it is.** Three items the feed *could* have drifted to from this one, each labelled with
// the walk that would have reached it. It is the feed's own logic (SPEC §9's topic graph + a
// curated-weighted draw) run once, in miniature, for a reader who is looking at a single item
// rather than scrolling a page.
//
// **What it deliberately isn't.** Not a recommendation, not "related items", and above all not
// personalized. `/i/[itemId]` is the app's public surface (SPEC §8.1) — it renders for a stranger
// following a shared link, and this teaser renders for them too. Everything it needs comes from
// the item's own topic and the checked-in topic graph; there is no `userId` parameter to pass,
// which is the structural reason no user data can leak into it.
//
// Same split as feed.ts: a pure topic-picking core with an injectable rng, and a thin DB shell.
import { TOPICS } from "~/server/config/topics";
import { drawFromTopic, getItemById } from "~/server/db/items";
import {
  DEFAULT_KNOBS,
  TOPIC_GRAPH,
  type TopicGraph,
} from "~/server/services/feed";
import { weightedPick } from "~/server/services/random";

/** One teaser row: an item to go to, and the walk that would have found it. */
export interface WanderRow {
  id: string;
  title: string;
  /** Human copy, always topic-anchored ("a drift from Botany into Machines") — never reader-anchored. */
  reason: string;
}

const HOW_MANY = 3;

const topicLabel = (id: string) => TOPICS.find((t) => t.id === id)?.label ?? id;

/**
 * Pick up to `count` topics to wander into from `topicId`: mostly near neighbours, plus one longer
 * leap, mirroring the feed's DRIFT/JUMP split (SPEC §9.1).
 *
 * The near picks use the same softmax over positive-sim neighbours as feed.ts's `hop()` — a local
 * copy of two lines rather than an export, because `hop` returns a `GraphNeighbor` and carries the
 * feed's own fallback semantics; borrowing the *weighting* is the part that matters, and stating
 * it here keeps this function readable on its own. If the weighting ever changes, change it in
 * both places.
 *
 * Never returns `topicId` itself: wandering back to where you already are isn't a wander.
 */
export function pickWanderTopics(
  topicId: string,
  graph: TopicGraph,
  rng: () => number,
  count = HOW_MANY,
): string[] {
  const row = graph[topicId] ?? [];
  const picked: string[] = [];

  // Two near hops, drawn without replacement from the positive-sim head of the row.
  const near = row.filter((n) => n.sim > 0 && n.topic !== topicId);
  const remaining = [...near];
  while (picked.length < Math.min(count - 1, 2) && remaining.length > 0) {
    const choice = weightedPick(
      remaining.map((n): [string, number] => [
        n.topic,
        Math.exp(n.sim / DEFAULT_KNOBS.temp),
      ]),
      rng,
    );
    if (!choice) break;
    picked.push(choice);
    remaining.splice(
      remaining.findIndex((n) => n.topic === choice),
      1,
    );
  }

  // One longer leap, uniform over the far half of the row — the JUMP tier's gesture, and the
  // reason the teaser is worth reading rather than a list of near-synonyms.
  const far = row
    .slice(Math.floor(row.length / 2))
    .filter((n) => n.topic !== topicId && !picked.includes(n.topic));
  if (picked.length < count && far.length > 0) {
    const leap = far[Math.floor(rng() * far.length)];
    if (leap) picked.push(leap.topic);
  }

  return picked;
}

/**
 * The DB-backed teaser: up to three items, drawn the way the feed draws (curated-weighted random
 * within a topic, never similarity — SPEC §9.2), with the walk written out as copy.
 *
 * Falls back to the item's own topic whenever the graph gives nothing or a neighbour's pool comes
 * back empty — the same "no bridge, stay put" honesty as `pickDrift`. That fallback is also what
 * makes the teaser deterministic enough to assert on in e2e, where the seeded corpus is a handful
 * of items in one topic.
 *
 * Returns `{id, title, reason}` and nothing else. Nothing about the item's source, score, or any
 * reader crosses this boundary.
 */
export async function getWanderNext(
  itemId: string,
  rng: () => number = Math.random,
): Promise<WanderRow[]> {
  const item = await getItemById(itemId);
  if (!item) return [];

  // An un-homed item (Cut 1) has no topic to drift from, so there is no honest "a drift from X
  // into Y" to write. An empty teaser is what the item page already renders for an exhausted
  // corpus. Cut 2's promotion gives these items a neighbourhood; until then the page is the picture
  // and its link-out, which is the whole of what a direct link promised.
  if (item.topicId === null) return [];

  const from = item.topicId;
  const neighbours = pickWanderTopics(from, TOPIC_GRAPH, rng);
  const rows: WanderRow[] = [];
  const taken = [itemId];

  const draw = async (topic: string, reason: string) => {
    const [drawn] = await drawFromTopic(topic, {
      scoreFloor: DEFAULT_KNOBS.scoreFloor,
      excludeIds: taken,
      limit: 1,
      rng,
    });
    if (!drawn) return;
    taken.push(drawn.id);
    rows.push({ id: drawn.id, title: drawn.title, reason });
  };

  for (const [index, topic] of neighbours.entries()) {
    // The last pick is the long leap (see `pickWanderTopics`); the earlier ones are near hops.
    const isLeap = index === neighbours.length - 1 && neighbours.length > 1;
    await draw(
      topic,
      isLeap
        ? `a longer leap, from ${topicLabel(from)} to ${topicLabel(topic)}`
        : `a drift from ${topicLabel(from)} into ${topicLabel(topic)}`,
    );
  }

  // Top up from the item's own topic. Runs when the graph had no row for this topic at all, when
  // a neighbour's pool was empty, or simply when the corpus is thin — in every case "more from
  // here" is a true statement and an empty teaser isn't.
  while (rows.length < HOW_MANY) {
    const before = rows.length;
    await draw(from, `more from ${topicLabel(from)}`);
    if (rows.length === before) break; // the topic itself is exhausted — stop, don't spin
  }

  return rows;
}
