"use client";

import { useState } from "react";

import { cn } from "~/lib/utils";

// One side of a "this one, or that one?" face-off: a picture you press.
//
// **The picture is a bonus, the label is the answer.** Faces come from the corpus
// (services/question-faces.ts) and are often missing — CI has no score-9 pictures, a fresh install
// has no pictures at all, and the image proxy can fail on a cold cache. In every one of those
// cases the card is the same button with its label set large instead, and the question still
// works. That is why the accessible name is always the label, never anything about the image
// (the `<img>` is `alt=""`: decorative next to a name that already says it).
export interface FaceCardProps {
  /** What the answer is called — the accessible name, and the whole card when there's no face. */
  label: string;
  /** The picture's `src` (already proxied — the CSP allows nothing else). Absent ⇒ text card. */
  src?: string;
  /** The topics this answer would add; written to `data-topics` for the e2e helper to steer by. */
  topics: readonly string[];
  selected: boolean;
  onClick: () => void;
}

export function FaceCard({
  label,
  src,
  topics,
  selected,
  onClick,
}: FaceCardProps) {
  // A failed load flips the card to its text form rather than leaving a broken-image glyph.
  const [failed, setFailed] = useState(false);
  const showImage = src !== undefined && !failed;

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      data-topics={topics.join(" ")}
      onClick={onClick}
      className={cn(
        "border-hairline rounded-card relative flex aspect-[4/5] w-full flex-col overflow-hidden text-left transition-[border-color,box-shadow] duration-200",
        "focus-visible:outline-ink-hi focus-visible:outline-[3px] focus-visible:outline-offset-2",
        selected ? "border-accent ring-accent ring-2" : "border-ink/12",
        !showImage && "bg-ink/5 items-center justify-center",
      )}
    >
      {showImage ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            draggable={false}
            onError={() => setFailed(true)}
            className="absolute inset-0 h-full w-full object-cover"
          />
          {/* A scrim only as tall as the caption needs, so the picture stays the picture. */}
          <span className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-black/0 px-4 pt-10 pb-3 text-[15px] font-medium text-white">
            {label}
          </span>
        </>
      ) : (
        <span className="text-ink-hi px-4 text-center text-[22px] leading-tight font-semibold">
          {label}
        </span>
      )}
    </button>
  );
}
