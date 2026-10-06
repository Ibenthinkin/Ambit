"use client";

import type { ComponentProps, ReactNode } from "react";

import { Button } from "~/components/ui/button";
import { Chip } from "~/components/ui/chip";
import { pickAnswer, toggleAnswer } from "~/lib/interview/answer";
import { EITHER, NEITHER } from "~/lib/interview/config";
import { faceKey, type QuestionFaces } from "~/lib/interview/faces";
import { keyKindOf } from "~/lib/interview/layout";
import { READING_FALLBACK } from "~/lib/interview/reading-fallback";
import { optionAdds } from "~/lib/interview/targets";
import type { Answer, Option, Question } from "~/lib/interview/types";
import { cn } from "~/lib/utils";

import { BonusStep } from "./bonus-step";
import { FaceCard } from "./face-card";
import { KeepStack } from "./keep-stack";
import { PlaceCard } from "./place-card";
import { StoryCard } from "./story-card";

// One question of the questionnaire, as a controlled component: it shows `answer` and reports
// every change — it holds no state, and knows nothing about what comes before or after. The
// screen (onboarding-screen.tsx) owns the answers, Back, the auto-advance, the keyboard and the
// keep stack's position.
//
// The contract with the shell (Task 6.4, finished in 6.5):
//
//   `onChange(answer, done)`  `done` is true when the press *is* the whole answer — a pair's
//                             side, a choice, a sentinel — and the shell shows it at once and
//                             moves on ADVANCE_MS (380 ms) later; Back in between cancels that.
//                             False when there may be more to say (a multi, typing): the shell
//                             just holds the draft.
//   `onContinue()`            leave now with the current answer — a blank one is a skip.
//   `onSkip()`                leave now with a skip, whatever is pressed: the reading screens'
//                             "I’d rather look at pictures" and the destinations' "Nowhere in
//                             particular", both declines rather than answers.
//   `onStack(keep)`           one keep-or-pass decision — the shell's `decideCard`, which the
//                             ← / → keys call too, so the buttons and the keys are one model.
//   `busy`                    the shell is finishing (the model is mapping the words): the
//                             forward control shows `aria-busy` and the shell ignores presses.
//   `cursor`                  the keyboard's card (keys.ts), or null. On the keep stack it is the
//                             card under the stack.
//
// Which layout a question takes is keys.ts's name for it (`keyKindOf`) — the keyboard and the
// screen can't disagree about what kind of screen is up. DESIGN_redesign §5.2 draws each:
//
//   rooms   a faced choice — the wings and the playoff: four 4:5 pictures, "None of these"
//   pairs   a pair: two pictures, "Both, equally", a quiet "Neither" link
//   keep    a faced multi with no cap: one picture at a time (keep-stack.tsx)
//   read    a choice of article cards (story-card.tsx), "I’d rather look at pictures"
//   travel  a multi of typeset cards (place-card.tsx), Continue · "Nowhere in particular"
//   avoid   a multi of words — chips; on Rather not, Continue · "Show me everything"
//   text    the bonus question (bonus-step.tsx)
//   none    a choice of words — chips (no screen in bank v3 has one; the engine's tests do)
//
// Two attributes exist for the e2e helper and nothing else: `data-question-id` on the step, and
// `data-topics` on every answer — the topics it would add (see lib/interview/path.ts, the pure
// mirror of that helper). The keep stack's Keep button carries the current card's.

const COUNT_WORDS = [
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

export interface QuestionStepProps {
  /** Already filtered by `askable` — only answers this database can honour. */
  question: Question;
  /** The pickable topic ids, for `data-topics` and the bonus question's mapped list. */
  listed: ReadonlySet<string>;
  faces: QuestionFaces;
  /** The current answer, if any — a reader who came Back sees what they said. */
  answer: Answer | undefined;
  onChange: (answer: Answer, done: boolean) => void;
  /** Leave now with `answer` (blank → a skip). */
  onContinue: () => void;
  /** Leave now with a skip. Defaults to `onContinue` for a caller that has no draft to drop. */
  onSkip?: () => void;
  /** One keep-or-pass decision on the keep stack (the shell's `decideCard`). */
  onStack?: (keep: boolean) => void;
  /** The shell is finishing: the forward control is busy. */
  busy?: boolean;
  /** The keyboard's card, by option index, or null. */
  cursor?: number | null;
  /** The bonus question's live mapping (`onboarding.interpret`); `undefined` on a failure. */
  mapWords?: (
    questionId: string,
    text: string,
  ) => Promise<string[] | undefined>;
  /** Topic names by id — the bonus question lists what the words mapped to. */
  labels?: ReadonlyMap<string, string>;
  /** Where this question sits among its step's — "Set 2 of 2" on the reading screens. */
  set?: { n: number; of: number };
}

/** The screen's own sub-line (the prototype's grey line under the question). */
function Lede({ children }: { children: ReactNode }) {
  return (
    <p className="text-ink/62 mt-3 max-w-[720px] text-[clamp(16px,1.8cqw,19px)] leading-[1.45]">
      {children}
    </p>
  );
}

/** The row under a screen: its buttons, then a mono hint. */
function Footer({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mt-7 flex flex-wrap items-center gap-6">
      {children}
      {hint && (
        <span className="text-ink/40 font-mono text-[11px] uppercase">
          {hint}
        </span>
      )}
    </div>
  );
}

/** The outline button under the picture screens — None of these, Both, I’d rather… */
function Outline(props: ComponentProps<typeof Button>) {
  return (
    <Button variant="outline" className="h-auto px-[22px] py-3" {...props} />
  );
}

export function QuestionStep({
  question,
  listed,
  faces,
  answer,
  onChange,
  onContinue,
  onSkip = onContinue,
  onStack,
  busy = false,
  cursor = null,
  mapWords,
  labels,
  set,
}: QuestionStepProps) {
  const keys = answer?.keys ?? [];
  const id = `q-${question.id}`;
  const layout = keyKindOf(question);
  const topicsOf = (o: Option) => optionAdds(o, listed);
  /** A whole answer in one tap (answer.ts — the keyboard builds the same one). */
  const only = (key: string) =>
    onChange(pickAnswer(question, key, faces), true);
  /** A multi's press (answer.ts: a sentinel is replaced, the cap pushes out the oldest). */
  const toggle = (key: string) =>
    onChange(toggleAnswer(question, keys, key), false);
  /** Every forward control: ignored while the shell is finishing. */
  const forward = (go: () => void) => () => {
    if (!busy) go();
  };

  const heading = (
    <h1
      id={id}
      tabIndex={-1}
      className="text-ink-hi text-[clamp(34px,6cqw,72px)] leading-[1.04] tracking-[-0.025em] text-balance outline-none"
    >
      {question.prompt}
    </h1>
  );

  let body: ReactNode;
  switch (layout) {
    // ── Rooms: the wings and the playoff ────────────────────────────────────────────────────
    case "rooms": {
      const n = question.options.length;
      body = (
        <>
          {heading}
          <Lede>Pick one. Go with your first instinct.</Lede>
          {/* Two across on a phone, four across from ~620 px (auto-fit: never an empty track). */}
          <div
            role="group"
            aria-labelledby={id}
            className="mt-8 grid grid-cols-[repeat(auto-fit,minmax(min(100%,150px),1fr))] gap-1"
          >
            {question.options.map((o, i) => {
              const face = faces[faceKey(question.id, o.key)];
              return (
                <FaceCard
                  key={o.key}
                  label={o.label}
                  src={face?.src}
                  title={face?.title}
                  mark={String(i + 1)}
                  topics={topicsOf(o)}
                  selected={keys.includes(o.key)}
                  cursor={cursor === i}
                  onClick={() => only(o.key)}
                />
              );
            })}
          </div>
          {/* None of these is an answer (NEITHER scores the starters down), offered where the
              answers carry effects — every wing and playoff screen. */}
          {question.options.some((o) => o.effects.length > 0) && (
            <Footer hint={`Keys 1 to ${Math.min(n, 4)}, or N for none`}>
              <Outline
                aria-pressed={keys[0] === NEITHER}
                onClick={() => only(NEITHER)}
              >
                None of these
              </Outline>
            </Footer>
          )}
        </>
      );
      break;
    }

    // ── Pairs: hands and feeling ────────────────────────────────────────────────────────────
    case "pairs":
      body = (
        <>
          {heading}
          <div
            role="group"
            aria-labelledby={id}
            className="mt-8 grid max-w-[900px] grid-cols-2 gap-1"
          >
            {question.options.map((o, i) => {
              const face = faces[faceKey(question.id, o.key)];
              return (
                <FaceCard
                  key={o.key}
                  label={o.label}
                  src={face?.src}
                  title={face?.title}
                  mark={i === 0 ? "←" : "→"}
                  topics={topicsOf(o)}
                  selected={keys.includes(o.key)}
                  cursor={cursor === i}
                  onClick={() => only(o.key)}
                />
              );
            })}
          </div>
          {/* Decision 9: "Both, equally" as the outline button and a quiet "Neither" link —
              EITHER and NEITHER, scored as they always were. */}
          <Footer hint="Arrow keys, or B for both">
            <Outline
              aria-pressed={keys[0] === EITHER}
              onClick={() => only(EITHER)}
            >
              Both, equally
            </Outline>
            <Button
              variant="link"
              aria-pressed={keys[0] === NEITHER}
              onClick={() => only(NEITHER)}
            >
              Neither
            </Button>
          </Footer>
        </>
      );
      break;

    // ── Keep or pass ────────────────────────────────────────────────────────────────────────
    case "keep":
      body = (
        <KeepStack
          question={question}
          faces={faces}
          listed={listed}
          at={cursor ?? 0}
          onStack={(keep) => onStack?.(keep)}
          headingId={id}
        />
      );
      break;

    // ── Which would you open? ───────────────────────────────────────────────────────────────
    case "read": {
      const n = question.options.length;
      body = (
        <>
          {heading}
          <Lede>
            {COUNT_WORDS[n] ?? n} pieces from the feed. Pick the one you’d read
            first.{set && set.of > 1 && ` Set ${set.n} of ${set.of}.`}
          </Lede>
          <div
            role="group"
            aria-labelledby={id}
            className="mt-8 grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-x-6"
          >
            {question.options.map((o, i) => {
              const face = faces[faceKey(question.id, o.key)];
              const writing = o.face?.writing;
              return (
                <StoryCard
                  key={o.key}
                  label={o.label}
                  num={String(i + 1)}
                  src={face?.src}
                  writing={face?.writing}
                  // No article behind the card: its kind and an example headline instead.
                  fallback={
                    writing && !face?.writing
                      ? {
                          kind: writing.kind,
                          ...READING_FALLBACK[writing.kind][writing.nth],
                        }
                      : undefined
                  }
                  topics={topicsOf(o)}
                  selected={keys.includes(o.key)}
                  cursor={cursor === i}
                  onClick={() => only(o.key)}
                />
              );
            })}
          </div>
          {/* Declining is a skip, not an answer: the reveal's Reading row reads it. */}
          <Footer hint={`Keys 1 to ${Math.min(n, 4)}`}>
            <Outline aria-busy={busy} onClick={forward(onSkip)}>
              I’d rather look at pictures
            </Outline>
          </Footer>
        </>
      );
      break;
    }

    // ── Where would you go next? ────────────────────────────────────────────────────────────
    case "travel": {
      const max = question.max;
      const chosen = keys.filter((k) =>
        question.options.some((o) => o.key === k),
      ).length;
      const full = max !== undefined && chosen >= max;
      body = (
        <>
          {heading}
          <Lede>
            {max
              ? `Choose up to ${COUNT_WORDS[max]?.toLowerCase() ?? max}. `
              : ""}
            We don’t use these as places; they tell us what kind of world you’re
            drawn to.
          </Lede>
          <div
            role="group"
            aria-labelledby={id}
            className="mt-8 grid grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))] gap-x-6"
          >
            {question.options.map((o, i) =>
              o.card ? (
                <PlaceCard
                  key={o.key}
                  label={o.label}
                  card={o.card}
                  topics={topicsOf(o)}
                  selected={keys.includes(o.key)}
                  dim={full && !keys.includes(o.key)}
                  cursor={cursor === i}
                  onClick={() => toggle(o.key)}
                />
              ) : (
                <Chip
                  key={o.key}
                  selected={keys.includes(o.key)}
                  data-topics={topicsOf(o).join(" ")}
                  onClick={() => toggle(o.key)}
                >
                  {o.label}
                </Chip>
              ),
            )}
          </div>
          <Footer hint={max ? `${chosen} of ${max} chosen` : undefined}>
            <Button
              className="px-[30px]"
              aria-busy={busy}
              onClick={forward(onContinue)}
            >
              Continue
            </Button>
            <Button variant="link" aria-busy={busy} onClick={forward(onSkip)}>
              Nowhere in particular
            </Button>
          </Footer>
        </>
      );
      break;
    }

    // ── The bonus question ──────────────────────────────────────────────────────────────────
    case "text":
    case "bonus":
      body = (
        <BonusStep
          question={question}
          answer={answer}
          onChange={onChange}
          onContinue={onContinue}
          busy={busy}
          mapWords={mapWords}
          listed={listed}
          labels={labels}
          headingId={id}
        />
      );
      break;

    // ── Words: Rather not (a multi), and a plain choice ─────────────────────────────────────
    default: {
      const multi = question.kind === "multi";
      // A multi of things to keep *out*: every effect it has takes topics down. Its decline is
      // "Show me everything" — NEITHER, which score.ts reads as "nothing to avoid".
      const avoiding =
        multi &&
        question.options.every((o) => o.effects.every((e) => e.score < 0));
      const chosen = keys.filter((k) =>
        question.options.some((o) => o.key === k),
      ).length;
      body = (
        <>
          {heading}
          {avoiding && (
            // Adapted from the prototype's "We keep these out of your feed": the answer only
            // scores topics down (design D3), so the line promises no filter.
            <Lede>
              We show less of these. You can change this at the end, or any time
              later.
            </Lede>
          )}
          <div
            role="group"
            aria-labelledby={id}
            className="mt-8 flex max-w-[900px] flex-wrap gap-2"
          >
            {question.options.map((o, i) => (
              <Chip
                key={o.key}
                selected={keys.includes(o.key)}
                data-topics={topicsOf(o).join(" ")}
                data-cursor={cursor === i ? "true" : undefined}
                // The keyboard's cursor reads as the hover does (Chip's own 1.05 lift).
                className={cn(cursor === i && "border-ink/70 scale-[1.05]")}
                onClick={() => (multi ? toggle(o.key) : only(o.key))}
              >
                {o.label}
              </Chip>
            ))}
          </div>
          {multi ? (
            <Footer
              hint={
                question.max ? `${chosen} of ${question.max} chosen` : undefined
              }
            >
              <Button
                className="px-[30px]"
                aria-busy={busy}
                onClick={forward(onContinue)}
              >
                Continue
              </Button>
              {avoiding && (
                <Button variant="link" onClick={() => only(NEITHER)}>
                  Show me everything
                </Button>
              )}
            </Footer>
          ) : (
            // A choice of words is a tap; a reader with nothing to say skips it.
            <Footer>
              <Button variant="link" aria-busy={busy} onClick={forward(onSkip)}>
                Skip
              </Button>
            </Footer>
          )}
        </>
      );
    }
  }

  return (
    <div
      data-question-id={question.id}
      data-question-kind={question.kind}
      data-max={question.max}
    >
      {body}
    </div>
  );
}
