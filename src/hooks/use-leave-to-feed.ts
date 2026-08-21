"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { cameFromFeed } from "~/components/feed/feed-origin";

// **The** way off an item page, shared by every control that leaves one: the pill's Feed button
// and the swipe-back gesture both call this, so the two can't drift apart.
//
// The rule it encodes was measured, not assumed (`components/feed/feed-origin.ts` has the full
// account). Two arrivals want opposite things:
//
//   - **Tapped a tile.** The feed is one entry down the history stack, intact. Pop to it and the
//     reader gets the same tiles at the same scroll offset, with nothing refetched.
//   - **Opened a shared link cold.** There is no feed behind this page — `/i/[itemId]` is public
//     (SPEC §8.1) — so a pop would leave Ambit entirely. The reader needs a feed *built*, and
//     `?focus=` is how the new one puts this item under their eye.
//
// Getting it wrong is expensive rather than merely untidy: `/feed` is dynamic, so a pushed
// navigation re-runs the server component and draws a fresh page of cards — 24 items of the
// reader's corpus per back-tap, measured 08-20-26.

/**
 * Returns a `leave()` that pops back to the feed when this visit came from it, and otherwise
 * pushes `/feed?focus={itemId}` to build one.
 */
export function useLeaveToFeed(itemId: string): () => void {
  const router = useRouter();

  return React.useCallback(() => {
    // Read at call time, never at render: the server has no `sessionStorage`, so deciding this
    // during render would either be a hydration mismatch or an unconditional cold-open branch.
    if (cameFromFeed(itemId)) {
      router.back();
      return;
    }
    router.push(`/feed?focus=${itemId}`);
  }, [itemId, router]);
}
