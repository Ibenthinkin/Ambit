import { notFound } from "next/navigation";

import { imageSrc } from "~/lib/image-src";
import { QUESTIONS } from "~/lib/interview/bank";
import { faceKey } from "~/lib/interview/faces";
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
  const topicIds = [...new Set(faced.map((f) => f.face.topic))];
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
        const rows = candidates.filter((c) => c.topicId === face.topic);
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
              {current ? "" : " · NO FACE — the card is text"}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-4">
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
