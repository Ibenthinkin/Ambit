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
  // ── WILD (09-06-26, docs/PLAN_caption-less-and-wild.md T2) ───────────────────────────────────
  // A fourth tier, drawing from the UN-HOMED pool: curated items no topic fits. Cut 1 made the
  // corpus store them and Cut 2a promoted 2,714 of them into grown topics, but between promotion
  // rounds whatever walked last is invisible to the feed entirely — and a picture blog with no
  // tags has no route out of un-homed by any current tooling. This tier is the residue's way in.
  //
  // **It is NOT the gallery rail's "wildcard"** (gallery-rail.ts drawImageAnywhere), and the
  // names differ on purpose: that one is public, unpersonalized, ignores topics *and* the
  // un-homed distinction, and writes no seen_item rows. WILD is personalized through
  // wildTagBoost, draws only un-homed items, and burns seen rows like every other feed tier.
  /** Weight against tierCore/Drift/Jump — 10 against 40/35/25 is about one card in twelve. It
   *  ships at 10 rather than 0 because the point is that these pictures show up now; the slider
   *  on /dev/feed is for tuning the rate, not for switching the tier on. 0 skips the pool query
   *  entirely and composes exactly as before. */
  tierWild: number;
  /** `tagBoost` for the WILD slot only. 1.0 — double the ordinary 0.5 — because a WILD card has
   *  no topic, so overlap with the reader's recent saves' aesthetic tags is the ONLY
   *  personalization axis the slot has. This is D1: a save on a WILD card teaches the feed the
   *  item's vibe, through the existing last-24-saves taste window, with no new table. */
  wildTagBoost: number;
  scoreFloor: number;
  scorePower: number;
  tagBoost: number;
  temp: number;
  hop2: number;
  topicCap: number;
  /** Per-page cap on cards from one SOURCE, counted across every tier including WILD (09-07-26).
   *  topicCap's sibling, born from the first big Tumblr walk: `sovietpostcards` landed 17,500
   *  items and became 92-100% of four grown topics by membership as well as by display topic, so
   *  drifting into `illustration` meant twelve Soviet postcards in a row. No pool query can fix
   *  that — a 17,500-item blog about illustration *is* most of the corpus's illustration — but a
   *  page can refuse to be a wall of it. Enforced before the draw (`pickItem` filters a capped
   *  source out of its candidates), so a topic whose other sources are a 2% minority spends that
   *  minority instead of skipping the slot. 3 of 12 matches topicCap; the /dev/feed slider is
   *  where a different number gets argued. */
  sourceCap: number;
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
  // ── writing (09-30-26, docs/DESIGN_writing.md D3, docs/PLAN_writing.md Phase 3) ──────────────
  /** Share of each page that is writing (`type = 'article'`): `pageSize × share` slots, the
   *  fraction rounded up by a coin flip, at seeded positions that are never the first card and
   *  never adjacent. 0.125 is D3's "about one card in eight". **Above 0, the ordinary pools are
   *  pictures only** — an article reaches a page through a writing slot and no other way, which
   *  is what makes this number exact rather than a floor. 0 turns writing slots off and composes
   *  exactly as before them, articles back in the ordinary pools. */
  writingShare: number;
  /** `scoreFloor` for writing slots. Its own knob because the writing curator is a different
   *  rubric (Wikipedia averages ~7 under it against the pictures' ~8.5); it starts equal to
   *  `scoreFloor`. */
  writingScoreFloor: number;
  // ── "Less of this" (10-09-26, docs/DESIGN_more-or-less.md D3) ────────────────────────────────
  /** The exponent on a reader's per-topic cool (`user_topic_cool.cool`, in (0.15, 1]) wherever
   *  DRIFT or JUMP *lands* on a topic: a destination's chance is multiplied by
   *  `cool ** coolStrength`. Never where a walk starts (a cooled pick's own weight already fell),
   *  and CORE, WILD and writing never read it. 1 = the cool as written (one "less" → 0.6×, two
   *  → 0.36×); 2 = squared, harsher; **0 = ignore cools — today's feed exactly**, byte for byte
   *  for the same cursor, which is what the /dev/feed slider's left end is for. */
  coolStrength: number;
}

// Drift-heavy on purpose — Ben's Phase 0.5 verdict was "what I enjoy the most is the higher
// further drift," so DRIFT+JUMP outweigh CORE and second hops are a coin flip. These are the
// shipped defaults per SPEC §9.
export const DEFAULT_KNOBS: FeedKnobs = {
  tierCore: 40,
  tierDrift: 35,
  tierJump: 25,
  tierWild: 10,
  wildTagBoost: 1,
  scoreFloor: 4,
  scorePower: 1.5,
  tagBoost: 0.5,
  temp: 0.15,
  hop2: 0.5,
  topicCap: 3,
  sourceCap: 3,
  pageSize: 12,
  grownEdgeScale: 1,
  grownHopPenalty: 1,
  writingShare: 0.125,
  writingScoreFloor: 4,
  coolStrength: 1,
};
