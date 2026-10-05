// The questionnaire's numbers, in one place (docs/PLAN_onboarding-questionnaire.md §3). All of
// them are untuned first guesses — walk the bank a few times, look at the reveal, and edit here.

/** The reveal needs at least this many topics before "Start exploring" (the old floor of three). */
export const MIN_PICKS = 3;
/** …and never proposes more than this, however much was answered. */
export const MAX_PICKS = 12;
/** At most this many topics from one umbrella group — one enthusiastic answer about space
 *  shouldn't fill the reveal with twelve space topics. */
export const GROUP_CAP = 3;

/** "Either" on a pair: both sides, a little less than a clear choice. */
export const EITHER_FACTOR = 0.75;
/** "Neither" on a pair: both sides count *against*. */
export const NEITHER_FACTOR = -0.5;

/** A free-text answer's topics share this much — more than a tapped answer (1), because typing a
 *  name is a stronger signal than choosing from what was offered. One named favourite lands at
 *  "a lot"; four share it and land at "some". */
export const TEXT_SCORE = 1.5;

/** Score → level bands for the reveal: below SOME_FROM is "a little", from LOT_FROM "a lot". */
export const SOME_FROM = 0.6;
export const LOT_FROM = 1.5;

/** The three answers that aren't option keys. `Answer.keys` holds exactly one of them, alone. */
export const SKIP = "skip";
export const EITHER = "either";
export const NEITHER = "neither";
export const SENTINELS: readonly string[] = [SKIP, EITHER, NEITHER];
