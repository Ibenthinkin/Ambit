"use client";

import { Chip } from "~/components/ui/chip";
import { Textarea } from "~/components/ui/textarea";
import { EITHER, NEITHER } from "~/lib/interview/config";
import { optionAdds } from "~/lib/interview/targets";
import type { Answer, Option, Question } from "~/lib/interview/types";
import { faceKey, type QuestionFaces } from "~/lib/interview/faces";
import { READING_FALLBACK } from "~/lib/interview/reading-fallback";
import { cn } from "~/lib/utils";

import { FaceCard } from "./face-card";

// One question of the questionnaire, as a controlled component: it shows `answer` and reports
// every change — it holds no state, and knows nothing about what comes before or after. The
// screen (onboarding-screen.tsx) owns the answers, Skip, Back and Next.
//
// `onChange(answer, done)`: `done` is true when the tap *is* the whole answer — a pair, a choice,
// the reading amount — so the screen can move straight on, and false when there may be more to
// say (a multi's second answer, more typing).
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
}

export function QuestionStep({
  question,
  listed,
  faces,
  answer,
  onChange,
}: QuestionStepProps) {
  const keys = answer?.keys ?? [];
  const id = `q-${question.id}`;
  const topicsOf = (o: Option) => optionAdds(o, listed);
  /** A whole answer in one tap. A reading card also reports the article's topic memberships —
   *  choosing it scores *that piece* (score.ts), and the answer log keeps only the option key. */
  const only = (key: string) => {
    const w = faces[faceKey(question.id, key)]?.writing;
    onChange(
      w
        ? { questionId: question.id, keys: [key], topicIds: w.topicIds }
        : { questionId: question.id, keys: [key] },
      true,
    );
  };
  // First Exhibition's card grids: a choice or multi whose every answer has a face (the wings,
  // the playoff, the keep grid, the reading cards), or any with a typeset card (destinations).
  const allFaced =
    question.options.length > 0 && question.options.every((o) => o.face);
  const anyCard = question.options.some((o) => o.card);
  const asCards =
    (question.kind === "choice" || question.kind === "multi") &&
    (allFaced || anyCard);
  // The wings and the playoff — a faced *choice* that is not a reading screen — show their
  // pictures with no caption: the picture is the question (Ben's critique, 10-05-26). The keep
  // grid (a multi) and the pairs keep their labels, the reading cards are text-led anyway.
  const quietFaces =
    question.kind === "choice" &&
    allFaced &&
    !question.options.some((o) => o.face?.writing);

  function toggle(key: string) {
    let next: string[];
    if (keys.includes(key)) {
      next = keys.filter((k) => k !== key);
    } else {
      next = [...keys, key];
      // At the limit the newest answer pushes out the oldest, rather than the chip refusing to
      // press — a reader who changes their mind shouldn't have to un-press something first.
      if (question.max && next.length > question.max)
        next = next.slice(next.length - question.max);
    }
    onChange({ questionId: question.id, keys: next }, false);
  }

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
        className="text-ink-hi text-[30px] leading-[1.15] font-semibold tracking-[-0.4px] outline-none"
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
          <div className="grid grid-cols-2 gap-3">
            {question.options.map((o) => (
              <FaceCard
                key={o.key}
                label={o.label}
                src={faces[faceKey(question.id, o.key)]?.src}
                topics={topicsOf(o)}
                selected={keys.includes(o.key)}
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
          {/* Two across on a phone; from md, four across — five for the ten-picture keep grid. */}
          <div
            className={cn(
              "grid gap-3",
              question.options.length > 4
                ? "grid-cols-2 md:grid-cols-5"
                : "grid-cols-2 md:grid-cols-4",
            )}
          >
            {question.options.map((o) => {
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
        </div>
      )}

      {!asCards &&
        (question.kind === "choice" ||
          question.kind === "multi" ||
          question.kind === "amount") && (
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
              {question.options.map((o) => (
                <Chip
                  key={o.key}
                  selected={keys.includes(o.key)}
                  data-topics={topicsOf(o).join(" ")}
                  onClick={() =>
                    question.kind === "multi" ? toggle(o.key) : only(o.key)
                  }
                >
                  {o.label}
                </Chip>
              ))}
            </div>
          </>
        )}
    </div>
  );
}
