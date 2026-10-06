// The hang (docs/DESIGN_redesign.md §5.1, §5.3 item 4): up to six of the reader's *own* pictures
// under the reveal's title — pictures they chose a few screens ago, so the name over them reads
// as theirs rather than as a verdict. Which six, in order:
//
//   1. the pictures they **kept** (the keep-or-pass screen), in the order kept — the design's
//      "six of the reader's kept pictures", so they come first;
//   2. then the pictures they **picked** on a one-of question (a room, a pair), newest first —
//      the last thing chosen is the one they remember choosing;
//   3. then, for a reader who skipped their way here, a **door**: the door picture of each of
//      their top wings — the caller says which wings (`heroesFor` over `wingRanking`).
//
// (Built 10-06-26 as three, picks first; the redesign made it six, keeps first.)
//
// A picture is a face with a `src` that is not an article card: a reading card has a picture
// too, but it was opened as writing. "Either" and "Neither" choose no one picture, and a skip
// chooses nothing. No picture hangs twice (the same item can be a door and a playoff face on a
// thin corpus). **Fewer than two is no hang at all** (§5.3: one picture alone is not a hang) —
// decided here rather than in the layout, so the stored taste holds exactly what the reveal
// showed and `/profile/topics` draws the same thing back.
//
// Pure, like everything in lib/interview. It returns faces rather than ids because the reveal
// draws `src` and the caption's `title`; the stored taste (v2, taste.ts) keeps only `itemId`.
import { SENTINELS } from "./config";
import { faceKey, type QuestionFaces } from "./faces";
import type { Answer, Question } from "./types";

export const HANG_SIZE = 6;
/** Below this many pictures there is no hang. */
export const HANG_MIN = 2;

export interface HangPicture {
  /** `faceKey(questionId, optionKey)` — which card this was. */
  key: string;
  itemId: string;
  src: string;
  /** The item's own title — the caption, `01 · title`. */
  title: string;
  /** The option's label, for the `alt`. */
  label: string;
}

function pictureFor(
  question: Question,
  optionKey: string,
  faces: QuestionFaces,
): HangPicture | undefined {
  const option = question.options.find((o) => o.key === optionKey);
  if (!option?.face || option.face.writing) return undefined;
  const key = faceKey(question.id, optionKey);
  const face = faces[key];
  if (!face?.src || face.writing) return undefined;
  return {
    key,
    itemId: face.itemId,
    src: face.src,
    title: face.title,
    label: option.label,
  };
}

/** One card of the bank, by question and option. */
export interface CardRef {
  questionId: string;
  optionKey: string;
}

/**
 * Each wing's door card, in the order given: for every id, the first one-of question in the bank
 * offering it as a pictured option. A wing no question shows contributes nothing.
 */
export function heroesFor(
  bank: readonly Question[],
  wingIds: readonly string[],
): CardRef[] {
  return wingIds.flatMap((id) => {
    const q = bank.find(
      (x) =>
        x.kind === "choice" &&
        x.options.some((o) => o.key === id && o.face && !o.face.writing),
    );
    return q ? [{ questionId: q.id, optionKey: id }] : [];
  });
}

export function hangFrom(input: {
  bank: readonly Question[];
  answers: readonly Answer[];
  faces: QuestionFaces;
  /** Cards to fill from when the answers hold fewer than HANG_SIZE pictures. */
  heroes?: readonly CardRef[];
}): HangPicture[] {
  const { bank, answers, faces, heroes = [] } = input;
  const picked: HangPicture[] = [];
  const kept: HangPicture[] = [];

  for (const answer of answers) {
    const question = bank.find((q) => q.id === answer.questionId);
    if (!question) continue;
    const pictures = answer.keys
      .filter((k) => !SENTINELS.includes(k))
      .flatMap((k) => pictureFor(question, k, faces) ?? []);
    if (question.kind === "multi") kept.push(...pictures);
    // Newest first: each one-of answer goes in front of the ones before it.
    else picked.unshift(...pictures);
  }

  const heroPictures = heroes.flatMap(({ questionId, optionKey }) => {
    const question = bank.find((q) => q.id === questionId);
    return question ? (pictureFor(question, optionKey, faces) ?? []) : [];
  });

  const hang: HangPicture[] = [];
  const seen = new Set<string>();
  for (const picture of [...kept, ...picked, ...heroPictures]) {
    if (hang.length >= HANG_SIZE) break;
    if (seen.has(picture.itemId)) continue;
    seen.add(picture.itemId);
    hang.push(picture);
  }
  return hang.length < HANG_MIN ? [] : hang;
}
