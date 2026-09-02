// The **wander rail** — the endless, images-only sequence behind `/g/[itemId]` (SPEC §8.1, §9).
//
// **What it is.** `services/wander.ts` answers "where would Ambit go next from here?" three times
// and stops. This answers the same question forever: a walk over the topic graph that keeps
// stepping — stay, drift, jump, or ignore the graph altogether (the wildcard) — with one
// curated-weighted image drawn per step. Swipe sideways in the gallery and you are walking that
// rail one slot at a time.
//
// **What it deliberately isn't.**
//
//   - **Not personalized.** Same structural guarantee as `wander.ts`: there is no `userId`
//     parameter to pass. `/g/` is public because its entry point is the public `/i/[itemId]`, and a
//     stranger who followed a shared link can fall into the gallery too.
//   - **Not a feed page.** Fresh `feed.page` draws were rejected in writing at plan time: they are
//     auth-only, and every swipe-through would re-create the corpus-burn defect removed on
//     08-20-26. **This path writes no `seen_item` rows, ever.** Swiping the gallery is free; it
//     spends none of the reader's corpus.
//   - **Not similarity-ranked.** The topic graph chooses *where* to look; a curated-weighted random
//     draw chooses *what* to show (SPEC §9.2). Item-level nearest-neighbour was tested and rejected
//     in Phase 0.4 and does not get a second life here.
//
// Same pure-core/impure-shell split as `feed.ts` and `wander.ts`: `pickRailTopics` is a pure
// function of its graph, rng and knobs, and `getGalleryRail` is the thin DB shell around it.
import type { Item } from "~/server/db/items";
import { WILDCARD_SOURCES } from "~/server/config/wildcard-sources";
import {
  drawFromTopic,
  drawImageAnywhere,
  getItemById,
} from "~/server/db/items";
import {
  DEFAULT_KNOBS,
  TOPIC_GRAPH,
  type TopicGraph,
} from "~/server/services/feed";
import { weightedPick } from "~/server/services/random";

// ── knobs ───────────────────────────────────────────────────────────────────────────────────────

export interface GalleryKnobs {
  /**
   * Probability that a rail slot ignores the topic walk entirely and draws corpus-wide, preferring
   * `WILDCARD_SOURCES` when that list is non-empty.
   *
   * The serendipity dial. 0 makes the rail a pure topic walk (coherent, and eventually a little
   * airless); 1 makes it pure noise. 0.1 is the shipped default — roughly one slot in ten arrives
   * from nowhere, which is often enough to notice and rare enough that the walk still reads as a
   * walk. Deliberately the *only* knob for now; more get added when a feel-tuning session asks for
   * them, not in advance.
   */
  wildcardChance: number;
}

export const RAIL_KNOBS: GalleryKnobs = {
  wildcardChance: 0.1,
};

/** How a given rail slot's topic was chosen — the gallery's slice of SPEC §9's debug overlay. */
export type RailVia = "stay" | "drift" | "jump" | "wildcard";

/**
 * One step of the walk, before any item has been drawn for it. A discriminated union on `via`:
 * a graph step always stands on a topic, while a wildcard step leaves the graph and merely
 * *remembers* where the walk stood — which is `null` for the one rail that never stood anywhere,
 * the all-wildcard rail an un-homed anchor gets (Cut 1: an item no topic fits has no walk to
 * start). Narrowing on `via` is what lets `drawForStep` use `step.topic` as a string after the
 * wildcard branch returns.
 */
export type RailStep =
  | { via: "stay" | "drift" | "jump"; topic: string }
  | { via: "wildcard"; topic: string | null };

/** One rail cell: everything the gallery renders, and nothing else. All of it public item data. */
export interface RailItem {
  id: string;
  title: string;
  attribution: string | null;
  imageUrl: string | null;
  summary: string | null;
  source: string;
  sourceUrl: string;
  license: string | null;
  /** The display topic (Cut 1: nullable — an un-homed picture opened by link, or drawn by a
   *  wildcard slot, has none). The details sheet omits its Topic row rather than inventing one. */
  topicId: string | null;
  /** Only populated when the server's debug flag is on (see `getGalleryRail`). */
  debug?: { via: RailVia; topic: string | null };
}

// ── the pure walk ───────────────────────────────────────────────────────────────────────────────

/**
 * Walk `count` steps out from `startTopicId`, labelling each with how it was reached.
 *
 * Per slot, in order:
 *
 *  1. **Wildcard** (`rng() < knobs.wildcardChance`) — this slot leaves the graph. The walk does
 *     **not** advance: a wildcard is a detour, not a relocation, and the next slot resumes from
 *     wherever the walk already stood. (If it advanced, one wildcard would silently teleport the
 *     rest of the rail, and a dial meant to season the walk would instead replace it.)
 *  2. Otherwise a tier, weighted by the feed's own shares — `DEFAULT_KNOBS.tierCore` /
 *     `tierDrift` / `tierJump`, read rather than restated, so the rail drifts as hard as the feed
 *     does (drift-heavy on purpose; see feed.ts's note on that verdict):
 *     - **stay** — the current topic again.
 *     - **drift** — a near hop: softmax over the positive-sim head of the graph row.
 *     - **jump** — uniform over the far half of the row.
 *
 * Drift and jump **advance** the walk. That is what makes the rail wander instead of orbit: swipe
 * long enough and you are genuinely somewhere else, the way scrolling a feed page drifts down it.
 *
 * A missing or empty graph row degrades to `stay` — "no bridge, stay put", the same honesty as
 * `pickDrift`'s no-row branch.
 *
 * The softmax weighting is a two-line local copy of `feed.ts`'s `hop()` for the same reason
 * `pickWanderTopics` keeps one: `hop` returns a `GraphNeighbor` and carries the feed's own fallback
 * semantics, and borrowing the *weighting* is the part that matters. **If the weighting ever
 * changes, change it in all three places.**
 */
export function pickRailTopics(
  startTopicId: string,
  graph: TopicGraph,
  rng: () => number,
  count: number,
  knobs: GalleryKnobs = RAIL_KNOBS,
): RailStep[] {
  const steps: RailStep[] = [];
  let current = startTopicId;

  for (let i = 0; i < count; i++) {
    if (rng() < knobs.wildcardChance) {
      steps.push({ topic: current, via: "wildcard" });
      continue;
    }

    const tier = weightedPick<RailVia>(
      [
        ["stay", DEFAULT_KNOBS.tierCore],
        ["drift", DEFAULT_KNOBS.tierDrift],
        ["jump", DEFAULT_KNOBS.tierJump],
      ],
      rng,
    );

    const row = graph[current] ?? [];
    if (tier === "drift") {
      const near = row.filter((n) => n.sim > 0 && n.topic !== current);
      const hop = weightedPick(
        near.map((n): [string, number] => [
          n.topic,
          Math.exp(n.sim / DEFAULT_KNOBS.temp),
        ]),
        rng,
      );
      if (hop) {
        current = hop;
        steps.push({ topic: current, via: "drift" });
        continue;
      }
    } else if (tier === "jump") {
      const far = row
        .slice(Math.floor(row.length / 2))
        .filter((n) => n.topic !== current);
      const leap = far[Math.floor(rng() * far.length)];
      if (leap) {
        current = leap.topic;
        steps.push({ topic: current, via: "jump" });
        continue;
      }
    }

    // `stay`, and the degradation for a drift/jump that found no edge to cross.
    steps.push({ topic: current, via: "stay" });
  }

  return steps;
}

// ── the DB shell ────────────────────────────────────────────────────────────────────────────────

export interface GalleryRailOpts {
  /** How many cells to draw. The client asks for a batch at a time and stitches them together. */
  count?: number;
  /** Ids the client already holds, so a batch doesn't repeat what's already on the rail. */
  excludeIds?: string[];
  /** Injectable for deterministic tests; production callers should leave this at its default. */
  rng?: () => number;
  /**
   * Knob overrides from a debug client. Honored **only when the server's debug flag is on** — SPEC
   * §9's "dev affordances behind a dev flag", and exactly the shape `getFeedPage` uses: accepted
   * always, applied conditionally, never an error. A client that always sends its last-used tuning
   * values doesn't need to know whether the server it's talking to has the flag on.
   */
  knobs?: Partial<GalleryKnobs>;
}

/**
 * Draw the next stretch of rail from `anchorItemId`: a walk from the anchor's topic, one
 * curated-weighted image per step, images only.
 *
 * **The fallback chain, and why it has three links.** A step's topic pool can come back empty —
 * a thin corpus, a topic nothing has been ingested into yet, or simply everything already excluded.
 * In order: the step's own topic → the anchor's topic → corpus-wide. Only if all three come back
 * empty does the rail **stop and return short**, which the client reads as "this end is exhausted"
 * and rubber-bands against rather than wrapping. The chain is also what makes the rail deterministic
 * enough to assert on in e2e, where the seeded corpus is a handful of items in one or two topics.
 *
 * Returns `RailItem[]` — public item data only. Nothing user-shaped exists on this path to leak,
 * and **nothing is marked seen**: these are reads.
 */
export async function getGalleryRail(
  anchorItemId: string,
  opts: GalleryRailOpts = {},
): Promise<RailItem[]> {
  const {
    count = 8,
    excludeIds = [],
    rng = Math.random,
    knobs: knobOverrides,
  } = opts;

  const anchor = await getItemById(anchorItemId);
  if (!anchor) return [];

  // Dynamic import: FEED_DEBUG lives on `~/env`, which fails Zod validation the moment it's
  // imported anywhere env vars aren't set (CI's `bun run test` step). Same pattern, same reason, as
  // `getFeedPage` — and it's why `pickRailTopics` above stays importable on its own.
  const { env } = await import("~/env");
  const debugEnabled = env.FEED_DEBUG ?? env.NODE_ENV === "development";

  const knobs: GalleryKnobs = {
    ...RAIL_KNOBS,
    ...(debugEnabled ? knobOverrides : undefined),
  };

  // An un-homed anchor (Cut 1) has no topic to walk from. Rather than invent a start, every slot
  // is a wildcard: the rail still goes somewhere, and `debug.via` says honestly how.
  const steps: RailStep[] =
    anchor.topicId === null
      ? Array.from({ length: count }, (): RailStep => ({
          via: "wildcard",
          topic: null,
        }))
      : pickRailTopics(anchor.topicId, TOPIC_GRAPH, rng, count, knobs);

  const rows: RailItem[] = [];
  // Grows as the batch is drawn, so one rail batch never shows the same image twice. The anchor
  // leads it: the gallery is already showing that picture.
  const taken = [anchorItemId, ...excludeIds];

  for (const step of steps) {
    const drawn = await drawForStep(step, anchor, taken, rng);
    // Every link of the chain came back empty — the corpus has nothing more to offer this rail.
    // Stop rather than spin; a short batch is the client's signal that this end is exhausted.
    if (!drawn) break;

    taken.push(drawn.id);
    rows.push(toRailItem(drawn, debugEnabled ? step : undefined));
  }

  return rows;
}

/** One slot's draw, with the three-link fallback chain described on `getGalleryRail`. */
async function drawForStep(
  step: RailStep,
  anchor: Item,
  taken: string[],
  rng: () => number,
): Promise<Item | undefined> {
  const anywhere = async (sources: string[]) => {
    const [row] = await drawImageAnywhere({
      scoreFloor: DEFAULT_KNOBS.scoreFloor,
      excludeIds: taken,
      limit: 1,
      sources,
      rng,
    });
    return row;
  };

  if (step.via === "wildcard") {
    // Prefer the configured sources when there are any; fall through to the whole corpus when the
    // preferred draw finds nothing — which is *always*, today, because `WILDCARD_SOURCES` is empty
    // (see that file). The two-step shape is what makes flipping it on a config change.
    const preferred =
      WILDCARD_SOURCES.length > 0
        ? await anywhere(WILDCARD_SOURCES)
        : undefined;
    return preferred ?? (await anywhere([]));
  }

  const fromTopic = async (topicId: string) => {
    const [row] = await drawFromTopic(topicId, {
      type: "image",
      scoreFloor: DEFAULT_KNOBS.scoreFloor,
      excludeIds: taken,
      limit: 1,
      rng,
    });
    return row;
  };

  const own = await fromTopic(step.topic);
  if (own) return own;

  // Second link: the anchor's own topic. "More from here" is always a true statement, and it's the
  // link the e2e corpus (one or two topics, a handful of items) actually exercises. Skipped for an
  // un-homed anchor, which has no "here".
  if (anchor.topicId !== null && step.topic !== anchor.topicId) {
    const home = await fromTopic(anchor.topicId);
    if (home) return home;
  }

  // Third link: anywhere at all. Only a genuinely exhausted corpus gets past this.
  return anywhere([]);
}

/** Narrow a full `item` row to the rail's public shape. `knobs` never travels; ids and copy do. */
function toRailItem(row: Item, step: RailStep | undefined): RailItem {
  return {
    id: row.id,
    title: row.title,
    attribution: row.attribution,
    imageUrl: row.imageUrl,
    summary: row.summary,
    source: row.source,
    sourceUrl: row.sourceUrl,
    license: row.license,
    topicId: row.topicId,
    ...(step ? { debug: { via: step.via, topic: step.topic } } : {}),
  };
}
