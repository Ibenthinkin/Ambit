// The shape of "which picture is on which answer card" — a leaf, so the client components can
// name it without importing services/question-faces.ts (and, through it, the database layer).

export interface QuestionFace {
  /** The item shown — `/dev/faces` prints it, and it is the `<img>`'s key. */
  itemId: string;
  /** What the `<img src>` is: the proxied 960 px rendition, or a `data:` URL verbatim. */
  src: string;
}

/** Faces keyed by `faceKey(questionId, optionKey)`; an answer with no picture is absent. */
export type QuestionFaces = Record<string, QuestionFace>;

export function faceKey(questionId: string, optionKey: string): string {
  return `${questionId}/${optionKey}`;
}
