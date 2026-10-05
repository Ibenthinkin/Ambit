// The questionnaire's vocabulary (docs/PLAN_onboarding-questionnaire.md §3). Everything in
// `src/lib/interview/` is pure — no React, no database, no network — so the same code scores an
// answer in the browser, checks the bank in a unit test, and plans a path for the e2e helper.
//
// The shape in one sentence: a **question** offers **options**; an option carries **effects**;
// an effect names topics (directly, or through an umbrella group) and a score to add to each.
// The reader never sees a topic id, a group or a facet — those are the internal vocabulary the
// answers are written in.
import type { ReadingAmount } from "~/server/config/reading-amount";
import type { WritingKind } from "~/server/config/writing";

/**
 *   pair    two picture cards — this one, that one, either, neither
 *   choice  pick exactly one of a few
 *   multi   pick any (up to `max`)
 *   amount  the reading-amount question: its options carry `reading`, no effects
 *   text    free text; a model maps the words to topic ids (`Answer.topicIds`)
 */
export type QuestionKind = "pair" | "choice" | "multi" | "amount" | "text";

/** What one answer adds: `score`, shared between its targets (see score.ts). Negative subtracts. */
export interface Effect {
  /** Topic ids named directly. */
  topics?: readonly string[];
  /** Umbrella group ids (config/topic-groups.ts), flattened to their members. */
  groups?: readonly string[];
  score: number;
}

export interface Option {
  /** Stable within its question; what gets logged. Never "skip" / "either" / "neither". */
  key: string;
  /** What the reader reads. */
  label: string;
  effects: readonly Effect[];
  /** The picture on this answer's card: the best image in `topic`, unless `pick` names one by
   *  hand (services/question-faces.ts). Absent ⇒ a text card.
   *  `writing` makes the card an *article* card instead: the nth-best writing item of that kind
   *  (0 = a short one, 1 = a long one); `topic` is then unused but kept for the type's sake. */
  face?: {
    topic: string;
    pick?: { source: string; sourceId: string };
    writing?: { kind: WritingKind; nth: 0 | 1 };
  };
  /** A typeset card with no picture — the destinations: `where` in small caps, the label large,
   *  one `line`. (Each carried its coordinates at the foot until Ben's 10-05-26 critique.) */
  card?: { where: string; line: string };
  /** Offered whether or not any of its topics is listed, and logged like any answer. For an
   *  option whose point is the log (Nudity under "rather not") or whose scoring comes from the
   *  item shown rather than from `effects` (the reading cards). */
  always?: true;
  /** `amount` questions only: the level this answer stores. */
  reading?: ReadingAmount;
}

export interface Question {
  id: string;
  kind: QuestionKind;
  prompt: string;
  /** Empty for a `text` question. */
  options: readonly Option[];
  /** `multi` only: how many answers may be chosen. Absent ⇒ any number. */
  max?: number;
  /** Show only the `top` options, ranked by how the answers so far have already scored each
   *  option's own targets (show.ts). The playoff: twelve wings in the bank, the reader's four
   *  on screen. Scoring and filtering ignore it — an option's effects never change. */
  show?: { top: number };
}

/** One answered (or skipped) question, as the screen holds it and the server logs it. */
export interface Answer {
  questionId: string;
  /** Chosen option keys; or exactly one of the sentinels SKIP / EITHER / NEITHER (config.ts).
   *  Empty for an answered `text` question. */
  keys: string[];
  /** `text` questions: the reader's own words. */
  text?: string;
  /** `text` questions: the topic ids the model mapped those words to (possibly none). */
  topicIds?: string[];
}
