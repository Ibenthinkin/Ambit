"use client";

import { useState } from "react";

import type { FallbackCard } from "~/lib/interview/reading-fallback";
import { cn } from "~/lib/utils";
import { WRITING_KIND_LABELS, type WritingKind } from "~/server/config/writing";

// One side of a "this one, or that one?" face-off: a picture you press.
//
// **The picture is a bonus, the label is the answer.** Faces come from the corpus
// (services/question-faces.ts) and are often missing — CI has no score-9 pictures, a fresh install
// has no pictures at all, and the image proxy can fail on a cold cache. In every one of those
// cases the card is the same button with its label set large instead, and the question still
// works. That is why the accessible name is always the label, never anything about the image
// (the `<img>` is `alt=""`: decorative next to a name that already says it).
//
// First Exhibition (10-04-26) gave it two more shapes, both taller than a picture card and both
// text-led: an **article card** (`writing`, a real piece from the corpus — `KIND · N MIN`, its
// title, one line of summary, its picture as a band on top if it has one; the accessible name is
// the title) and a **typeset card** (`card`, the destinations — no picture by design). An article
// card with no article behind it shows the kind and an example headline (`fallback`).
export interface FaceCardProps {
  /** What the answer is called — the accessible name, and the whole card when there's no face. */
  label: string;
  /** The picture's `src` (already proxied — the CSP allows nothing else). Absent ⇒ text card. */
  src?: string;
  /** The topics this answer would add; written to `data-topics` for the e2e helper to steer by. */
  topics: readonly string[];
  selected: boolean;
  onClick: () => void;
  /** An article card: `KIND · N MIN`, the title, one line of summary, the picture if any. The
   *  accessible name is the title. */
  writing?: { kind: WritingKind; minutes: number; title: string; dek: string };
  /** A reading answer with no article in this database: the kind, and an example headline so
   *  the card is never a bare word. The accessible name stays the label. */
  fallback?: { kind: WritingKind } & FallbackCard;
  /** A typeset card with no picture (the destinations). */
  card?: { where: string; line: string; coord: string };
}

/** The small-caps line above an article's title. */
const KICKER =
  "text-accent font-sans text-[11px] font-semibold tracking-[1.8px] uppercase";

export function FaceCard({
  label,
  src,
  topics,
  selected,
  onClick,
  writing,
  fallback,
  card,
}: FaceCardProps) {
  // A failed load flips the card to its text form rather than leaving a broken-image glyph.
  const [failed, setFailed] = useState(false);
  const showImage = src !== undefined && !failed;
  // The tall, text-led shapes: an article (real or example) and a destination.
  const tall = Boolean(card ?? writing ?? fallback);

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={writing ? writing.title : label}
      data-topics={topics.join(" ")}
      onClick={onClick}
      className={cn(
        "border-hairline rounded-card relative flex w-full flex-col overflow-hidden text-left transition-[border-color,box-shadow] duration-200",
        tall ? "bg-ink/5 aspect-auto min-h-[180px]" : "aspect-[4/5]",
        "focus-visible:outline-ink-hi focus-visible:outline-[3px] focus-visible:outline-offset-2",
        selected ? "border-accent ring-accent ring-2" : "border-ink/12",
        !tall && !showImage && "bg-ink/5 items-center justify-center",
      )}
    >
      {card ? (
        <span className="flex h-full w-full flex-1 flex-col p-4">
          <span className={KICKER}>{card.where}</span>
          <span className="text-ink-hi mt-2 text-[20px] leading-[1.15] font-semibold">
            {label}
          </span>
          <span className="text-ink/70 mt-2 text-[14px] leading-[1.45]">
            {card.line}
          </span>
          <span className="text-ink/45 mt-auto pt-3 font-mono text-[11px]">
            {card.coord}
          </span>
        </span>
      ) : writing ? (
        <span className="flex h-full w-full flex-col">
          {showImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt=""
              draggable={false}
              onError={() => setFailed(true)}
              className="aspect-[4/3] w-full object-cover"
            />
          )}
          <span className="flex flex-col p-4">
            <span className={KICKER}>
              {WRITING_KIND_LABELS[writing.kind]} · {writing.minutes} min
            </span>
            <span className="text-ink-hi mt-2 text-[17px] leading-[1.25] font-semibold">
              {writing.title}
            </span>
            {writing.dek && (
              <span className="text-ink/62 mt-1 text-[13px] leading-[1.45]">
                {writing.dek}
              </span>
            )}
          </span>
        </span>
      ) : fallback ? (
        <span className="flex h-full w-full flex-col p-4">
          <span className={KICKER}>{WRITING_KIND_LABELS[fallback.kind]}</span>
          <span className="text-ink-hi mt-2 text-[17px] leading-[1.25] font-semibold">
            {fallback.title}
          </span>
          <span className="text-ink/62 mt-1 text-[13px] leading-[1.45]">
            {fallback.dek}
          </span>
        </span>
      ) : showImage ? (
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
