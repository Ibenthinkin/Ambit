// The shape of "which picture is on which answer card" — a leaf, so the client components can
// name it without importing services/question-faces.ts (and, through it, the database layer).
import type { WritingKind } from "~/server/config/writing";

export interface QuestionFace {
  /** The item shown — `/dev/faces` prints it, and it is the `<img>`'s key. */
  itemId: string;
  /** What the `<img src>` is: the proxied 960 px rendition, or a `data:` URL verbatim. Absent
   *  for an article with no picture — the card is then an article text card. */
  src?: string;
  /** The item's own title — the caption under a picture card (`1  title`, DESIGN_redesign §5.1)
   *  and under the reveal's hang. An article card's title is also `writing.title`. */
  title: string;
  /** An article card's copy and what choosing it scores (services/question-faces.ts). */
  writing?: {
    title: string;
    /** The summary's first line. */
    dek: string;
    minutes: number;
    kind: WritingKind;
    /** The item's topic memberships — put on `Answer.topicIds` when the card is chosen. */
    topicIds: string[];
  };
}

/** Faces keyed by `faceKey(questionId, optionKey)`; an answer with no picture is absent. */
export type QuestionFaces = Record<string, QuestionFace>;

export function faceKey(questionId: string, optionKey: string): string {
  return `${questionId}/${optionKey}`;
}
