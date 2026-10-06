"use client";

import { Button } from "~/components/ui/button";
import { DESKTOP_QUERY, useMediaQuery } from "~/hooks/use-media-query";
import { faceKey, type QuestionFaces } from "~/lib/interview/faces";
import { optionAdds } from "~/lib/interview/targets";
import type { Question } from "~/lib/interview/types";
import { cn } from "~/lib/utils";

import { CARD_MONO, CardPicture } from "./face-card";

// Keep or pass (DESIGN_redesign §5.2; decision 10): the keep question's pictures one at a time,
// each decided with Pass or Keep. Pass scores nothing — the answer is still just the kept keys,
// exactly what the old grid's un-pressed pictures meant.
//
// **One model, two hands.** The stack's position and every decision belong to the shell
// (onboarding-screen.tsx's `stackAt` and `decideCard`), so these buttons and the ← / → keys are
// the same press: the buttons call `onStack(keep)`, the keys call `decideCard` directly. The last
// decision is the whole answer and auto-advances after the shell's beat.
//
// Two layouts. A phone: the heading, one 4:5 card (max 440 px) with its title and tag under it,
// then ← Pass · `01 / 10` · Keep →. A computer (`md`): two columns — a left rail of a header row,
// one tick per card, "Would you keep this one?", the card's title and tag, the two buttons and a
// key hint; on the right the whole picture, contained, up to 72vh.
//
// The Keep button carries the card's `data-topics`: the e2e helper steers by it, as it does by a
// card everywhere else. Pass carries none — passing is never how a wanted topic is reached.

export interface KeepStackProps {
  question: Question;
  faces: QuestionFaces;
  listed: ReadonlySet<string>;
  /** The card under the stack — how many have been decided (the shell's `stackAt`). */
  at: number;
  onStack: (keep: boolean) => void;
  /** The heading's id — the shell focuses it when the question arrives. */
  headingId: string;
}

/** "Ten", for "Ten quick ones." — a count of the cards actually on the stack (a narrow database
 *  asks fewer). */
const COUNT = [
  "No",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
];
const pad = (n: number) => String(n).padStart(2, "0");

export function KeepStack({
  question,
  faces,
  listed,
  at,
  onStack,
  headingId,
}: KeepStackProps) {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const total = question.options.length;
  // Past the last card the answer is waiting out its beat: the last card stays up meanwhile.
  const idx = Math.min(at, total - 1);
  const card = question.options[idx];
  if (!card) return null;
  const face = faces[faceKey(question.id, card.key)];
  const title = face?.title ?? card.label;
  // The tag is the card's own label (a kind of picture, like the prototype's "Space" or
  // "Painting") — unless there is no face, when the label is already the title.
  const tag = face ? card.label : undefined;
  const count = `${pad(idx + 1)} / ${pad(total)}`;
  const quick = `${COUNT[total] ?? total} quick ${total === 1 ? "one" : "ones"}.`;

  // The card that's up is announced as it changes (a screen reader hears each new title after a
  // Keep or a Pass), and both buttons are described by it: "Keep, A maid pouring milk".
  const cardId = `${headingId}-card`;
  const pass = (
    <Button
      variant="outline"
      aria-describedby={cardId}
      onClick={() => onStack(false)}
      className={desktop ? "h-14 text-[16px]" : "h-auto py-[13px]"}
    >
      <span aria-hidden="true">←</span> Pass
    </Button>
  );
  const keep = (
    <Button
      data-topics={optionAdds(card, listed).join(" ")}
      aria-describedby={cardId}
      onClick={() => onStack(true)}
      className={desktop ? "h-14 text-[16px]" : "h-auto py-[14px]"}
    >
      Keep <span aria-hidden="true">→</span>
    </Button>
  );

  if (desktop) {
    return (
      <div
        role="group"
        aria-labelledby={headingId}
        className="grid min-h-[min(76vh,760px)] grid-cols-[minmax(260px,1fr)_minmax(0,1.25fr)] items-center gap-[clamp(40px,6cqw,96px)]"
      >
        <div className="flex max-w-[400px] flex-col">
          <div className="border-ink/16 text-ink/55 flex justify-between border-b pb-3 font-mono text-[11px] tracking-[0.4px] uppercase">
            <span>Keep or pass</span>
            <span>{count}</span>
          </div>
          {/* One tick per card: decided ink, current accent (accent job 2), to come ink/16. */}
          <div
            aria-hidden="true"
            className="mt-3 grid gap-[3px]"
            style={{ gridTemplateColumns: `repeat(${total}, 1fr)` }}
          >
            {question.options.map((o, i) => (
              <div
                key={o.key}
                data-tick={i < idx ? "done" : i === idx ? "current" : "todo"}
                className={cn(
                  "h-[2px]",
                  i < idx ? "bg-ink" : i === idx ? "bg-accent" : "bg-ink/16",
                )}
              />
            ))}
          </div>
          <h1
            id={headingId}
            tabIndex={-1}
            className="text-ink-hi mt-9 text-[clamp(30px,3.2cqw,40px)] leading-[1.1] tracking-[-0.02em] outline-none"
          >
            Would you keep this one?
          </h1>
          <p className="text-ink/68 mt-3.5 text-[16px] leading-[1.5]">
            {quick} Go with your gut.
          </p>
          <div
            data-keep-card
            aria-live="polite"
            aria-atomic="true"
            className="border-ink/16 mt-9 border-t pt-4"
          >
            <p id={cardId} className="text-ink-hi text-[17px]">
              {title}
            </p>
            {tag && <p className={cn(CARD_MONO, "text-ink/48 mt-1")}>{tag}</p>}
          </div>
          <div className="mt-8 grid grid-cols-2 gap-2">
            {pass}
            {keep}
          </div>
          <p className={cn(CARD_MONO, "text-ink/34 mt-3.5")}>
            Arrow keys work too
          </p>
        </div>
        <CardPicture
          key={face?.src ?? card.key}
          src={face?.src}
          label={card.label}
          fit="contain"
          className="h-[min(72vh,720px)] w-full"
        />
      </div>
    );
  }

  return (
    <div role="group" aria-labelledby={headingId}>
      <h1
        id={headingId}
        tabIndex={-1}
        className="text-ink-hi text-[clamp(34px,6cqw,72px)] leading-[1.04] tracking-[-0.025em] outline-none"
      >
        {question.prompt}
      </h1>
      <p className="text-ink/62 mt-3 text-[clamp(16px,1.8cqw,19px)]">
        {quick} Tap a button, or use the arrow keys.
      </p>
      <div className="mx-auto mt-8 max-w-[440px]">
        <CardPicture
          key={face?.src ?? card.key}
          src={face?.src}
          label={card.label}
          className="aspect-[4/5] w-full"
        />
        <div
          data-keep-card
          aria-live="polite"
          aria-atomic="true"
          className={cn(CARD_MONO, "text-ink/78 mt-2.5 flex justify-between")}
        >
          <span id={cardId}>{title}</span>
          {tag && <span className="text-ink/40">{tag}</span>}
        </div>
        <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          {pass}
          <span className="text-ink/55 font-mono text-[11px]">{count}</span>
          {keep}
        </div>
      </div>
    </div>
  );
}
