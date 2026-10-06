"use client";

import type { FallbackCard } from "~/lib/interview/reading-fallback";
import { cn } from "~/lib/utils";
import { WRITING_KIND_LABELS, type WritingKind } from "~/server/config/writing";

import {
  CARD_LIFT,
  CARD_LIFTED,
  CARD_MONO,
  CardPicture,
  PICKED_OUTLINE,
} from "./face-card";

// A reading screen's card — "Which would you open?" (DESIGN_redesign §5.2): a real piece from the
// corpus, set like a story in a magazine's contents. A 4:3 picture when the piece has one, a
// hairline, the kind and reading time on the left and the card's number on the right, the title,
// one line of dek.
//
// With no article of that kind in this database (CI, a fresh install) the card is the kind and an
// example headline (`fallback`, lib/interview/reading-fallback.ts), so it is never a bare word.
// The accessible name is the real title when there is one, the answer's label otherwise.

export interface StoryCardProps {
  label: string;
  /** The card's number — the key that picks it. */
  num: string;
  src?: string;
  writing?: { kind: WritingKind; minutes: number; title: string; dek: string };
  fallback?: { kind: WritingKind } & FallbackCard;
  topics: readonly string[];
  selected: boolean;
  cursor?: boolean;
  onClick: () => void;
}

export function StoryCard({
  label,
  num,
  src,
  writing,
  fallback,
  topics,
  selected,
  cursor = false,
  onClick,
}: StoryCardProps) {
  const kind = writing?.kind ?? fallback?.kind;
  const kicker = writing
    ? `${WRITING_KIND_LABELS[writing.kind]} · ${writing.minutes} min`
    : kind
      ? WRITING_KIND_LABELS[kind]
      : label;
  const title = writing?.title ?? fallback?.title ?? label;
  const dek = writing ? writing.dek : fallback?.dek;
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={writing ? writing.title : label}
      data-topics={topics.join(" ")}
      data-cursor={cursor ? "true" : undefined}
      onClick={onClick}
      className={cn(
        "block w-full cursor-pointer pb-7 text-left",
        CARD_LIFT,
        cursor && CARD_LIFTED,
      )}
    >
      {/* The pick's outline goes round the card's content, not the button — the button's own
          outline is the keyboard's focus ring. */}
      <span className={cn("block", selected && PICKED_OUTLINE)}>
        {src !== undefined && (
          <CardPicture
            key={src}
            src={src}
            label={title}
            className="aspect-[4/3] w-full"
          />
        )}
        <span
          className={cn(
            "border-ink/22 block border-t pt-3",
            src !== undefined && "mt-3",
          )}
        >
          <span className={cn(CARD_MONO, "text-ink/55 flex justify-between")}>
            <span>{kicker}</span>
            <span>{num}</span>
          </span>
          <span className="text-ink-hi mt-3.5 block text-[clamp(22px,2.6cqw,30px)] leading-[1.15] tracking-[-0.015em] text-balance">
            {title}
          </span>
          {dek && (
            <span className="text-ink/62 mt-2.5 block text-[15px] leading-[1.45]">
              {dek}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
