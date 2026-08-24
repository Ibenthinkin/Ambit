"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Chip } from "~/components/ui/chip";

// Saved's filter row (`Ambit - Saved.dc.html`): "All" plus one chip per collection, horizontally
// scrollable. A scope note worth stating out loud: the prototype's chips are a 3-way *type*
// filter (All / Images / Reading); BUILD_PLAN's 5.9 entry — written after the prototypes, with
// the 5.5 collections backend in hand — reinterprets them as **collection** chips, which is what
// `saves.list`'s `collectionId` filter was built for. The prototype still governs the visual
// treatment (the small `Chip` variant, count suffixes, active fill).
//
// The active filter lives in the URL, not in state: `CollectionsSheet` already deep-links to
// `/saved?collection={id}` from anywhere in the app, and a reload or share of a filtered view has
// to land filtered — so the URL is the single source of truth and these chips just navigate.
// `replace`, not `push`: flicking between filters is refinement of one screen, and stacking a
// history entry per flick would turn the eventual "back" into a replay of every chip tap.

/** "{name} · N", with the count omitted at zero — the prototype's own rule. */
function chipLabel(name: string, count: number): string {
  return count > 0 ? `${name} · ${count}` : name;
}

export interface CollectionChipsProps {
  collections: { id: string; name: string; itemCount: number }[];
  /** Total saves (saves.count) — the "All" chip's number, never derived from the rows. */
  total: number;
  /** The raw `?collection=` value, or undefined when unfiltered. */
  activeId?: string;
}

export function CollectionChips({
  collections,
  total,
  activeId,
}: CollectionChipsProps) {
  const router = useRouter();
  const go = (id?: string) =>
    router.replace(
      id ? `/saved?collection=${encodeURIComponent(id)}` : "/saved",
    );

  return (
    // The negative-margin edge bleed lets the row scroll under the header's own 20px padding
    // rather than clipping mid-screen — the same trick as any full-bleed strip in a padded parent.
    <div className="-mx-5 flex gap-2 overflow-x-auto px-5">
      <Chip size="sm" selected={activeId === undefined} onClick={() => go()}>
        {chipLabel("All", total)}
      </Chip>
      {collections.map((c) => (
        <Chip
          key={c.id}
          size="sm"
          selected={activeId === c.id}
          onClick={() => go(c.id)}
        >
          {chipLabel(c.name, c.itemCount)}
        </Chip>
      ))}
    </div>
  );
}
