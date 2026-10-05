// The picture on each questionnaire answer card (docs/PLAN_onboarding-questionnaire.md §4).
//
// An option in the bank says `face: { topic: "astronomy" }` — "show a picture that stands for
// astronomy" — and this module decides which picture:
//
//   1. the option's hand `pick` (a `(source, sourceId)` pair), if the bank names one and this
//      database holds it; else
//   2. the best-scored image in the face topic (`topFacesForTopics`), skipping any picture an
//      earlier answer already took — an item can sit in two topics, and a face-off that shows
//      the same picture on both cards isn't one. That is why two are fetched per topic.
//
// **A missing face is the normal path, not an error.** CI's database has no score-9 pictures at
// all, and a fresh install has no pictures of anything; the card renders its label as text
// instead (components/onboarding/face-card.tsx). So the result simply leaves that answer out.
//
// **Memoised in-process for ten minutes**, like the landing's pool: a dozen small rows, and a
// sign-up costs no query. An empty result is never remembered, so the first ingest shows up on
// the next visit rather than ten minutes later.
import { imageSrc } from "~/lib/image-src";
import { QUESTIONS } from "~/lib/interview/bank";
import {
  faceKey,
  type QuestionFace,
  type QuestionFaces,
} from "~/lib/interview/faces";
import type { Question } from "~/lib/interview/types";
import { facePicks, topFacesForTopics } from "~/server/db/items";

// The types and the key live in a client-safe leaf; re-exported so server callers have one import.
export { faceKey, type QuestionFace, type QuestionFaces };

export const FACES_TTL_MS = 10 * 60 * 1000;
/** Two per topic — the spare is what a pair falls back to when its sides share a top picture. */
const PER_TOPIC = 2;

/** A card is at most half a desktop screen wide, so the closed-set 960 px rendition (see
 *  services/image-cache.ts) is plenty; the e2e corpus's inline `data:` pixels pass through. */
function faceSrc(id: string, imageUrl: string): string {
  const src = imageSrc(id, imageUrl);
  return src.startsWith("data:") ? src : `${src}?w=960`;
}

let memo: { faces: QuestionFaces; at: number } | null = null;

/** Tests only: forget the memo between cases. */
export function resetQuestionFacesForTests(): void {
  memo = null;
}

async function build(bank: readonly Question[]): Promise<QuestionFaces> {
  const wanted = bank.flatMap((q) =>
    q.options.flatMap((o) => (o.face ? [{ q, o, face: o.face }] : [])),
  );
  const topicIds = [...new Set(wanted.map((w) => w.face.topic))];
  const handPicks = wanted.flatMap((w) => (w.face.pick ? [w.face.pick] : []));

  const [tops, picked] = await Promise.all([
    topFacesForTopics(topicIds, PER_TOPIC),
    facePicks(handPicks),
  ]);

  const used = new Set<string>();
  const faces: QuestionFaces = {};
  // In bank order, so which answer keeps a shared picture is stable: the earlier one.
  for (const { q, o, face } of wanted) {
    const hand = face.pick
      ? picked.find(
          (p) =>
            p.source === face.pick!.source &&
            p.sourceId === face.pick!.sourceId,
        )
      : undefined;
    const choice =
      (hand && !used.has(hand.id) ? hand : undefined) ??
      tops.find((t) => t.topicId === face.topic && !used.has(t.id));
    if (!choice) continue;
    used.add(choice.id);
    faces[faceKey(q.id, o.key)] = {
      itemId: choice.id,
      src: faceSrc(choice.id, choice.imageUrl),
    };
  }
  return faces;
}

/**
 * Every face for the bank (the real one by default; tests pass their own). Never throws: a
 * database error logs and answers `{}`, and the questionnaire renders text cards — a reader
 * must not be kept out of the app by a decoration.
 */
export async function getQuestionFaces(
  bank: readonly Question[] = QUESTIONS,
): Promise<QuestionFaces> {
  if (memo && Date.now() - memo.at < FACES_TTL_MS) return memo.faces;
  try {
    const faces = await build(bank);
    if (Object.keys(faces).length > 0) memo = { faces, at: Date.now() };
    return faces;
  } catch (err) {
    console.error("[question-faces] could not load faces", err);
    return {};
  }
}
