// The reveal's explore line (docs/DESIGN_redesign.md §5.3 item 8): "About one post in _n_ comes
// from outside this mix…". The number is the feed's own, never a literal — the share of a page's
// slots drawn from somewhere the reader did not pick, which is the JUMP tier (a cross-domain
// jump away from the picks) plus the WILD tier (un-homed items no topic holds), out of every
// tier's weight (services/feed-knobs.ts; SPEC §9). CORE draws from the picks themselves and DRIFT
// walks the graph *from* them, so neither counts as outside.
//
// Pure. `FeedKnobs` comes from the no-import leaf, so the client can call this with
// DEFAULT_KNOBS without bundling the feed engine. Retune the tiers and the sentence follows.
import type { FeedKnobs } from "~/server/services/feed-knobs";

type TierKnobs = Pick<
  FeedKnobs,
  "tierCore" | "tierDrift" | "tierJump" | "tierWild"
>;

/** The fraction of a page's tier draws that land outside the reader's mix, 0…1. */
export function exploreShare(knobs: TierKnobs): number {
  const outside = knobs.tierJump + knobs.tierWild;
  const all = knobs.tierCore + knobs.tierDrift + outside;
  return all > 0 ? outside / all : 0;
}

/**
 * The share as "one in _n_", rounded — what the sentence prints. Null when nothing is drawn
 * from outside (or everything is), where "one in _n_" would be a lie either way.
 */
export function exploreOneIn(knobs: TierKnobs): number | null {
  const share = exploreShare(knobs);
  if (share <= 0 || share >= 1) return null;
  return Math.max(2, Math.round(1 / share));
}
