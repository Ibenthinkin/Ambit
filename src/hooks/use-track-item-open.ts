"use client";

import * as React from "react";

import { useUsage } from "~/components/usage/usage-provider";
import { takeArrival } from "~/lib/item-arrival";

/**
 * Records `item.open` once per arrival on an item page (docs/DESIGN_usage.md). `from` comes from
 * the marker the previous screen left (`lib/item-arrival.ts`); a page opened cold reads as
 * `link` — including for a signed-out visitor on a shared link, whose event the server drops
 * (signed-out readers record only `visit.*` and `screen.open`). It is kept anyway: it costs
 * nothing and starts to count the day that rule changes.
 *
 * The ref is the StrictMode guard: in development React runs every effect, tears it down and runs
 * it again, so an unguarded effect would record two arrivals (and the first run would already
 * have consumed the marker). Refs survive that simulated remount; state does not need to.
 */
export function useTrackItemOpen(itemId: string): void {
  const { track } = useUsage();
  const opened = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (opened.current === itemId) return;
    opened.current = itemId;
    track("item.open", { itemId, meta: { from: takeArrival(itemId) } });
  }, [itemId, track]);
}
