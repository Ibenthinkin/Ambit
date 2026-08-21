"use client";

// Did this gallery get opened *from inside the app*, in this tab?
//
// A deliberate parallel of `components/feed/feed-origin.ts` rather than a shared abstraction. That
// file is shipped, measured, and load-bearing for the feed's corpus arithmetic; folding the two
// into one factory would put the gallery's much younger requirements on top of it for the sake of
// saving fifteen lines. Two small files that point at each other is the cheaper trade — read
// `feed-origin.ts` for the full account of *why* an origin marker exists at all, because every word
// of it applies here too.
//
// The gallery's own version of the question: `/g/[itemId]` is public and deep-linkable (SPEC §8.1),
// so it is routinely opened cold from a shared link — and there, a hard-swipe-up "close" would exit
// Ambit altogether rather than returning the reader to the picture's page. So the entry surface
// writes this marker on the way in, and the gallery reads it to tell the two arrivals apart:
//
//   - **Marked** — the entry surface is one step down the history stack. Pop to it.
//   - **Unmarked** — nothing behind this page. Push `/i/{entryId}` instead, which is where the
//     reader was always headed; they just arrive by a different door.
//
// Today the entry surface is the item page's hero (5.8); in 5.9 it will also be Saved. The marker
// stores the entry *item id*, not the route, so the pop stays entry-agnostic and neither caller has
// to say where it came from.
//
// `sessionStorage` rather than module state, for the same reason as `feed-origin`: a full document
// load between the two screens (the PWA resuming, a reload) wipes module state but is still the
// same tab with the same history stack, and the pop is still correct.

const KEY = "ambit.galleryOrigin.v1";

/**
 * Record that this tab is sending the reader from an in-app surface into `/g/{itemId}`. Call it
 * immediately before the navigation.
 */
export function markGalleryOrigin(itemId: string): void {
  try {
    sessionStorage.setItem(KEY, itemId);
  } catch {
    // Safari in Lockdown/private mode throws on any storage access. The cost of losing the marker
    // is one pushed navigation instead of a pop — degraded, not broken — and an exit that throws is
    // worse than one that navigates.
  }
}

/**
 * Whether `/g/{itemId}` was reached from inside the app in this tab, i.e. whether history has an
 * entry to pop back to.
 */
export function cameFromApp(itemId: string): boolean {
  try {
    return sessionStorage.getItem(KEY) === itemId;
  } catch {
    return false;
  }
}
