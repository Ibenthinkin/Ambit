import * as React from "react";

import type { FeedCard } from "~/server/services/feed";

// SPEC §9's standing "debug overlay + tuning knobs ship behind a dev flag throughout development"
// requirement, in its cheapest possible form: the tier that produced this card, in the corner of
// the tile, with the engine's own `why` string on hover.
//
// No flag check is needed here — `card.debug` is only ever populated when the *server* has
// FEED_DEBUG on (or is in dev), so its mere presence is the flag. In production the field is
// absent and this renders nothing.
export function DebugBadge({ card }: { card: FeedCard }) {
  if (!card.debug) return null;
  return (
    <span
      title={card.debug.why}
      className="bg-scrim/60 text-ink/70 absolute top-0 left-0 px-1 text-[10px]"
    >
      {card.tier}
    </span>
  );
}
