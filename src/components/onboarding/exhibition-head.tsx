"use client";

import { useState } from "react";

import { Eyebrow } from "~/components/ui/eyebrow";
import { WINGS } from "~/server/config/interview-wings";
import { exhibitionSubtitleParts } from "~/lib/interview/exhibition";
import { FRAME } from "~/lib/interview/frame";
import type { TasteFields } from "~/lib/interview/taste";

// The exhibition's head (docs/DESIGN_redesign.md §5.3 items 1–4): the mono eyebrow, the title —
// adjective over noun, very large — the subtitle sentence with its "Mostly …" half in italics,
// and the hang, up to six of the reader's own pictures. One of the four pieces the reveal and
// /profile/topics both draw (with temperament.tsx, compass.tsx and opened.tsx); exhibition-card.tsx
// composes them. Pure presentation: every word arrives in `taste` or from lib/interview.

/** One hung picture, as either host has it: the reveal's `HangPicture` or the profile's
 *  `HangCard` — both carry these three. `src` is already proxied (the CSP allows nothing else). */
export interface HungPicture {
  itemId: string;
  src: string;
  title: string;
}

export interface ExhibitionHeadProps {
  taste: TasteFields;
  topicLabels: ReadonlyMap<string, string>;
  /** The hang, in hanging order. Empty — a v1 taste, or fewer than two pictures — hangs nothing. */
  hang?: readonly HungPicture[];
  /** The title's element: the reveal's page heading, or a section's under the profile's own. */
  headingLevel?: "h1" | "h2";
}

export function ExhibitionHead({
  taste,
  topicLabels,
  hang = [],
  headingLevel: Heading = "h2",
}: ExhibitionHeadProps) {
  const wingLabel = (id: string) => WINGS.find((w) => w.id === id)?.label ?? id;
  const subtitle = exhibitionSubtitleParts(
    taste.wings.map(wingLabel),
    taste.mediums.map((id) => topicLabels.get(id) ?? id),
  );

  return (
    <div>
      <Eyebrow as="p" className="block text-[11px]">
        {FRAME.eyebrow}
      </Eyebrow>
      {/* Adjective, line break, noun — two blocks with a space between, so the heading's
          accessible name still reads "Quiet Gardens". */}
      <Heading className="text-ink-hi mt-4 text-[clamp(64px,14cqw,200px)] leading-[0.92] tracking-[-0.04em]">
        <span className="block">{taste.title.adjective}</span>{" "}
        <span className="block">{taste.title.noun}</span>
      </Heading>
      {(subtitle.wings || subtitle.mostly) && (
        <p className="text-ink/78 mt-6 max-w-[760px] text-[clamp(18px,2.2cqw,26px)] leading-[1.4] text-pretty">
          {subtitle.wings}
          {subtitle.wings && subtitle.mostly && " "}
          {subtitle.mostly && <em>{subtitle.mostly}</em>}
        </p>
      )}

      {hang.length > 0 && (
        <ol
          aria-label="Hung pictures"
          className="mt-10 grid grid-cols-[repeat(auto-fill,minmax(min(46%,180px),1fr))] gap-1"
        >
          {hang.map((picture, i) => (
            <li key={picture.itemId}>
              <HungFrame src={picture.src} />
              <p className="text-ink/48 mt-2 font-mono text-[10px] uppercase">
                {String(i + 1).padStart(2, "0")} · {picture.title}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** A 4:5 frame. A picture that fails to load leaves the empty card behind it rather than a broken
 *  image (the caption under it still names it). Decorative: the caption is the name. */
function HungFrame({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="bg-card aspect-[4/5] overflow-hidden">
      {!failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      )}
    </div>
  );
}
