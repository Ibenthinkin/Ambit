"use client";

// Did this tab arrive at `/settings` *from inside the app*?
//
// Structurally identical to `components/profile/profile-origin.ts`, which is itself a copy of
// `saved-origin.ts` — see `components/feed/feed-origin.ts` for the full account of why these
// markers exist, and `profile-origin.ts` for 5.10's note on when to stop copying them.
//
// Settings' version: its back arrow means "leave", and the screen is reached from Profile's gear,
// from Settings' own shortcut cards' siblings, and — for a reader who bookmarked it or reloaded —
// cold. A pop returns to whatever sent them; a push falls back to `/profile`, which is where the
// gear lives and therefore the least surprising landing.

const KEY = "ambit.settingsOrigin.v1";

/**
 * Record that this tab is navigating from an in-app surface to `/settings`. Call it immediately
 * before the navigation.
 */
export function markSettingsOrigin(): void {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    // Safari in Lockdown/private mode throws on any storage access — see saved-origin.ts.
  }
}

/** Whether `/settings` was reached from inside the app in this tab. */
export function cameToSettingsFromApp(): boolean {
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
