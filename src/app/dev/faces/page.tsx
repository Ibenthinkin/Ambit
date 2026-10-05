import { notFound } from "next/navigation";

import { imageSrc } from "~/lib/image-src";
import { PICKS, QUESTIONS } from "~/lib/interview/bank";
import { faceKey, type QuestionFace } from "~/lib/interview/faces";
import { getItemsByIds, topFacesForTopics } from "~/server/db/items";
import { feedDebugEnabled } from "~/server/services/feed-debug";
import { getQuestionFaces } from "~/server/services/question-faces";

// Where Ben gives the questionnaire's faces their hand pass (docs/PLAN_onboarding-questionnaire.md
// §4, §8). Each picture answer shows the face it has today — a hand pick if the bank names one,
// else the best-scored image in its face topic — and the next few candidates from that topic.
// Under every picture is a line to paste into the option in `src/lib/interview/bank.ts`:
//
//     face: { topic: "astronomy", pick: { source: "met", sourceId: "436535" } },
//
// `(source, sourceId)` rather than the item's id, because the id is a per-database nanoid and the
// pair is the same on the Mac and in production.
//
// First Exhibition (10-05-26): hand picks live in one object, `PICKS` in bank.ts, keyed by role
// (`wing:space:door`, `pair:hands-owls:a`, `keep:3`) — each section names its key. The face in use
// is always shown first, even when a hand pick is not among its topic's candidates. Reading cards
// (`face.writing`) have no hand pick: the service chooses a real article, shown here as copy.
//
// Same gate as /dev/feed and /dev/marks — a 404 under a production build with FEED_DEBUG unset.
// No session guard: nothing here is a reader's data.

/** How many candidates to offer per face topic. */
const CANDIDATES = 8;

export const metadata = { title: "Faces · Ambit dev" };

export default async function DevFacesPage() {
  if (!(await feedDebugEnabled())) notFound();

  const faced = QUESTIONS.flatMap((q) =>
    q.options.flatMap((o) => (o.face ? [{ q, o, face: o.face }] : [])),
  );
  // A reading card's `topic` is a placeholder; only picture faces have candidates.
  const topicIds = [
    ...new Set(faced.flatMap((f) => (f.face.writing ? [] : [f.face.topic]))),
  ];
  const [faces, candidates] = await Promise.all([
    getQuestionFaces(),
    topFacesForTopics(topicIds, CANDIDATES),
  ]);
  // The picks need each picture's (source, sourceId), which the lean face queries don't carry.
  const items = await getItemsByIds([
    ...new Set([
      ...candidates.map((c) => c.id),
      ...Object.values(faces).map((f) => f.itemId),
    ]),
  ]);

  return (
    <main className="bg-bg text-ink min-h-dvh px-6 py-10">
      <h1 className="text-ink-hi text-[26px] font-semibold">Question faces</h1>
      <p className="text-ink/62 mt-2 max-w-[640px] text-[14px] leading-[1.5]">
        The picture on each face-off card. Paste a line into the option in{" "}
        <code>src/lib/interview/bank.ts</code> to pin that picture; without a
        pick the first candidate is used. Faces are memoised for ten minutes, so
        a new pick shows after a restart.
      </p>

      {faced.map(({ q, o, face }) => {
        const current = faces[faceKey(q.id, o.key)];
        if (face.writing)
          return (
            <section key={faceKey(q.id, o.key)} className="mt-10">
              <h2 className="text-ink-hi text-[17px] font-semibold">
                {q.id} / {o.key} — “{o.label}”
              </h2>
              <p className="text-ink/62 mt-1 font-mono text-[12px]">
                article · automatic · {face.writing.kind} · nth{" "}
                {face.writing.nth}
              </p>
              {current?.writing ? (
                <p className="text-ink mt-2 text-[14px] leading-[1.5]">
                  “{current.writing.title}” — {current.writing.kind} ·{" "}
                  {current.writing.minutes} min ·{" "}
                  <span className="font-mono text-[12px]">
                    {current.itemId}
                  </span>
                  {current.src ? "" : " · no picture (text card)"}
                </p>
              ) : (
                <p className="text-ink/45 mt-2 text-[13px]">
                  NO ARTICLE — the card shows its fallback headline.
                </p>
              )}
            </section>
          );
        const rows = candidates.filter((c) => c.topicId === face.topic);
        const role = Object.entries(PICKS).find(
          ([, p]) => p === face.pick,
        )?.[0];
        const inRows = rows.some((c) => c.id === current?.itemId);
        return (
          <section key={faceKey(q.id, o.key)} className="mt-10">
            <h2 className="text-ink-hi text-[17px] font-semibold">
              {q.id} / {o.key} — “{o.label}”
            </h2>
            <p className="text-ink/62 mt-1 font-mono text-[12px]">
              topic: {face.topic}
              {face.pick
                ? ` · hand pick: ${face.pick.source} ${face.pick.sourceId}`
                : " · automatic"}
              {role ? ` · PICKS key: ${role}` : ""}
              {current ? "" : " · NO FACE — the card is text"}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-4">
              {current && !inRows && (
                <CurrentFace face={current} pick={face.pick} />
              )}
              {rows.map((c) => {
                const item = items.get(c.id);
                const isCurrent = current?.itemId === c.id;
                return (
                  <figure key={c.id}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={
                        c.imageUrl.startsWith("data:")
                          ? c.imageUrl
                          : `${imageSrc(c.id, c.imageUrl)}?w=960`
                      }
                      alt=""
                      className={
                        isCurrent
                          ? "ring-accent aspect-[4/5] w-full object-cover ring-2"
                          : "aspect-[4/5] w-full object-cover"
                      }
                    />
                    <figcaption className="text-ink/62 mt-2 font-mono text-[11px] leading-[1.4] break-all select-all">
                      {isCurrent ? "← in use. " : ""}
                      {item
                        ? `pick: { source: "${item.source}", sourceId: "${item.sourceId}" }`
                        : c.id}
                    </figcaption>
                  </figure>
                );
              })}
              {rows.length === 0 && (
                <p className="text-ink/45 text-[13px]">
                  No image at score 9 or better in this topic.
                </p>
              )}
            </div>
          </section>
        );
      })}
    </main>
  );
}

/** The face in use when it is not among its topic's candidates — a hand pick from elsewhere. */
function CurrentFace({
  face,
  pick,
}: {
  face: QuestionFace;
  pick?: { source: string; sourceId: string };
}) {
  return (
    <figure>
      {face.src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={face.src}
          alt=""
          className="ring-accent aspect-[4/5] w-full object-cover ring-2"
        />
      )}
      <figcaption className="text-ink/62 mt-2 font-mono text-[11px] leading-[1.4] break-all select-all">
        ← in use (hand pick).{" "}
        {pick
          ? `pick: { source: "${pick.source}", sourceId: "${pick.sourceId}" }`
          : face.itemId}
      </figcaption>
    </figure>
  );
}
