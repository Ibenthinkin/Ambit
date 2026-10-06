"use client";

import { FRAME } from "~/lib/interview/frame";
import type { TasteFields } from "~/lib/interview/taste";

import { Compass } from "./compass";
import { ExhibitionHead, type HungPicture } from "./exhibition-head";
import { Opened } from "./opened";
import { Temperament } from "./temperament";

// The reader's first exhibition, whole (docs/DESIGN_redesign.md §5.3 items 1–5): the head
// (eyebrow, title, subtitle, hang), then two columns — the temperament strip on the left, the
// travel compass and "You’d open" on the right — which stack on a phone. The four pieces live
// in their own files so /profile/topics can draw them where its order wants them; this is the
// composition the reveal draws, and the profile until Task 6.8 places the pieces itself.
//
// No frame and no padding: it sits in the host's column like the rest of the page (the 1b
// screens draw no boxes around sections). A region named by the eyebrow, so the exhibition can
// be found as one thing.
export function ExhibitionCard({
  taste,
  topicLabels,
  hang = [],
  headingLevel = "h2",
}: {
  taste: TasteFields;
  topicLabels: ReadonlyMap<string, string>;
  /** The hang to draw — none for a v1 taste, or when fewer than two pictures were left. */
  hang?: readonly HungPicture[];
  headingLevel?: "h1" | "h2";
}) {
  return (
    <section aria-label={FRAME.eyebrow}>
      <ExhibitionHead
        taste={taste}
        topicLabels={topicLabels}
        hang={hang}
        headingLevel={headingLevel}
      />
      <div className="mt-14 grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-x-12 gap-y-9">
        <Temperament temperament={taste.temperament} />
        <div className="flex flex-col gap-9">
          {taste.compass && <Compass compass={taste.compass} />}
          <Opened opened={taste.opened} readingMinutes={taste.readingMinutes} />
        </div>
      </div>
    </section>
  );
}
