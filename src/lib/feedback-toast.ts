// The "More of this" / "Less of this" copy (More-or-less D5). The pair is a feedback loop like
// saving is, and the xikipedia lesson (SPEC §9) applies: an invisible loop reads as random, so
// the toast that confirms a tap also *says* what it changed:
//
//   "More of this · Now drifting toward Cartography"           — first pick in this topic
//   "Less of this · Drifting further from Cartography"         — the topic cooled again
//
// Pure and shared: the tile, the item screen and the sheet all build their copy through these
// functions, so the wording can't drift apart between surfaces. The `Toast` component sets Geist
// Mono caps itself, so every string here is sentence case.

/** The two verdicts a reader can pass on an item. Defined locally: `src/lib` is client code. */
export type Verdict = "more" | "less";

/**
 * What `feedback.set` reports about the topic it charged: `null` when no topic moved, otherwise
 * the topic's label and whether this tap created its row (`isNew`) or moved an existing one.
 */
export type FeedbackDrift = { topicLabel: string; isNew: boolean } | null;

export function feedbackToastText(verdict: Verdict, drift: FeedbackDrift) {
  if (verdict === "more") {
    if (!drift) return "More of this · Noted";
    const verb = drift.isNew
      ? "Now drifting toward"
      : "Drifting a little more toward";
    return `More of this · ${verb} ${drift.topicLabel}`;
  }
  if (!drift) return "Less of this · You won't see it again";
  const verb = drift.isNew ? "Drifting away from" : "Drifting further from";
  return `Less of this · ${verb} ${drift.topicLabel}`;
}

/** The toast after a tap that clears a verdict. */
export const UNDONE_TOAST = "Undone";

/**
 * The mono note under a marked pair. `topicLabel` is only used by "less", where it names the
 * topic that is now cooled; a "less" with no topic (an un-homed item) drops that clause.
 */
export function feedbackNoteText(verdict: Verdict, topicLabel: string | null) {
  if (verdict === "more") {
    return 'Added to your "More of this" shelf on Saved. Tap again to undo.';
  }
  if (!topicLabel) return "This one won't come back. Tap again to undo.";
  return `This one won't come back. ${topicLabel} is cooled — Profile → Topics to warm it up. Tap again to undo.`;
}
