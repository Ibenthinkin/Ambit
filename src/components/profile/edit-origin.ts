"use client";

// Did this tab arrive at `/profile/edit` *from inside the app*?
//
// The third of 5.10's three markers, structurally identical to its two siblings — see
// `components/feed/feed-origin.ts` for why these exist at all and `profile-origin.ts` for the note
// on when six near-identical files should become one helper.
//
// Edit's version: both its exits (the header's back chevron and the form's Discard link) mean
// "leave without saving", and its *save* path leaves the same way. Two writers, both on surfaces
// that already have the profile loaded: Profile's "Edit profile" pill and Settings' account rows.
// The cold-open fallback is `/profile` — the screen this one edits.

const KEY = "ambit.profileEditOrigin.v1";

/**
 * Record that this tab is navigating from an in-app surface to `/profile/edit`. Call it immediately
 * before the navigation.
 */
export function markProfileEditOrigin(): void {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    // Safari in Lockdown/private mode throws on any storage access — see saved-origin.ts.
  }
}

/** Whether `/profile/edit` was reached from inside the app in this tab. */
export function cameToEditFromApp(): boolean {
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
