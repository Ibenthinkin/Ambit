"use client";

// Did this tab arrive at `/saved` *from inside the app*?
//
// The third origin marker, and a deliberate parallel of `components/feed/feed-origin.ts` and
// `components/gallery/gallery-origin.ts` rather than a shared abstraction — read `feed-origin.ts`
// for the full account of why a marker exists at all, and `gallery-origin.ts` for why three small
// files that point at each other beat one factory.
//
// Saved's version of the question: its back-arrow and the pill's Feed button both mean "leave".
// Popping history returns to the feed that is already there — same tiles, same scroll, nothing
// drawn. Pushing `/feed` re-runs the dynamic route and builds a brand-new feed, which costs two
// pages of the reader's corpus per trip (measured 08-20-26, 24 items per tap) — the exact defect
// 5.6/5.7 fixed for item pages. But `/saved` is bookmarkable, so an unconditional `router.back()`
// on a cold open would exit the app altogether. Hence: `CollectionsSheet` writes this marker on
// the way in, and the screen's `leaveSaved` reads it to tell the two arrivals apart.
//
// Unlike the other two markers there is no item id to carry — `/saved` is one page, so the value
// is a bare flag. `sessionStorage` rather than module state for the same reason as its siblings: a
// full document load between the two screens (the PWA resuming, a reload on /saved) wipes module
// state but is still the same tab, with the same history stack, and the pop is still correct.

const KEY = "ambit.savedOrigin.v1";

/**
 * Record that this tab is navigating from an in-app surface to `/saved`, so its exits know a pop
 * returns into the app. Call it immediately before the navigation.
 */
export function markSavedOrigin(): void {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    // Safari in Lockdown/private mode throws on any storage access. The cost of losing the marker
    // is one pushed navigation instead of a pop — degraded, not broken — and an exit that throws
    // is worse than one that navigates.
  }
}

/**
 * Whether `/saved` was reached from inside the app in this tab, i.e. whether history has an app
 * entry to pop back to.
 */
export function cameToSavedFromApp(): boolean {
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
