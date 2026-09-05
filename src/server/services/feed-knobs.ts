// The feed's tuning knobs — the interface and the shipped defaults — in a module with **no
// imports**, so a client component can read `DEFAULT_KNOBS` without dragging the rest of
// services/feed.ts (and, through db/items.ts, the Postgres client) into the browser bundle. The
// dev knob panel (plan 09-05-26) is that client: its sliders start from these values and its
// copy-as-JSON reports the diff against them. `services/feed.ts` re-exports both names, so every
// server-side import site reads exactly as it did before this file existed.

// ── knobs (SPEC §9, prototype defaults at phase0/feed.template.html:219-224) ───────────────────
export interface FeedKnobs {
  tierCore: number;
  tierDrift: number;
  tierJump: number;
  scoreFloor: number;
  scorePower: number;
  tagBoost: number;
  temp: number;
  hop2: number;
  topicCap: number;
  pageSize: number;
  // ── Cut 2a's feel levers (09-05-26) ──────────────────────────────────────────────────────────
  // The vocabulary went 16 → 99 topics and a sampled page came back 59 grown / 37 core. These
  // two knobs exist so that ratio can be *tuned* rather than argued about. Both are identities
  // at 1, which is the shipped default until the dev knob panel says otherwise.
  /** Multiplier on every graph edge that touches a grown topic, applied to a per-request copy
   *  of the graph before DRIFT and JUMP walk it. <1 keeps drift closer to the sixteen tuned
   *  rows; >1 leans into the mined vocabulary. Core×core cells never move. */
  grownEdgeScale: number;
  /** Multiplier on a DRIFT hop's softmax weight when the landing topic is grown. 0 = drift
   *  stays inside the core sixteen; 1 = no penalty. JUMP is not affected. */
  grownHopPenalty: number;
}

// Drift-heavy on purpose — Ben's Phase 0.5 verdict was "what I enjoy the most is the higher
// further drift," so DRIFT+JUMP outweigh CORE and second hops are a coin flip. These are the
// shipped defaults per SPEC §9.
export const DEFAULT_KNOBS: FeedKnobs = {
  tierCore: 40,
  tierDrift: 35,
  tierJump: 25,
  scoreFloor: 4,
  scorePower: 1.5,
  tagBoost: 0.5,
  temp: 0.15,
  hop2: 0.5,
  topicCap: 3,
  pageSize: 12,
  grownEdgeScale: 1,
  grownHopPenalty: 1,
};
