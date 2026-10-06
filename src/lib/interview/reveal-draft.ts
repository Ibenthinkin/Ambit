// The reveal's draft (components/onboarding/reveal-step.tsx): the proposal a reader is editing
// before any of it is written — every row at a level, or switched off but still on the page.
//
// It is its own pure module because of **Allow** (kept-out.ts): letting a kept-out subject back
// in changes the answers, so the proposal is computed again *while the reveal is on screen*, and
// the rows the reader has already set by hand must survive that. `reseed` is the merge:
//
//   - a row the reader touched keeps exactly what they set — level or off — whether or not the
//     new proposal still holds it;
//   - an untouched row takes the new proposal's level, and goes if the new proposal dropped it
//     (a topic let back in can push another past MAX_PICKS or its group's cap);
//   - a topic new to the proposal arrives at its proposed level.
//
// Submitting reads the same object, so what is written is exactly what the screen shows.
import type { Pick } from "./picks";

export interface RevealDraft {
  /** Every row, in proposal order (best first) — the order `draftPicks` submits in. The screen
   *  itself lists rows by label (TopicLevels). */
  order: readonly string[];
  /** Topic id → weight, for the rows that are on. */
  picks: ReadonlyMap<string, number>;
  /** Rows switched off but kept on the page, so a stray tap can be undone. */
  off: ReadonlySet<string>;
  /** Rows the reader set by hand — what a re-seed must not overwrite. */
  edited: ReadonlySet<string>;
}

export function seedDraft(proposed: readonly Pick[]): RevealDraft {
  return {
    order: proposed.map((p) => p.topicId),
    picks: new Map(proposed.map((p) => [p.topicId, p.weight])),
    off: new Set(),
    edited: new Set(),
  };
}

export function withLevel(
  draft: RevealDraft,
  topicId: string,
  weight: number,
): RevealDraft {
  const off = new Set(draft.off);
  off.delete(topicId);
  return {
    ...draft,
    picks: new Map(draft.picks).set(topicId, weight),
    off,
    edited: new Set(draft.edited).add(topicId),
  };
}

export function withOff(draft: RevealDraft, topicId: string): RevealDraft {
  const picks = new Map(draft.picks);
  picks.delete(topicId);
  return {
    ...draft,
    picks,
    off: new Set(draft.off).add(topicId),
    edited: new Set(draft.edited).add(topicId),
  };
}

export function reseed(
  draft: RevealDraft,
  proposed: readonly Pick[],
): RevealDraft {
  const proposedIds = new Set(proposed.map((p) => p.topicId));
  // The new proposal's order, then the hand-set rows it no longer holds, where they were.
  const order = [
    ...proposed.map((p) => p.topicId),
    ...draft.order.filter((id) => draft.edited.has(id) && !proposedIds.has(id)),
  ];
  const picks = new Map<string, number>();
  const off = new Set<string>();
  const proposedWeight = new Map(proposed.map((p) => [p.topicId, p.weight]));
  for (const id of order) {
    if (draft.edited.has(id)) {
      const weight = draft.picks.get(id);
      if (weight !== undefined) picks.set(id, weight);
      else off.add(id);
    } else {
      picks.set(id, proposedWeight.get(id)!);
    }
  }
  return { order, picks, off, edited: draft.edited };
}

/** What "Start exploring" hands over: the rows that are on, best first. */
export function draftPicks(draft: RevealDraft): Pick[] {
  return draft.order.flatMap((topicId) => {
    const weight = draft.picks.get(topicId);
    return weight === undefined ? [] : [{ topicId, weight }];
  });
}

/** Whether two proposals say the same thing — the screen re-seeds only when they don't. */
export function sameProposal(a: readonly Pick[], b: readonly Pick[]): boolean {
  return (
    a.length === b.length &&
    a.every((p, i) => p.topicId === b[i]!.topicId && p.weight === b[i]!.weight)
  );
}
