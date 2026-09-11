"use client";

import * as React from "react";

// Which collection a one-click save goes into (docs/DESIGN_chrome-redesign.md §3, decision 2):
// the last one the reader saved into, on this device. Cosmos's hover strip has the same rule and
// it is what makes a hover save *one* click — the strip names the target and the glyph files it.
//
// localStorage rather than the database, deliberately: this is a device-local convenience, not a
// fact about the reader, and `install-store.ts` set the precedent (and the try/catch — Safari's
// Lockdown mode throws on every access).
//
// A `useSyncExternalStore` subscription rather than per-component state, because the feed mounts
// one strip per tile and a save from any of them has to rename the pill on all of them at once.

export const LAST_COLLECTION_KEY = "ambit.lastCollection";

const listeners = new Set<() => void>();

export function readLastCollectionId(): string | null {
  try {
    return localStorage.getItem(LAST_COLLECTION_KEY);
  } catch {
    return null;
  }
}

/** Remember `id`, and tell every mounted strip. Called after a successful save, never before. */
export function writeLastCollectionId(id: string): void {
  try {
    localStorage.setItem(LAST_COLLECTION_KEY, id);
  } catch {
    /* private mode etc. — the next save simply falls back to the first collection */
  }
  for (const cb of listeners) cb();
}

/**
 * The remembered collection if it is still in `collections`, else the first one (the seeded
 * "Articles" for a new reader), else null while the list is loading. Pure, for the tests.
 */
export function pickLastCollection<T extends { id: string }>(
  collections: readonly T[] | undefined,
  lastId: string | null,
): T | null {
  if (!collections || collections.length === 0) return null;
  return collections.find((c) => c.id === lastId) ?? collections[0]!;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  // Another tab saving should move this one's pills too.
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
const getServerSnapshot = () => null;

export function useLastCollectionId(): string | null {
  return React.useSyncExternalStore(
    subscribe,
    readLastCollectionId,
    getServerSnapshot,
  );
}

export function useLastCollection<T extends { id: string }>(
  collections: readonly T[] | undefined,
): T | null {
  return pickLastCollection(collections, useLastCollectionId());
}
