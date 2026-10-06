import * as React from "react";

import type { FeedCard } from "~/server/services/feed";

// SPEC §9's standing "debug overlay + tuning knobs ship behind a dev flag throughout development"
// requirement, in its cheapest possible form: the tier that produced this card, in the corner of
// the tile, with the engine's own `why` string on hover.
//
// No flag check is needed here — `card.debug` is only ever populated when the *server* has
// FEED_DEBUG on (or is in dev), so its mere presence is the flag. In production the field is
// absent and this renders nothing. **That is a decision, not an accident** (docs/PLAN_tile-hover.md
// Decision 1, 10-04-26): the Lift design draws this tag on every tile, and Ben kept it dev-only —
// production tiles stay the picture and nothing else.
//
// Its look is the design's tag, set in 1b's mono: 9.5 px Geist Mono, 0.4 px tracking, ink on
// `rgba(14,14,14,.78)`, 3/6/3/5 padding. It **hides while the tile is lifted** (DESIGN §6.1) —
// on the wrapper's hover, keyboard focus or open picker — rather than filling with accent.
// `group-hover/tile` is the same group the hover strip keys on (feed-grid.tsx), and
// `group-has-[:focus-visible]/tile` is the keyboard half of the Lift (tile-lift.ts). The fade
// snaps under Reduce Motion: only the wrapper itself is exempt from the collapse, by design.
export function DebugBadge({ card }: { card: FeedCard }) {
  if (!card.debug) return null;
  return (
    <span
      title={card.debug.why}
      className="text-ink absolute top-0 left-0 bg-[rgba(14,14,14,0.78)] py-[3px] pr-[6px] pl-[5px] font-mono text-[9.5px] leading-[1.3] tracking-[0.4px] transition-opacity duration-200 group-hover/tile:opacity-0 group-has-[:focus-visible]/tile:opacity-0 group-has-[[data-picker-open]]/tile:opacity-0"
    >
      {card.tier}
    </span>
  );
}
