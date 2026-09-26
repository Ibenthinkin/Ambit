"use client";

// Has `/explore`'s overture played in this document?
//
// The overture stands in for the loading screen, so it belongs to a *document load* — a typed
// URL, a reload, a fresh tab — and not to every mount of the screen: Back from an item page pops
// to the feed that is already there, and 3.6 s of black over tiles the reader has just seen would
// be a punishment for pressing Back.
//
// A module variable is exactly that granularity. A client-side navigation keeps module state
// (the screen remounts, this file doesn't), a document load starts it over. It also needs no
// storage: `sessionStorage` would outlive the document and skip the overture on a reload, which
// is the one case where it *should* replay. Set from an effect, never during render, so the server
// copy of this module — which lives across requests — never flips.

let played = false;

/** Read in a lazy `useState` initializer: `false` on the server and on every hydration render. */
export function overturePlayedThisDocument(): boolean {
  return played;
}

export function markOverturePlayed(): void {
  played = true;
}

/** Tests only — every `render` in a file shares the module. */
export function resetOverturePlayedForTests(): void {
  played = false;
}
