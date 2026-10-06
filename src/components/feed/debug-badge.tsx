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
// Its look is the design's tag (docs/tile-hover/ambit-tile.css `.ambit-tile__tag`), set in 1b's
// mono (Task 2.9): 10 px Geist Mono, 0.4 px tracking, ink on the screen background at 72%,
// 3/6/3/5 padding. On the wrapper's hover or keyboard focus it fills with **ink** (dark text) over
// 200 ms — it used to fill green, but a filled tag is not one of the accent's seven jobs
// (DESIGN §3.2), and white text on green never happens. `group-hover/tile` is the same group
// the hover strip keys on (feed-grid.tsx), and `group-has-[:focus-visible]/tile` is the keyboard
// half of the Lift (tile-lift.ts). The fill snaps under Reduce Motion: only the wrapper itself is
// exempt from the collapse, by design.
export function DebugBadge({ card }: { card: FeedCard }) {
  if (!card.debug) return null;
  return (
    <span
      title={card.debug.why}
      className="bg-bg/72 text-ink group-hover/tile:bg-ink group-hover/tile:text-on-accent group-has-[:focus-visible]/tile:bg-ink group-has-[:focus-visible]/tile:text-on-accent absolute top-0 left-0 py-[3px] pr-[6px] pl-[5px] font-mono text-[10px] leading-[1.3] tracking-[0.4px] transition-colors duration-200"
    >
      {card.tier}
    </span>
  );
}
