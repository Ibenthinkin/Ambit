// How much writing one reader wants mixed into their feed — a no-import leaf like
// `topic-levels.ts`, so the settings sheet and the questionnaire can read the four amounts
// without bundling the database layer.
//
// **The level is stored, never the share.** `user.writing_amount` holds one of these four words
// (or NULL, meaning "never said" — the engine's default). The number a word buys lives only in
// this file, so retuning "a lot" from a quarter of the page to a third is a one-line edit and no
// data migration.
//
//   amount   share of a page's slots     at 12 cards a page
//   none     0        (pictures only)    0
//   little   0.0625   1 slot in 16       ~1 every other page
//   some     0.125    1 slot in 8        ~1–2          ← the engine's default (DEFAULT_KNOBS.writingShare)
//   lot      0.25     1 slot in 4        ~3
//
// **"none" is not simply share 0.** At `writingShare: 0` the feed engine stops reserving writing
// slots and lets articles back into the ordinary topic pools (the pre-writing behaviour, pinned
// by a feed test). A reader who says "none" means *no articles*, so `services/feed.ts`'s
// `resolveWriting` turns it into `picturesOnly` instead. The 0 here is honest about the share and
// is not what enforces the absence.

export type ReadingAmount = "none" | "little" | "some" | "lot";

/** Display order — the order of the questionnaire's answers and the settings sheet's segments. */
export const READING_AMOUNTS: readonly ReadingAmount[] = [
  "none",
  "little",
  "some",
  "lot",
];

/** The reader-facing words, in one place for the copy pass. */
export const READING_LABELS: Record<ReadingAmount, string> = {
  none: "None",
  little: "A little",
  some: "Some",
  lot: "A lot",
};

const SHARE: Record<ReadingAmount, number> = {
  none: 0,
  little: 0.0625,
  some: 0.125,
  lot: 0.25,
};

/** The fraction of a page's slots this amount reserves for writing. */
export function readingShare(amount: ReadingAmount): number {
  return SHARE[amount];
}

/** Narrows a stored or submitted value — the column is plain `text`, so a read validates. */
export function isReadingAmount(value: unknown): value is ReadingAmount {
  return (
    typeof value === "string" &&
    (READING_AMOUNTS as readonly string[]).includes(value)
  );
}
