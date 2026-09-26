"use client";

// Did this item page get opened *from the feed*, in this tab?
//
// The question exists because the two ways of leaving an item page are not interchangeable:
//
//   - **Popping history** returns to the feed that is already there — same tiles, same scroll,
//     nothing refetched. It is what a reader means by "back".
//   - **Pushing `/feed?focus={id}`** builds a *new* feed. `/feed` is dynamic, so the navigation
//     re-runs the server component, and `getFeedPage` never repeats items: the reader lands on a
//     wall of cards they have never seen, the focused tile genuinely isn't there, and a page of
//     their corpus is spent — twice, because the RSC render and the client query each draw one
//     (measured 08-20-26: every back-tap cost 24 items).
//
// Popping is right whenever there is something to pop back to, and wrong otherwise: `/i/[itemId]`
// is the app's one public page (SPEC §8.1), so it is routinely opened cold from a shared link,
// where "back" would leave Ambit altogether. Hence a marker rather than an unconditional
// `router.back()` — the feed writes it on the way out, and the item page reads it to tell the two
// arrivals apart.
//
// `sessionStorage` and not a module variable, because a full document load between the two screens
// (the PWA resuming, a reload on the item page) wipes module state but is still the same tab, with
// the same history stack, and the pop is still correct.

const KEY = "ambit.feedOrigin.v1";

/**
 * Record that the feed is sending the reader to `itemId`, so that item's page knows a pop returns
 * here. Call it immediately before the navigation.
 */
export function markFeedOrigin(itemId: string): void {
  try {
    sessionStorage.setItem(KEY, itemId);
  } catch {
    // Safari in Lockdown/private mode throws on any storage access. The cost of losing the marker
    // is one pushed navigation instead of a pop — degraded, not broken — and a back link that
    // throws is worse than one that navigates.
  }
}

/**
 * Whether `itemId` was reached from the feed in this tab, i.e. whether history has a feed entry to
 * pop back to.
 */
export function cameFromFeed(itemId: string): boolean {
  try {
    return sessionStorage.getItem(KEY) === itemId;
  } catch {
    return false;
  }
}

// ── `/explore` (09-26-26, docs/PLAN_explore-route.md) ─────────────────────────────────────────────
// A second, coarser marker: not "which item did the feed open" but "this tab's visit began on the
// signed-out explore feed". The item page reads it for two things a stranger from `/explore` needs
// and a stranger from a shared link does not — the capped rail that ends on the taste's end card,
// and a way back to `/explore` rather than to `/feed`, which would only bounce them to the landing.
// Per tab, like the marker above; `/feed` clears it, so a reader who signed in mid-taste is a
// reader again.

const EXPLORE_KEY = "ambit.exploreOrigin.v1";

/** Record that the reader is leaving `/explore` for an item page. */
export function markExploreOrigin(): void {
  try {
    sessionStorage.setItem(EXPLORE_KEY, "1");
  } catch {
    // Private mode: the item page treats the visitor as a cold one — endless rail, the landing's
    // join card. Degraded, not broken.
  }
}

/** `/feed` opening an item: whatever this tab was doing before, it is a signed-in reader now. */
export function clearExploreOrigin(): void {
  try {
    sessionStorage.removeItem(EXPLORE_KEY);
  } catch {
    // nothing to clear
  }
}

/** Whether this tab's visit came through `/explore`. Read in effects and handlers, never render. */
export function cameFromExplore(): boolean {
  try {
    return sessionStorage.getItem(EXPLORE_KEY) === "1";
  } catch {
    return false;
  }
}
