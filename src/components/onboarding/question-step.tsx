"use client";

import { Button } from "~/components/ui/button";
import { Chip } from "~/components/ui/chip";
import { Textarea } from "~/components/ui/textarea";
import { isAnswered, pickAnswer, toggleAnswer } from "~/lib/interview/answer";
import { EITHER, NEITHER } from "~/lib/interview/config";
import { optionAdds } from "~/lib/interview/targets";
import type { Answer, Option, Question } from "~/lib/interview/types";
import { faceKey, type QuestionFaces } from "~/lib/interview/faces";
import { rendersCards } from "~/lib/interview/layout";
import { READING_FALLBACK } from "~/lib/interview/reading-fallback";
import { cn } from "~/lib/utils";

import { FaceCard } from "./face-card";

// One question of the questionnaire, as a controlled component: it shows `answer` and reports
// every change — it holds no state, and knows nothing about what comes before or after. The
// screen (onboarding-screen.tsx) owns the answers, Back, the auto-advance and the keyboard.
//
// The contract with the shell (Task 6.4):
//
//   `onChange(answer, done)`  `done` is true when the press *is* the whole answer — a pair's
//                             side, a choice, a sentinel — and the shell shows it at once and
//                             moves on ADVANCE_MS (380 ms) later; Back in between cancels that.
//                             False when there may be more to say (a multi, typing): the shell
//                             just holds the draft.
//   `onContinue()`            leave now with the current answer — a blank one is a skip. Every
//                             screen's forward control calls it.
//   `busy`                    the shell is finishing (the model is mapping the words): the
//                             forward control shows `aria-busy` and the shell ignores presses.
//   `cursor`                  the keyboard's card (keys.ts), or null. On the keep stack it is the
//                             card under the stack, which ← / → decide.
//
// Until the question screens are drawn (Task 6.5) one generic forward button sits at the foot
// of every step, named for what it will do.
//
// Two attributes exist for the e2e helper and nothing else: `data-question-id` on the step, and
// `data-topics` on every answer — the topics it would add (see lib/interview/path.ts, the pure
// mirror of that helper).

/** A free-text answer's cap — the same number the server enforces (routers/onboarding.ts). */
export const MAX_ANSWER_TEXT = 500;

const COUNT_WORDS = ["", "one", "two", "three", "four"];

export interface QuestionStepProps {
  /** Already filtered by `askable` — only answers this database can honour. */
  question: Question;
  /** The pickable topic ids, for `data-topics`. */
  listed: ReadonlySet<string>;
  faces: QuestionFaces;
  /** The current answer, if any — a reader who came Back sees what they said. */
  answer: Answer | undefined;
  onChange: (answer: Answer, done: boolean) => void;
  /** Leave now with `answer` (blank → a skip). */
  onContinue: () => void;
  /** The shell is finishing: the forward control is busy. */
  busy?: boolean;
  /** The keyboard's card, by option index, or null. */
  cursor?: number | null;
}

/** The forward button, named for what it will do. Declining the destinations is a real answer,
 *  so it says so. (The reading screens said "I'd rather look at pictures" until Ben's 10-05-26
 *  critique; they skip like every other screen now, and a skip there is still counted.) */
export function forwardLabel(q: Question, answered: boolean): string {
  if (answered) return "Next";
  if (q.id === "destinations") return "Nowhere in particular";
  return "Skip";
}

export function QuestionStep({
  question,
  listed,
  faces,
  answer,
  onChange,
  onContinue,
  busy = false,
  cursor = null,
}: QuestionStepProps) {
  const keys = answer?.keys ?? [];
  const id = `q-${question.id}`;
  const topicsOf = (o: Option) => optionAdds(o, listed);
  /** A whole answer in one tap (answer.ts — the keyboard builds the same one). */
  const only = (key: string) =>
    onChange(pickAnswer(question, key, faces), true);
  // First Exhibition's card grids: a choice or multi whose every answer has a face (the wings,
  // the playoff, the keep grid, the reading cards), or any with a typeset card (destinations).
  // The same rule decides the screen's column (lib/interview/layout.ts), so it lives there.
  const allFaced =
    question.options.length > 0 && question.options.every((o) => o.face);
  const anyCard = question.options.some((o) => o.card);
  const asCards = rendersCards(question);
  const reading = question.options.some((o) => o.face?.writing);
  // The wings and the playoff — a faced *choice* that is not a reading screen — show their
  // pictures with no caption — "the picture should stand on its own" (Ben's critique, 10-05-26),
  // which named the wings only. The keep
  // grid (a multi) and the pairs keep their labels, the reading cards are text-led anyway.
  const quietFaces = question.kind === "choice" && allFaced && !reading;
  // A multi of things to keep *out* (Rather not): every effect it has takes topics down. It gets
  // a "Show it all" answer — NEITHER, which score.ts reads as "nothing to avoid".
  const avoiding =
    question.kind === "multi" &&
    question.options.every((o) => o.effects.every((e) => e.score < 0));
  /** Every answer is pressed — the Pick all chip shows pressed, and a press clears. */
  const allKept =
    question.options.length > 0 &&
    question.options.every((o) => keys.includes(o.key));

  /** A multi's press (answer.ts: a sentinel is replaced, the cap pushes out the oldest). */
  const toggle = (key: string) =>
    onChange(toggleAnswer(question, keys, key), false);

  return (
    <div
      data-question-id={question.id}
      data-question-kind={question.kind}
      data-max={question.max}
    >
      {/* `tabIndex={-1}`: focusable by script, not in the tab order — the screen moves focus here
          when a question arrives, so a screen reader reads the new prompt. */}
      <h1
        id={id}
        tabIndex={-1}
        className="text-ink-hi text-[30px] leading-[1.15] tracking-[-0.4px] outline-none"
      >
        {question.prompt}
      </h1>

      {question.kind === "text" && (
        <div className="mt-6">
          <Textarea
            aria-labelledby={id}
            rows={4}
            maxLength={MAX_ANSWER_TEXT}
            value={answer?.text ?? ""}
            onChange={(e) =>
              onChange(
                { questionId: question.id, keys: [], text: e.target.value },
                false,
              )
            }
          />
          <p className="text-ink/62 mt-3 text-[14px] leading-[1.5]">
            Say as much or as little as you like. We use it to choose where to
            start.
          </p>
          {/* The plain disclosure (plan §8): these words leave Ambit and are kept. */}
          <p className="text-ink/45 mt-2 text-[12.5px] leading-[1.5]">
            What you write here is sent to an AI service (OpenRouter) to match
            it to topics, and we keep it to learn what Ambit is missing.
          </p>
        </div>
      )}

      {question.kind === "pair" && (
        <div role="group" aria-labelledby={id} className="mt-6">
          {/* In the wide column a pair is held to ~370 px a side and centred — two pictures to
              compare, not a banner. */}
          <div className="grid grid-cols-2 gap-3 md:mx-auto md:max-w-[760px]">
            {question.options.map((o, i) => (
              <FaceCard
                key={o.key}
                label={o.label}
                src={faces[faceKey(question.id, o.key)]?.src}
                topics={topicsOf(o)}
                selected={keys.includes(o.key)}
                cursor={cursor === i}
                onClick={() => only(o.key)}
              />
            ))}
          </div>
          <div className="mt-4 flex justify-center gap-[10px]">
            <Chip
              size="sm"
              selected={keys[0] === EITHER}
              onClick={() => only(EITHER)}
            >
              Either
            </Chip>
            <Chip
              size="sm"
              selected={keys[0] === NEITHER}
              onClick={() => only(NEITHER)}
            >
              Neither
            </Chip>
          </div>
        </div>
      )}

      {asCards && (
        <div role="group" aria-labelledby={id} className="mt-6">
          {question.kind === "multi" && (
            <p className="text-ink/62 mb-4 text-[15px]">
              {question.max
                ? `Pick up to ${COUNT_WORDS[question.max] ?? question.max}.`
                : "Pick any."}
            </p>
          )}
          {/* Two across on a phone. From md, in the 1120 px wide column (layout.ts): the wings and
              the playoff four across (~265 px a card), the ten-picture keep grid five (~210 px),
              the four reading cards two by two at ~420 px each, the destinations three, four from
              xl. */}
          <div
            className={cn(
              "grid grid-cols-2 gap-3",
              anyCard
                ? "md:grid-cols-3 xl:grid-cols-4"
                : reading
                  ? "md:mx-auto md:max-w-[860px]"
                  : question.options.length > 4
                    ? "md:grid-cols-5"
                    : "md:grid-cols-4",
            )}
          >
            {question.options.map((o, i) => {
              const face = faces[faceKey(question.id, o.key)];
              const writing = o.face?.writing;
              return (
                <FaceCard
                  key={o.key}
                  label={o.label}
                  src={face?.src}
                  writing={face?.writing}
                  // No article behind a reading card: its kind and an example headline instead.
                  fallback={
                    writing && !face?.writing
                      ? {
                          kind: writing.kind,
                          ...READING_FALLBACK[writing.kind][writing.nth],
                        }
                      : undefined
                  }
                  card={o.card}
                  caption={!quietFaces}
                  topics={topicsOf(o)}
                  selected={keys.includes(o.key)}
                  cursor={cursor === i}
                  onClick={() =>
                    question.kind === "multi" ? toggle(o.key) : only(o.key)
                  }
                />
              );
            })}
          </div>
          {/* None of these: a faced choice whose answers carry effects (the wings, the playoff)
              — not the reading screens, whose decline is the screen's Skip button. */}
          {question.kind === "choice" &&
            allFaced &&
            question.options.some((o) => o.effects.length > 0) && (
              <div className="mt-4 flex justify-center">
                <Chip
                  size="sm"
                  selected={keys[0] === NEITHER}
                  onClick={() => only(NEITHER)}
                >
                  None of these
                </Chip>
              </div>
            )}
          {/* Pick all (Ben, 10-05-26): a picture multi with no cap — the keep grid. Pressed when
              every picture is kept, and pressing it then clears the step. Like a single tap it
              never moves on by itself (`done` is false): Next is still the reader's. No
              `data-topics`, so the e2e helper never mistakes it for an answer. */}
          {question.kind === "multi" && allFaced && !question.max && (
            <div className="mt-4 flex justify-center">
              <Chip
                size="sm"
                selected={allKept}
                onClick={() =>
                  onChange(
                    {
                      questionId: question.id,
                      keys: allKept ? [] : question.options.map((o) => o.key),
                    },
                    false,
                  )
                }
              >
                Pick all
              </Chip>
            </div>
          )}
        </div>
      )}

      {!asCards &&
        (question.kind === "choice" || question.kind === "multi") && (
          <>
            {question.kind === "multi" && (
              <p className="text-ink/62 mt-3 text-[15px]">
                {question.max
                  ? `Pick up to ${COUNT_WORDS[question.max] ?? question.max}.`
                  : "Pick any."}
              </p>
            )}
            <div
              role="group"
              aria-labelledby={id}
              className="mt-6 flex flex-wrap gap-[10px]"
            >
              {question.options.map((o, i) => (
                <Chip
                  key={o.key}
                  selected={keys.includes(o.key)}
                  data-topics={topicsOf(o).join(" ")}
                  data-cursor={cursor === i ? "true" : undefined}
                  // The keyboard's cursor reads as the hover does (Chip's own 1.05 lift).
                  className={cn(cursor === i && "border-ink/70 scale-[1.05]")}
                  onClick={() =>
                    question.kind === "multi" ? toggle(o.key) : only(o.key)
                  }
                >
                  {o.label}
                </Chip>
              ))}
            </div>
            {/* Show it all (Ben, 10-05-26): the explicit "nothing to keep out". One tap, and on —
                like None of these under the wings. No `data-topics`: not an answer to steer by. */}
            {avoiding && (
              <div className="mt-4">
                <Chip
                  size="sm"
                  selected={keys[0] === NEITHER}
                  onClick={() => only(NEITHER)}
                >
                  Show it all
                </Chip>
              </div>
            )}
          </>
        )}

      {/* The forward control — one for every step until Task 6.5 draws each screen's own. In the
          flow, under the step: nothing on these screens is `fixed`. */}
      <div className="mt-10 flex justify-end">
        <Button
          size="md"
          aria-busy={busy}
          onClick={() => {
            if (!busy) onContinue();
          }}
        >
          {forwardLabel(question, isAnswered(answer))}
        </Button>
      </div>
    </div>
  );
}
