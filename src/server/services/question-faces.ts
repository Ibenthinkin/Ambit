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
// And a third kind of face since First Exhibition (docs/DESIGN_first-exhibition.md §2): a reading
// card, `face: { writing: { kind, nth } }`, is a real *article* — the best-scored short piece of
// that kind on the first reading screen, a long one on the second (`pickWriting`). It carries the
// card's copy and the article's topic memberships, which is what choosing it scores; its picture
// is optional, and an article with none renders as an article text card.
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
import type { WritingKind } from "~/server/config/writing";
import {
  facePicks,
  topFacesForTopics,
  topWritingForKinds,
  type WritingCandidate,
} from "~/server/db/items";

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

/** How many articles to fetch per kind — enough to find a short and a long one. */
const PER_KIND = 6;
/** "Short" and "long" for the two reading screens (design §2). */
export const SHORT_READ_MAX = 6;
export const LONG_READ_MIN = 12;

/**
 * The article for one card: for `nth` 0 the best-scored *short* piece of the kind, for 1 the
 * best *long* one; when none fits the length, the best unused one. `used` keeps two cards from
 * showing the same article. Pure, so it is tested without a database.
 */
export function pickWriting(
  candidates: readonly WritingCandidate[],
  kind: WritingKind,
  nth: 0 | 1,
  used: ReadonlySet<string>,
): WritingCandidate | undefined {
  const pool = candidates.filter((c) => c.kind === kind && !used.has(c.id));
  const fits = (c: WritingCandidate) =>
    nth === 0
      ? (c.readingMinutes ?? Infinity) <= SHORT_READ_MAX
      : (c.readingMinutes ?? 0) >= LONG_READ_MIN;
  return pool.find(fits) ?? pool[0];
}

/** The summary's first line, for the card's dek. */
function dekOf(summary: string | null): string {
  return (summary ?? "").split("\n")[0]!.trim();
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
  // A writing face's `topic` is a placeholder (the card is filled from the article), so only
  // picture faces ask for pictures.
  const topicIds = [
    ...new Set(wanted.flatMap((w) => (w.face.writing ? [] : [w.face.topic]))),
  ];
  const handPicks = wanted.flatMap((w) => (w.face.pick ? [w.face.pick] : []));
  const writingKinds = [
    ...new Set(
      wanted.flatMap((w) => (w.face.writing ? [w.face.writing.kind] : [])),
    ),
  ];

  const [tops, picked, writing] = await Promise.all([
    topFacesForTopics(topicIds, PER_TOPIC),
    facePicks(handPicks),
    writingKinds.length > 0
      ? topWritingForKinds(writingKinds, PER_KIND)
      : Promise.resolve([]),
  ]);

  const used = new Set<string>();
  const faces: QuestionFaces = {};
  // In bank order, so which answer keeps a shared picture is stable: the earlier one.
  for (const { q, o, face } of wanted) {
    if (face.writing) {
      const c = pickWriting(writing, face.writing.kind, face.writing.nth, used);
      if (!c) continue;
      used.add(c.id);
      faces[faceKey(q.id, o.key)] = {
        itemId: c.id,
        ...(c.imageUrl ? { src: faceSrc(c.id, c.imageUrl) } : {}),
        writing: {
          title: c.title,
          dek: dekOf(c.summary),
          minutes: c.readingMinutes ?? 0,
          kind: c.kind,
          topicIds: c.topicIds,
        },
      };
      continue;
    }

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
