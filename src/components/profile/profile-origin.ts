"use client";

// Did this tab arrive at `/profile` *from inside the app*?
//
// The fourth origin marker, and a deliberate structural copy of `components/saved/saved-origin.ts`
// rather than a shared abstraction — read `components/feed/feed-origin.ts` for the full account of
// why a marker exists at all, and `gallery-origin.ts` for why small files that point at each other
// beat one factory. (5.10's own note: this makes six such files, which is where an `origin(key)`
// helper starts to look defensible. A seventh should force the question.)
//
// Profile's version: its pill's Feed button means "leave". Popping returns to the feed already
// sitting in history — same tiles, same scroll, nothing drawn. Pushing `/feed` re-runs the dynamic
// route and spends two pages of the reader's corpus per trip. But `/profile` is reachable cold (a
// bookmark, a reload, the PWA resuming there), where an unconditional `router.back()` would exit
// Ambit altogether. So the writers — `PillToolbar`'s default Profile button and
// `CollectionsSheet`'s "New collection" row — mark the way in, and `leaveProfile` reads it.
//
// Like Saved's, the value is a bare flag: `/profile` is one page, with no item id to carry.
// `sessionStorage` rather than module state because a full document load between the two screens
// wipes module state but is still the same tab, with the same history stack.

const KEY = "ambit.profileOrigin.v1";

/**
 * Record that this tab is navigating from an in-app surface to `/profile`, so its exits know a pop
 * returns into the app. Call it immediately before the navigation.
 */
export function markProfileOrigin(): void {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    // Safari in Lockdown/private mode throws on any storage access. The cost of losing the marker
    // is one pushed navigation instead of a pop — degraded, not broken — and an exit that throws
    // is worse than one that navigates.
  }
}

/**
 * Whether `/profile` was reached from inside the app in this tab, i.e. whether history has an app
 * entry to pop back to.
 */
export function cameToProfileFromApp(): boolean {
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
