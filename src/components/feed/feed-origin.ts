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
