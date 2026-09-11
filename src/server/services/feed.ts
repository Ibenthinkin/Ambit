// The feed composition engine (SPEC §9) — ported near-verbatim from the validated reference
// implementation at phase0/feed.template.html:196-346 (Phase 0.5's `weightedPick`/`pickCore`/
// `pickDrift`/`pickJump`/`poolFor`/`pickItem`/`composePage`). The design in one line, straight
// from SPEC §9: embeddings already chose WHERE to look (the topic graph, built offline); this
// file only does WHAT to show — curated-weighted random, never similarity-ranked (that was the
// Phase 0.4 failure the whole tiered-topic-drift design replaced).
//
// Everything below `composePage` is pure and DB-free by construction — it takes its topic
// weights, the adjacency graph, and each topic's eligible item pool as plain injected arguments,
// and draws from them with an injected `rng`. That's deliberate: it's the fast, deterministic
// unit-test surface feed.test.ts exercises with fixtures, no Postgres involved. `getFeedPage` is
// the thin, impure shell around it that actually talks to the database and the request-scoped
// environment (§ orchestration below).
import type { Item } from "~/server/db/items";
import { TOPICS } from "~/server/config/topics";
import topicGraphData from "~/server/config/topic-graph.json";
import { drawWeight, getItemsByIds } from "~/server/db/items";
import { getTasteKeywords } from "~/server/db/saves";
import { getUserTopicWeights } from "~/server/db/topics";
import { getTopicPools, getWildPool, type PoolItem } from "~/server/db/feed";
import { feedDebugEnabled } from "./feed-debug";
import { hashSeed, mulberry32, weightedPick } from "./random";

// ── the topic adjacency graph (SPEC §5.2, §9) ──────────────────────────────────────────────────
// A checked-in JSON artifact, not a table — see topic-graph.json's own header comment and
// config/topics.ts's file header for why. Each row is sorted descending by `sim`; DRIFT walks the
// positive head, JUMP draws uniformly from the bottom half (see pickDrift/pickJump below).
export interface GraphNeighbor {
  topic: string;
  sim: number;
}
export type TopicGraph = Record<string, GraphNeighbor[]>;

// The imported JSON also carries build metadata (model/recipe/builtFrom/createdAt) that nothing
// here needs — narrowing to `.graph` keeps every consumer's type surface to just what it draws.
export const TOPIC_GRAPH: TopicGraph = topicGraphData.graph;

/**
 * A copy of `graph` with every edge that touches a grown topic multiplied by `scale`. Core×core
 * cells — the embedding values Ben tuned in Phase 0.5 — are returned exactly as given. Rows keep
 * their key set and length (topics.test.ts's shape contract; pickJump slices the bottom half)
 * and are re-sorted descending (pickDrift reads the positive head in order).
 *
 * Cheap enough for a per-request call: 99 rows × 98 cells. `scale === 1` short-circuits to the
 * same object, so the default path allocates nothing.
 */
export function scaleGrownEdges(
  graph: TopicGraph,
  coreIds: ReadonlySet<string>,
  scale: number,
): TopicGraph {
  if (scale === 1) return graph;
  const out: TopicGraph = {};
  for (const [from, row] of Object.entries(graph)) {
    const fromCore = coreIds.has(from);
    out[from] = row
      .map((n) =>
        fromCore && coreIds.has(n.topic)
          ? n
          : { topic: n.topic, sim: n.sim * scale },
      )
      .sort((a, b) => b.sim - a.sim);
  }
  return out;
}

// ── knobs (SPEC §9) ────────────────────────────────────────────────────────────────────────────
// `FeedKnobs` and `DEFAULT_KNOBS` live in feed-knobs.ts (a leaf with no imports, so the dev knob
// panel can read the defaults client-side without bundling this module's DB layer). Re-exported
// here so the engine's public surface is unchanged.
export { DEFAULT_KNOBS, type FeedKnobs } from "./feed-knobs";
import { DEFAULT_KNOBS, type FeedKnobs } from "./feed-knobs";

/** The core sixteen, as a set — the levers above need "is this topic grown?" on the hot path and
 *  a DB read per hop is not the answer. `TOPICS` is the contract (config/topics.ts's header);
 *  config/topics.test.ts pins that it matches the `core` tier in the database. */
export const CORE_TOPIC_IDS: ReadonlySet<string> = new Set(
  TOPICS.map((t) => t.id),
);

/** WILD (09-06-26) is the fourth tier and the only one with no topic behind it — see
 *  FeedKnobs.tierWild for what it draws and why it is not the gallery rail's "wildcard". */
export type Tier = "CORE" | "DRIFT" | "JUMP" | "WILD";

/**
 * A composed card, as it leaves `composePage` — with the **projection** the engine composed from
 * rather than the full row (Phase 7.3). `getFeedPage` swaps in the real `Item` before returning;
 * see `FeedCard` below for why two types exist.
 */
export interface ComposedCard extends Omit<FeedCard, "item"> {
  item: PoolItem;
}

/**
 * **The card the router and the client see, unchanged since 4.1 — `item` is a whole `Item`.**
 *
 * Since 7.3 the engine no longer *composes* from whole items: pools carry a five-column
 * `PoolItem` projection, because reading ten thousand candidates as full rows cost ~35 MB per
 * page (db/feed.ts's `getTopicPools`). The twelve winners are hydrated by id at the end of
 * `getFeedPage`, so this shape — and therefore the tRPC output and every component — is
 * byte-for-byte what it was.
 */
export interface FeedCard {
  item: Item;
  tier: Tier;
  /**
   * The topic this card was served under. `null` in exactly two cases, and no others:
   *  - a **WILD** card (09-06-26) — the tier draws from the un-homed pool, so there is no topic
   *    to name. Null here means WILD and WILD means null; nothing else in the engine produces it;
   *  - a screen that *dresses* an item as a card without serving it — `saved-screen.tsx` does
   *    that to reuse the masonry, and a saved item can be un-homed (Cut 1).
   * The only reader of this field for layout is the Because tile, which only a JUMP produces.
   */
  topicId: string | null;
  // Topic ids walked to reach this card (DRIFT: [start, hop1, hop2?]; JUMP: [start, landing]) —
  // real product data (not gated by the dev flag), powering SPEC §5.4's connective UI rows that
  // explain *why* a card showed up. Absent for CORE (no walk happened).
  driftPath?: string[];
  // Only populated when the caller asks for it (services/feed.ts's `debug` opt, wired to the
  // FEED_DEBUG env var by getFeedPage) — SPEC §9's debug overlay: which knob combination and
  // topic-walk explanation produced this specific card.
  debug?: { why: string; curationScore: number };
}

export interface FeedPage {
  cards: FeedCard[];
  nextCursor?: string;
  /** Only when the dev gate is on (`feedDebugEnabled()`), like every card's `debug`: how many
   *  topic pools the page asked for, and whether the planned fetch composed short and the full
   *  reachable fetch had to be made (09-11-26). `bench:feed` and `probe:feed` read it. */
  debug?: { plannedTopics: number; fallback: boolean };
}

// ── cursor (SPEC §7) ────────────────────────────────────────────────────────────────────────────
// Opaque, constant-size, base64url-encoded JSON. Constant-size by construction (decision locked
// in docs/BUILD_PLAN.md's Phase 4 plan) — `prev` holds exactly one page's worth of item ids
// (pageSize, a small fixed knob), never the user's whole seen history, so the cursor doesn't grow
// unboundedly across a long scroll session the way a naive "all seen ids" cursor would.
//
// Design note — why `anchor` + `prev` are both needed, not just one: `anchor` is the instant the
// previous page was composed (a page boundary), and `prev` is that page's own item ids. Page N+1
// excludes `served_at < anchor` — everything served before the boundary, i.e. all prior history —
// plus `prev`, which covers the immediately-preceding page itself. Together they account for
// everything the reader has been served, in one query, without the cursor growing over time.
//
// **Why the anchor still holds now that seen-marking happens on receipt (5.7).** Through 5.6 the
// server wrote `seen_item` during the render, so the previous page's rows carried
// `served_at === anchor` exactly and the strict `<` was what kept them out of their own query. As
// of 5.7 the *client* acks the page it actually received (`feed.markSeen`), so those rows land at
// some `T_ack > anchor`. The math survives, on both paths that matter:
//   - **Composing page N+1.** Page N is excluded by `prev`. Pages ≤ N−1 were acked before page N
//     was ever composed, so their `served_at < anchor(N+1)` and the timestamp filter has them.
//   - **Refetching cursor N** (a remount, a back-pop, React Query retrying): the filter still
//     excludes only `served_at < anchor(N)`, and page N's own acks are *later* than that anchor —
//     so the page does not exclude itself, and the identical page reproduces. That stability is
//     what SPEC §7's opaque-cursor promise actually rests on.
// The one genuinely new failure mode is a lost or slow ack racing a fast scroll, which can repeat
// a page. Cosmetic and self-limiting — against render-time marking, which burned 1,116 corpus
// items in six minutes on server renders whose output was thrown away (log.md 08-20-26).
export interface FeedCursor {
  v: 1;
  seed: number;
  page: number;
  anchor: string; // ISO timestamp — JSON can't round-trip a Date, so this is the wire format
  prev: string[]; // item ids served on the immediately-preceding page
}

export function encodeCursor(c: FeedCursor): string {
  return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
}

// A cursor is opaque to the client, but it's still client-suppliable input, not a trusted server
// artifact — an authenticated caller can hand-roll any base64url JSON blob they like and call
// feed.page with it. `prev` is capped here well above any legitimate cursor's size (the router's
// own `knobs.pageSize` zod bound tops out at 50 — see routers/feed.ts) specifically so a crafted
// `prev: [...100k ids]` can't flow into db/feed.ts's `notInArray(item.id, excludeIds)` and blow
// past Postgres' ~65535 bind-parameter ceiling on the feed's hottest endpoint. 64 leaves headroom
// above that 50-item ceiling without being unbounded.
const MAX_CURSOR_PREV = 64;

/** Throws on anything that isn't a well-formed v1 cursor — a malformed or future-version cursor
 * is a client bug, a version skew, or a hand-crafted request, and getFeedPage has nothing sensible
 * to degrade to. Beyond the shape check, `anchor` must parse as a real date (a bogus string would
 * otherwise sail through here as "a string" and only fail much later, as an opaque Postgres
 * serialization error deep inside getTopicPools) and `prev` is capped (see `MAX_CURSOR_PREV`
 * above) and element-type-checked (every entry must actually be a string, not just "an array"). */
export function decodeCursor(s: string): FeedCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(s, "base64url").toString("utf8"));
  } catch {
    throw new Error(
      "decodeCursor: malformed cursor (not valid base64url JSON)",
    );
  }
  const candidate = parsed as Partial<FeedCursor> | null;
  if (
    typeof candidate !== "object" ||
    candidate?.v !== 1 ||
    typeof candidate.seed !== "number" ||
    typeof candidate.page !== "number" ||
    typeof candidate.anchor !== "string" ||
    Number.isNaN(Date.parse(candidate.anchor)) ||
    !Array.isArray(candidate.prev) ||
    candidate.prev.length > MAX_CURSOR_PREV ||
    !candidate.prev.every((id) => typeof id === "string")
  ) {
    throw new Error("decodeCursor: unrecognized cursor shape or version");
  }
  return parsed as FeedCursor;
}

// ── cold start (SPEC §9 decision: a brand-new user has no `user_topic` rows yet) ───────────────
/** Uniform weight 1 across every topic — the graceful-degrade path for a user who hasn't (or
 * can't yet) set topic preferences, so the feed still has something to draw from rather than
 * erroring or serving nothing. */
export function coldStartWeights(
  topicIds: readonly string[] = TOPICS.map((t) => t.id),
): Map<string, number> {
  return new Map(topicIds.map((id) => [id, 1]));
}

// ── topic pick (SPEC §9.1) ──────────────────────────────────────────────────────────────────────
export interface TopicPick {
  topicId: string;
  why: string;
  driftPath?: string[];
}

/** CORE: a straight weighted draw over the user's own topics (`user_topic.weight`). */
export function pickCore(
  weights: Map<string, number>,
  rng: () => number,
): TopicPick | null {
  const topicId = weightedPick([...weights.entries()], rng);
  if (!topicId) return null;
  return { topicId, why: `CORE · ${topicId}` };
}

/** One adjacency-row hop: softmax-sample among positive-similarity neighbours only, temperature
 * `temp` controlling how much the strongest bridge dominates. Shared by pickDrift's first and
 * (conditional) second hop. `grown` scales the weight of any neighbour outside `coreIds` — the
 * `grownHopPenalty` lever; at 1 this is the Phase 0.5 hop, byte for byte. */
function hop(
  graph: TopicGraph,
  from: string,
  temp: number,
  rng: () => number,
  grown: { coreIds: ReadonlySet<string>; penalty: number } = {
    coreIds: CORE_TOPIC_IDS,
    penalty: 1,
  },
): GraphNeighbor | null {
  // Only positive-sim neighbours count as bridges — a weak row must not let "drift" walk a
  // near-zero or negative edge and call it a connection. No bridge → the caller falls back to
  // staying on `from`, which is honest: some topics genuinely have no doorway yet.
  //
  // With `penalty: 0` and a row whose only positive bridges are grown, every weight is 0 and
  // weightedPick returns null — the same "no doorway" fallback. That is what "drift stays inside
  // the core sixteen" means mechanically.
  const row = (graph[from] ?? []).filter((n) => n.sim > 0);
  return weightedPick(
    row.map((n): [GraphNeighbor, number] => [
      n,
      Math.exp(n.sim / temp) * (grown.coreIds.has(n.topic) ? 1 : grown.penalty),
    ]),
    rng,
  );
}

/**
 * DRIFT: start from one of the user's topics, walk its adjacency row one hop (softmax over
 * positive-sim neighbours — the museum-wing doorway: Poetry → Typography because of the printing
 * press, not noise), then a second hop with probability `hop2` (Poetry → Typography → Machines is
 * the signature move). No positive bridge from the start topic → SPEC's "fall back to CORE"
 * (mechanically: this function just returns the start topic, same as pickCore would have for it).
 * The second hop is rejected if it lands back on the start topic — a there-and-back-again isn't a
 * drift.
 */
export function pickDrift(
  weights: Map<string, number>,
  graph: TopicGraph,
  knobs: Pick<FeedKnobs, "temp" | "hop2" | "grownHopPenalty">,
  rng: () => number,
  coreIds: ReadonlySet<string> = CORE_TOPIC_IDS,
): TopicPick | null {
  const start = weightedPick([...weights.entries()], rng);
  if (!start) return null;

  const grown = { coreIds, penalty: knobs.grownHopPenalty };
  const first = hop(graph, start, knobs.temp, rng, grown);
  if (!first) {
    return {
      topicId: start,
      why: `DRIFT · ${start} (no row)`,
      driftPath: [start],
    };
  }

  let topicId = first.topic;
  let why = `DRIFT · ${start} → ${first.topic} (${first.sim.toFixed(2)})`;
  let driftPath = [start, first.topic];

  if (rng() < knobs.hop2) {
    const second = hop(graph, first.topic, knobs.temp, rng, grown);
    if (second && second.topic !== start) {
      topicId = second.topic;
      why = `DRIFT · ${start} → ${first.topic} → ${second.topic} (${first.sim.toFixed(2)}, ${second.sim.toFixed(2)})`;
      driftPath = [start, first.topic, second.topic];
    }
  }

  return { topicId, why, driftPath };
}

/**
 * JUMP: a principled cross-domain leap — uniform draw from the BOTTOM half of one of the user's
 * topics' adjacency rows. Deliberately not the strict antipode: tail ordering in a 16-point
 * mean-centered similarity space is noise, and pretending rank 15 is meaningfully "farther" than
 * rank 12 would be false precision.
 */
export function pickJump(
  weights: Map<string, number>,
  graph: TopicGraph,
  rng: () => number,
): TopicPick | null {
  const start = weightedPick([...weights.entries()], rng);
  if (!start) return null;

  const row = graph[start] ?? [];
  const tail = row.slice(Math.floor(row.length / 2));
  const pick = tail[Math.floor(rng() * tail.length)];
  if (!pick) {
    return {
      topicId: start,
      why: `JUMP · ${start} (no row)`,
      driftPath: [start],
    };
  }
  return {
    topicId: pick.topic,
    why: `JUMP · far from ${start} → ${pick.topic} (${pick.sim.toFixed(2)})`,
    driftPath: [start, pick.topic],
  };
}

/** One guard-loop iteration's tier draw and topic pick, with the item draw left out. */
export interface SlotPick {
  tier: Tier;
  /** Null for WILD (no topic behind it) and for a topic tier that found nothing to pick (an
   *  empty weights map). */
  pick: TopicPick | null;
}

/**
 * The first half of one iteration of `composePage`'s guard loop: draw a tier, then a topic for
 * it. Factored out (09-11-26) so `planTopics` can replay exactly this sequence without pools —
 * which only works because this consumes `rng` identically whether or not the slot then fills.
 * Every rng call a slot makes before its item draw happens in here, and nothing in here depends
 * on what earlier slots drew.
 */
export function pickSlot(
  weights: Map<string, number>,
  graph: TopicGraph,
  knobs: FeedKnobs,
  rng: () => number,
  coreTopicIds: ReadonlySet<string>,
): SlotPick | null {
  const tier = weightedPick<Tier>(
    [
      ["CORE", knobs.tierCore],
      ["DRIFT", knobs.tierDrift],
      ["JUMP", knobs.tierJump],
      ["WILD", knobs.tierWild],
    ],
    rng,
  );
  if (!tier) return null; // all tier weights <= 0 — degenerate knobs; the caller's guard bounds the retry
  if (tier === "WILD") return { tier, pick: null };
  const pick =
    tier === "CORE"
      ? pickCore(weights, rng)
      : tier === "DRIFT"
        ? pickDrift(weights, graph, knobs, rng, coreTopicIds)
        : pickJump(weights, graph, rng);
  return { tier, pick };
}

/**
 * How far ahead `planTopics` looks, in pages: horizon = pageSize × this. A page needs `pageSize`
 * successful draws; the rest is slack for the slots that fail (a capped topic, an empty pool).
 * Five is generous — 48 failures in a 12-card page — and cheap, because a plan iteration is a
 * few weighted picks with no I/O. Past the horizon `composePage` meets pools it never fetched,
 * composes short, and `getFeedPage` takes the full-fetch fallback; `bench:feed` counts how often.
 */
export const PLAN_HORIZON_PAGES = 5;

/**
 * Which topics a page will draw from — computed **without pools** (09-11-26,
 * docs/DESIGN_feed-on-membership.md §4.3). Replays `composePage`'s guard loop through
 * `pickSlot` for `horizon` iterations, assuming every draw succeeds (so the topic cap advances
 * on every uncapped pick, exactly as it does in the real loop when the pool is not empty), and
 * returns every topic it landed on.
 *
 * Why this is exact and not a guess: `composePage`, handed a topic stream seeded the same way
 * and a *separate* `itemRng`, consumes the topic stream identically per iteration whether the
 * slot fills or not — the cap check comes after the pick — so its iteration i lands on the same
 * topic this one did. The two can only differ in *how many* iterations the real loop needs,
 * which is what the horizon's slack is for. A capped pick is not added on that iteration, but
 * it was added on the pick that first counted it, so nothing the real loop can land on inside
 * the horizon is missing from the set. (The plan's cap counts are never *below* the real loop's
 * — it assumes every draw landed — so the real loop can never be let through to a topic the
 * plan had already closed.)
 *
 * This is what lets `getFeedPage` fetch ~40 pools rather than every reachable one (~100 of 104
 * from any three picks, and ~370 once the round-2 vocabulary lands) — the page's cost becomes a
 * function of page size rather than of vocabulary size, which is the property the whole
 * "vocabulary grows to fit the corpus" principle needs from the feed.
 */
export function planTopics(opts: {
  weights: Map<string, number>;
  graph: TopicGraph;
  knobs: FeedKnobs;
  rng: () => number;
  coreTopicIds?: ReadonlySet<string>;
  horizon?: number;
}): Set<string> {
  const {
    weights,
    graph,
    knobs,
    rng,
    coreTopicIds = CORE_TOPIC_IDS,
    horizon = knobs.pageSize * PLAN_HORIZON_PAGES,
  } = opts;
  const planned = new Set<string>();
  const topicCounts = new Map<string, number>();
  for (let i = 0; i < horizon; i++) {
    const slot = pickSlot(weights, graph, knobs, rng, coreTopicIds);
    if (!slot || slot.tier === "WILD" || !slot.pick) continue;
    const { topicId } = slot.pick;
    if ((topicCounts.get(topicId) ?? 0) >= knobs.topicCap) continue;
    topicCounts.set(topicId, (topicCounts.get(topicId) ?? 0) + 1);
    planned.add(topicId);
  }
  return planned;
}

const EMPTY_SOURCES: ReadonlySet<string> = new Set();
const EMPTY_IDS: ReadonlySet<string> = new Set();

// ── item pick (SPEC §9.2) ───────────────────────────────────────────────────────────────────────
/**
 * WHAT to show, given WHERE to look: weighted random inside the topic's already-fetched pool,
 * using `drawWeight` (db/items.ts — the same taste formula `drawFromTopic` uses, shared rather
 * than reimplemented). Source-adjacency is a soft constraint exactly like the prototype's: filter
 * out the last-shown source, but only keep that filter if it doesn't empty the pool.
 */
function pickItem(
  pool: PoolItem[] | undefined,
  lastSource: string | null,
  knobs: Pick<FeedKnobs, "scoreFloor" | "scorePower" | "tagBoost">,
  tasteKeywords: string[],
  rng: () => number,
  /** Sources that have already hit `sourceCap` on this page. A HARD filter, unlike `lastSource`:
   *  if nothing else is left in the pool the slot is skipped, never relaxed — that is the cap
   *  doing its job. Filtering here rather than rejecting after the draw is what lets a topic's
   *  minority sources win the slot once the majority is capped. */
  cappedSources: ReadonlySet<string> = EMPTY_SOURCES,
  /** Items already drawn on this page. Since the pools come from membership (09-11-26) one item
   *  can sit in up to three of them, and `composePage` only splices a draw out of the pool it
   *  drew from. Hard filter, like the cap. Applied to the WILD pool too, though an un-homed row
   *  has no membership and cannot overlap — a rule with one exception is a bug waiting. */
  drawnIds: ReadonlySet<string> = EMPTY_IDS,
): PoolItem | null {
  if (!pool || pool.length === 0) return null;

  let candidates = pool;
  if (drawnIds.size > 0) {
    candidates = candidates.filter((it) => !drawnIds.has(it.id));
    if (candidates.length === 0) return null;
  }
  if (cappedSources.size > 0) {
    candidates = candidates.filter((it) => !cappedSources.has(it.source));
    if (candidates.length === 0) return null;
  }
  if (lastSource) {
    // From `candidates`, not `pool` — the cap filter above must survive this one. (It didn't, for
    // about ten minutes on 09-07-26; the live probe caught what a single-draw unit test missed.)
    const varied = candidates.filter((it) => it.source !== lastSource);
    if (varied.length > 0) candidates = varied; // relax rather than starve
  }

  const tasteSet = new Set(tasteKeywords.map((k) => k.toLowerCase()));
  const entries: [PoolItem, number][] = candidates.map((it) => {
    const sharedTags = it.aestheticTags.filter((t) =>
      tasteSet.has(t.toLowerCase()),
    ).length;
    const weight = drawWeight(
      it.curationScore,
      knobs.scoreFloor,
      knobs.scorePower,
      sharedTags,
      knobs.tagBoost,
    );
    return [it, weight];
  });

  return weightedPick(entries, rng);
}

// ── page composition (SPEC §9.3) ────────────────────────────────────────────────────────────────
export interface ComposePageOpts {
  weights: Map<string, number>;
  graph: TopicGraph;
  // Each topic's pool of eligible (unseen, above the score floor) items, pre-fetched in one batch
  // by getFeedPage before calling this function — see the "slot plan first, pools second" note on
  // getFeedPage below for why this is a Map handed in, not a per-slot DB call the way the
  // prototype's interleaved loop did it.
  pools: Map<string, PoolItem[]>;
  /** The WILD tier's draw: a sample of eligible un-homed items (db/feed.ts's `getWildPool`).
   *  Empty or absent ⇒ the slot is skipped and the guard loop fills it from another tier, so a
   *  corpus with nothing un-homed composes exactly as it did before this tier existed. */
  wildPool?: PoolItem[];
  rng: () => number;
  /**
   * The stream the ITEM draws use (09-11-26). `rng` is then the topic stream only — tiers and
   * topics — which is what makes a page's topic sequence a pure function of weights, graph,
   * knobs and `rng`, and what lets `planTopics` know a page's topics before any pool is
   * fetched. Defaults to `rng`, in which case this function is byte-for-byte the single-stream
   * engine it was before, and every test written against that keeps its meaning.
   */
  itemRng?: () => number;
  knobs: FeedKnobs;
  tasteKeywords?: string[];
  // Whether to attach `debug.why`/`debug.curationScore` to each card. Kept as a plain boolean
  // argument (not an env read) so this function stays pure and DB/env-free — getFeedPage is the
  // one place that decides this from FEED_DEBUG.
  debug?: boolean;
  /** Which topics count as core for the `grownHopPenalty` lever. Injected (like everything
   *  else here) so tests can use a toy graph; getFeedPage passes nothing and gets the sixteen. */
  coreTopicIds?: ReadonlySet<string>;
}

/**
 * One page of the feed: tier → topic → item, under the diversity constraints, ported near-
 * verbatim from phase0/feed.template.html's `composePage` (lines 326-346). Constraints are soft
 * throughout (SPEC §9.3): a slot that can't be filled — topic cap reached, empty pool, no
 * bridge — is simply skipped and the guard loop tries again, up to `pageSize * 40` attempts, then
 * returns whatever was composed. This can legitimately return fewer than `pageSize` cards (a
 * near-exhausted corpus) or, in the limit, zero (full exhaustion — getFeedPage's job to turn that
 * into "no next page," not this function's).
 */
export function composePage(opts: ComposePageOpts): ComposedCard[] {
  const {
    weights,
    graph,
    pools,
    wildPool = [],
    rng,
    itemRng = rng,
    knobs,
    tasteKeywords = [],
    debug = false,
    coreTopicIds = CORE_TOPIC_IDS,
  } = opts;

  // Working copies of each topic's pool: an item drawn this page is spliced out immediately, so
  // it can never be drawn again on the same page (the in-page exclusion half of SPEC §9.4's "seen"
  // tracking — seen_item covers everything *before* this page, this covers *within* it — together
  // with `drawnIds` below, since 09-11-26, because an item can be in several pools).
  const working = new Map<string, PoolItem[]>();
  for (const [topicId, items] of pools) working.set(topicId, [...items]);
  // The wild pool gets the same treatment, as one flat list: a wild item drawn this page is
  // spliced out so it cannot be drawn twice.
  const workingWild = [...wildPool];

  const cards: ComposedCard[] = [];
  const topicCounts = new Map<string, number>();
  // Per-source count across EVERY tier, and the set of sources that have reached `sourceCap`.
  // Kept as a set (rebuilt on each cap hit, which is at most a few times a page) so `pickItem`
  // can filter by membership without knowing the knob.
  const sourceCounts = new Map<string, number>();
  const cappedSources = new Set<string>();
  // Every id drawn on this page, across all pools. The pools come from membership now, so one
  // item can be in three of them; splicing it out of the pool it was drawn from is not enough.
  const drawnIds = new Set<string>();
  let lastSource: string | null = null;
  const countSource = (source: string) => {
    const n = (sourceCounts.get(source) ?? 0) + 1;
    sourceCounts.set(source, n);
    if (n >= knobs.sourceCap) cappedSources.add(source);
  };

  for (
    let guard = 0;
    cards.length < knobs.pageSize && guard < knobs.pageSize * 40;
    guard++
  ) {
    // The tier draw and the topic pick, from the TOPIC stream — see `pickSlot` for why they are
    // one function now. Everything after this line that draws uses `itemRng`.
    const slot = pickSlot(weights, graph, knobs, rng, coreTopicIds);
    if (!slot) continue; // all tier weights <= 0 — degenerate knobs; guard bounds the retry
    const tierName = slot.tier;

    // WILD short-circuits the topic step entirely: there is no topic to pick, no graph to walk,
    // no driftPath to record, and topicCap — which bounds how much of a page one TOPIC may be —
    // has nothing to count. Its only personalization is the taste boost, turned up to
    // wildTagBoost because in this slot it is the sole signal (knobs, D1).
    if (tierName === "WILD") {
      const drawn = pickItem(
        workingWild,
        lastSource,
        { ...knobs, tagBoost: knobs.wildTagBoost },
        tasteKeywords,
        itemRng,
        cappedSources,
        drawnIds,
      );
      if (!drawn) continue; // nothing un-homed left to show — soft, like every other constraint
      workingWild.splice(
        workingWild.findIndex((it) => it.id === drawn.id),
        1,
      );
      drawnIds.add(drawn.id);
      lastSource = drawn.source;
      countSource(drawn.source);
      cards.push({
        item: drawn,
        tier: "WILD",
        topicId: null,
        ...(debug
          ? {
              debug: {
                why: `WILD · un-homed (${workingWild.length} left in sample)`,
                curationScore: drawn.curationScore,
              },
            }
          : {}),
      });
      continue;
    }

    const pick = slot.pick;
    if (!pick) continue; // no topics to draw from at all (e.g. an empty weights map)

    const { topicId, why, driftPath } = pick;
    if ((topicCounts.get(topicId) ?? 0) >= knobs.topicCap) continue;

    const drawn = pickItem(
      working.get(topicId),
      lastSource,
      knobs,
      tasteKeywords,
      itemRng,
      cappedSources,
      drawnIds,
    );
    if (!drawn) continue; // this topic's pool is empty/exhausted — soft constraint, try again

    const remaining = working.get(topicId)!.filter((it) => it.id !== drawn.id);
    working.set(topicId, remaining);
    drawnIds.add(drawn.id);

    topicCounts.set(topicId, (topicCounts.get(topicId) ?? 0) + 1);
    lastSource = drawn.source;
    countSource(drawn.source);

    cards.push({
      item: drawn,
      tier: tierName,
      topicId,
      ...(driftPath ? { driftPath } : {}),
      ...(debug ? { debug: { why, curationScore: drawn.curationScore } } : {}),
    });
  }

  return cards;
}

// ── orchestration (the part that isn't in the prototype) ───────────────────────────────────────
/**
 * Every topic id `composePage`'s guard loop could possibly land on — the fallback fetch's set
 * since 09-11-26, and every page's set before that. Computed purely/in-memory (no DB) so
 * `getFeedPage` can fetch every relevant pool in exactly one `getTopicPools` call
 * rather than one per slot the way the prototype's interleaved loop implicitly did (it read
 * straight from an in-memory `items` object; the server has to go to Postgres instead). CORE only
 * ever draws from `weights`' own keys; DRIFT can walk up to two hops out from a weighted topic;
 * JUMP draws from a weighted topic's own row (one hop). Two hops out from every weighted topic is
 * therefore a safe superset of everywhere any tier could land.
 *
 * This changes nothing statistically about which topic gets *chosen* — that's still entirely
 * `composePage`'s rng-driven decision. It only decides which pools are worth fetching up front.
 * If `composePage` somehow lands on a topic outside this set anyway (a same-run topic-graph edit,
 * a malformed fixture), it just sees an empty/missing pool for that slot and treats it as the
 * existing soft "pool empty, retry" case — never a crash.
 */
function reachableTopics(
  weights: Map<string, number>,
  graph: TopicGraph,
): Set<string> {
  const neighborsOf = (t: string) => (graph[t] ?? []).map((n) => n.topic);

  const reachable = new Set(weights.keys());
  const hop1 = new Set<string>();
  for (const t of reachable) for (const n of neighborsOf(t)) hop1.add(n);
  for (const t of hop1) reachable.add(t);

  const hop2 = new Set<string>();
  for (const t of hop1) for (const n of neighborsOf(t)) hop2.add(n);
  for (const t of hop2) reachable.add(t);

  return reachable;
}

/**
 * The real, DB-backed entry point (SPEC §7, §9). Orchestrates around the pure engine above:
 *
 * 1. Decode the cursor (absent → a fresh page 0: random seed, `anchor: now`, empty `prev`).
 *    Two random streams from that seed: a topic stream, `mulberry32(hashSeed(\`${seed}:${page}\`))`,
 *    for tiers and topics, and an item stream (the same key plus `:items`) for item draws — see
 *    `planTopics` for why there are two. Every draw on this page uses one of them and nothing
 *    else, which is what makes "same cursor + same pools → identical page" hold (SPEC §7).
 * 2. Load the user's topic weights (cold start → `coldStartWeights()`). Knob overrides from the
 *    caller are only honored when FEED_DEBUG is on — SPEC §9's "dev affordances... behind a dev
 *    flag."
 * 3. Plan first, pools second (09-11-26): `planTopics` replays the compose's topic sequence to
 *    learn which pools the page needs, `getTopicPools` fetches exactly those in one call, and
 *    `composePage` runs the tier/topic/item guard loop over them. Only a short page falls back
 *    to the `reachableTopics` superset every page used to fetch.
 * 4. Capture `servedAt` as the next cursor's `anchor` — purely the page-boundary instant now.
 *    This function deliberately does NOT mark anything seen: as of 5.7 the client acks the page it
 *    actually received (`feed.markSeen`), because a server render whose output is discarded — a
 *    prefetch, a back-pop that re-runs the dynamic `/feed` — used to spend corpus nobody ever saw.
 *    See the cursor design note above for why the anchor arithmetic survives the move.
 *    `nextCursor` is constant-size by construction: `prev` is exactly this page's item ids, never
 *    the user's whole history.
 * 5. Zero cards composed → exhaustion: `{ cards: [], nextCursor: undefined }`. The "you've seen
 *    everything" banner is Phase 5's concern, not this function's.
 */
export async function getFeedPage(
  userId: string,
  cursor?: string,
  knobOverrides?: Partial<FeedKnobs>,
): Promise<FeedPage> {
  const decoded = cursor ? decodeCursor(cursor) : null;

  const seed = decoded?.seed ?? Math.floor(Math.random() * 0xffffffff) >>> 0;
  const page = decoded?.page ?? 0;
  const anchor = decoded ? new Date(decoded.anchor) : new Date();
  const prev = decoded?.prev ?? [];

  // Two streams from one seed (09-11-26): the topic stream drives tiers and topics, the item
  // stream drives item draws. Fresh instances each time they are handed out — `planTopics` and
  // `composePage` must each start from the stream's beginning, and so must a fallback compose.
  // (A factory rather than a value because a `mulberry32` stream is stateful: every call to it
  // advances it, so one instance shared by the plan and the compose would hand the compose the
  // plan's leftovers.)
  const topicStream = () => mulberry32(hashSeed(`${seed}:${page}`));
  const itemStream = () => mulberry32(hashSeed(`${seed}:${page}:items`));

  // The dev gate, shared with the gallery rail, the forget mutation and the /dev/feed route —
  // see feed-debug.ts for the rule and for why it is a dynamic import underneath.
  const debugEnabled = await feedDebugEnabled();

  // Two independent single-user reads — weights for the topic draws, taste keywords for the
  // item-draw boost (Phase 6.1) — fetched in parallel since neither depends on the other.
  const [rawWeights, tasteKeywords] = await Promise.all([
    getUserTopicWeights(userId),
    getTasteKeywords(userId),
  ]);
  const weights = rawWeights.size > 0 ? rawWeights : coldStartWeights();

  const knobs: FeedKnobs = {
    ...DEFAULT_KNOBS,
    ...(debugEnabled ? knobOverrides : undefined),
  };

  // The grownEdgeScale lever: a per-request copy of the graph, never a mutation of TOPIC_GRAPH.
  // Identity at 1 (the default) returns the shared object, so /feed pays nothing for this line.
  const graph = scaleGrownEdges(
    TOPIC_GRAPH,
    CORE_TOPIC_IDS,
    knobs.grownEdgeScale,
  );

  const eligibility = {
    userId,
    anchor,
    scoreFloor: knobs.scoreFloor,
    excludeIds: prev,
  };
  // One key for both pools: the cursor's own `${seed}:${page}`, which is what makes both samples
  // reproduce byte-for-byte on a refetch (db/feed.ts). At `tierWild: 0` the WILD tier can never
  // be drawn, so its query is skipped entirely.
  const sampleKey = `${seed}:${page}`;
  const wildPool =
    knobs.tierWild > 0 ? await getWildPool({ ...eligibility, sampleKey }) : [];

  const compose = async (topicIds: string[]) => {
    const pools = await getTopicPools(topicIds, { ...eligibility, sampleKey });
    return composePage({
      weights,
      graph,
      pools,
      wildPool,
      rng: topicStream(),
      itemRng: itemStream(),
      knobs,
      tasteKeywords,
      debug: debugEnabled,
    });
  };

  // **Plan, then fetch, then compose** (docs/DESIGN_feed-on-membership.md §4.3). The plan replays
  // the compose's own topic sequence without pools, so the page fetches the ~40 topics it will
  // draw from rather than every topic it *could* reach (~100 of 104 from three picks). Pools come
  // from membership now, which made the every-reachable fetch ~2.8× dearer overnight and would
  // make it grow with every promoted topic; this makes the page's cost a function of page size.
  const planned = [
    ...planTopics({ weights, graph, knobs, rng: topicStream() }),
  ];
  let composed = await compose(planned);
  let fallback = false;
  // A short page means the compose ran past the plan's horizon into pools it never fetched — a
  // reader whose picks are all tiny topics, a near-exhausted corpus, CI's empty database. Fetch
  // the superset every page used to fetch and compose again from the streams' beginning; same
  // seed, so the fallback page is as deterministic as the fast one. A healthy reader never
  // takes this path; `bench:feed` counts how often it fires.
  if (composed.length < knobs.pageSize) {
    fallback = true;
    composed = await compose([...reachableTopics(weights, graph)]);
  }

  if (composed.length === 0) {
    return { cards: [], nextCursor: undefined };
  }

  // The page-boundary instant, and nothing else — no `seen_item` write happens here. The client
  // acks what it received (`feed.markSeen`); see the FeedCursor design note above for why an
  // anchor that now *precedes* the page's own seen rows still excludes the right things.
  const servedAt = new Date();
  const itemIds = composed.map((c) => c.item.id);

  // **Hydrate the winners** (Phase 7.3). `composePage` worked from the five-column `PoolItem`
  // projection; the client needs whole rows, and this is the one query that fetches them — twelve,
  // by id, instead of the ten thousand full rows the pools used to carry.
  //
  // An id missing from the map means the item was deleted between the pool query and this one
  // (the e2e suite's own teardown is the only thing on this machine that does that). Drop the
  // card rather than throw: a page one card short is a far better outcome for a reader than a
  // failed request, and `prev`/`nextCursor` above still cover the ids that *were* drawn, so the
  // next page excludes them either way.
  const hydrated = await getItemsByIds(itemIds);
  const cards: FeedCard[] = composed.flatMap((card) => {
    const full = hydrated.get(card.item.id);
    return full ? [{ ...card, item: full }] : [];
  });

  const nextCursor = encodeCursor({
    v: 1,
    seed,
    page: page + 1,
    anchor: servedAt.toISOString(),
    prev: itemIds,
  });

  return {
    cards,
    nextCursor,
    ...(debugEnabled
      ? { debug: { plannedTopics: planned.length, fallback } }
      : {}),
  };
}
