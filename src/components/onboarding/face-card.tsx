"use client";

import { useState } from "react";

import { cn } from "~/lib/utils";

// The picture screens' card (DESIGN_redesign §5.2, the rooms and the pairs): a 4:5 picture you
// press, with a mono caption under it — a number or an arrow, then the picture's **own title**
// (decision 11: never the wing's name).
//
// **The picture is a bonus, the label is the answer.** Faces come from the corpus
// (services/question-faces.ts) and are often missing — CI has no score-9 pictures, a fresh install
// has no pictures at all, and the image proxy can fail on a cold cache. In every one of those
// cases the frame shows the label set large instead (`CardPicture`), and the question still
// works. That is why the accessible name is always the label, never anything about the image
// (the `<img>` is `alt=""`: decorative next to a name that already says it).
//
// The other card shapes the questionnaire had live in their own files since the redesign: the
// reading screens' story card (story-card.tsx), the destinations' place card (place-card.tsx) and
// the keep stack (keep-stack.tsx), which borrows `CardPicture` from here.

/** The prototype's `focusStyle`: the card under the cursor (or the pointer) lifts 3.5% above its
 *  neighbours, over 350 ms. `motion-lift` exempts it from the reduced-motion collapse, as the
 *  feed's lift is — it is a hover cue, not an entrance. A picked card sits a layer up (`PICKED_Z`)
 *  and a keyboard-focused one above everything, so neither the pick's outline nor the focus ring
 *  (both drawn 3 px outside the card, across a 4 px gap) is painted under a neighbour. */
export const CARD_LIFT =
  "motion-lift relative transition-[scale] duration-350 ease-[cubic-bezier(.2,.8,.2,1)] hover:z-[2] hover:scale-[1.035] focus-visible:z-[3]";
export const PICKED_Z = "z-[1]";
export const CARD_LIFTED = "z-[2] scale-[1.035]";

/** A pick (DESIGN §5.2): outlined 1.5 px in ink, 3 px off the frame. Ink, not accent — a
 *  selection is not one of the accent's seven jobs. */
export const PICKED_OUTLINE =
  "outline-solid outline-[1.5px] outline-ink outline-offset-3";

/** The mono caption under a picture, a story or the keep card. */
export const CARD_MONO = "font-mono text-[10.5px] uppercase leading-[1.3]";

/**
 * A picture filling its frame, or — with no picture, or one that fails to load — the label set
 * large on the card colour. The frame (size, aspect, outline) is the caller's `className`. Key it
 * on `src` where the same element is reused for another picture, so a failure is forgotten.
 */
export function CardPicture({
  src,
  label,
  fit = "cover",
  className,
}: {
  src?: string;
  label: string;
  /** `contain` for the desktop keep stack's whole picture; `cover` crops to the frame. */
  fit?: "cover" | "contain";
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = src !== undefined && !failed;
  return (
    <span
      className={cn(
        "bg-card relative block overflow-hidden",
        !showImage && "flex items-center justify-center",
        fit === "contain" && showImage && "bg-transparent",
        className,
      )}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          draggable={false}
          onError={() => setFailed(true)}
          className={cn(
            "absolute inset-0 h-full w-full",
            fit === "cover" ? "object-cover" : "object-contain",
          )}
        />
      ) : (
        <span className="text-ink-hi px-4 text-center text-[22px] leading-tight">
          {label}
        </span>
      )}
    </span>
  );
}

export interface FaceCardProps {
  /** What the answer is called — the accessible name, and the whole frame when there's no face. */
  label: string;
  /** The picture's `src` (already proxied — the CSP allows nothing else). Absent ⇒ text card. */
  src?: string;
  /** The picture's own title, printed in the caption. Absent (no face) ⇒ the caption is the
   *  mark alone — the label is already large in the frame. */
  title?: string;
  /** What leads the caption: the key that picks it (`1`…`4`) or the pair's arrow (`←` / `→`). */
  mark: string;
  /** The topics this answer would add; written to `data-topics` for the e2e helper to steer by. */
  topics: readonly string[];
  selected: boolean;
  onClick: () => void;
  /** The keyboard's cursor is on this card (keys.ts): it lifts, as the prototype's does. */
  cursor?: boolean;
}

export function FaceCard({
  label,
  src,
  title,
  mark,
  topics,
  selected,
  onClick,
  cursor = false,
}: FaceCardProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      data-topics={topics.join(" ")}
      data-cursor={cursor ? "true" : undefined}
      onClick={onClick}
      // No `overflow-hidden` here: the global focus ring is this button's outline, 3 px outside
      // it, and the frame below clips only the picture.
      className={cn(
        "block w-full cursor-pointer text-left",
        CARD_LIFT,
        selected && PICKED_Z,
        cursor && CARD_LIFTED,
      )}
    >
      <CardPicture
        key={src}
        src={src}
        label={label}
        className={cn(
          "aspect-[4/5] w-full transition-[outline-color] duration-150",
          selected && PICKED_OUTLINE,
        )}
      />
      <span
        className={cn(CARD_MONO, "text-ink/78 mt-2.5 flex gap-2.5")}
        aria-hidden="true"
      >
        <span className="text-ink/40">{mark}</span>
        {title && <span className="min-w-0">{title}</span>}
      </span>
    </button>
  );
}
