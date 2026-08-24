// The combined save toast (Phase 6.1). Saving is the one act that teaches the feed, and the
// xikipedia lesson (SPEC §9) is that an invisible feedback loop reads as random — so the toast
// that confirms the save also *says* what was just learned:
//
//   "Saved to Art"                                          — a move between collections (no
//                                                             learning happened)
//   "Saved to Art · Now drifting toward Cartography"        — first save ever in this topic
//   "Saved to Art · Drifting a little more toward Cartography" — the topic's weight rose again
//
// Pure and shared: all four screens that mount a save sheet build their toast through this one
// function, so the copy can't drift apart between them.

/**
 * What `saves.saveToCollection` reports about the weight bump: `null` when the save was a move
 * between collections (no bump), otherwise the bumped topic's label and whether its
 * `user_topic` row was just created (`isNew`) or merely nudged.
 */
export type SaveDrift = { topicLabel: string; isNew: boolean } | null;

export function saveToastText(collectionName: string, drift: SaveDrift) {
  if (!drift) return `Saved to ${collectionName}`;
  const verb = drift.isNew
    ? "Now drifting toward"
    : "Drifting a little more toward";
  return `Saved to ${collectionName} · ${verb} ${drift.topicLabel}`;
}
