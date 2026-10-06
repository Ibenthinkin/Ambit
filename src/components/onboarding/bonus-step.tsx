"use client";

import { useEffect, useEffectEvent, useRef } from "react";

import { Button } from "~/components/ui/button";
import { Eyebrow } from "~/components/ui/eyebrow";
import { Input } from "~/components/ui/input";
import type { Answer, Question } from "~/lib/interview/types";

// The bonus question (DESIGN_redesign §5.2): one free-text answer — "Name one thing you could read
// about for hours." — typed into an underline input. When the reader pauses, the words are mapped
// to topics (`onboarding.interpret`, through the shell's `mapWords`) and the **real** topics they
// landed on are listed under the box: "Mapped to three topics.", one hairline row each — no why,
// no score, nothing Ambit does not have (decision 4).
//
// The mapping rides on the answer: the result is reported as the same answer with `topicIds`, so
// the shell skips its own call on Continue when the words have not changed since (an edit that
// changes them drops `topicIds`). A failure, a timeout or a refusal shows nothing and blocks
// nothing — the shell asks once more on Continue, and goes on whatever it hears.
//
// The disclosure keeps its two facts on screen, as SPEC §3.2 requires: the words go to an AI
// service (OpenRouter), and Ambit keeps them.

/** A free-text answer's cap — the same number the server enforces (routers/onboarding.ts). */
export const MAX_ANSWER_TEXT = 500;
/** How long a pause in typing is before the words are mapped (DESIGN §5.2, "~800 ms"). */
export const BONUS_DEBOUNCE_MS = 800;
/** Fewer characters than this is not worth a model call. */
export const BONUS_MIN_CHARS = 3;

const WORDS = [
  "no",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
];

export interface BonusStepProps {
  question: Question;
  answer: Answer | undefined;
  onChange: (answer: Answer, done: boolean) => void;
  onContinue: () => void;
  busy: boolean;
  /** Maps the words to topic ids; `undefined` when the call failed. Absent ⇒ no live mapping. */
  mapWords?: (
    questionId: string,
    text: string,
  ) => Promise<string[] | undefined>;
  /** The pickable topics and their names — the mapped list shows only these. */
  listed: ReadonlySet<string>;
  labels?: ReadonlyMap<string, string>;
  headingId: string;
}

export function BonusStep({
  question,
  answer,
  onChange,
  onContinue,
  busy,
  mapWords,
  listed,
  labels,
  headingId,
}: BonusStepProps) {
  const input = useRef<HTMLInputElement>(null);
  const text = answer?.text ?? "";
  const words = text.trim();
  const mapped = answer?.topicIds !== undefined;

  // Reads the latest answer when a result lands, not the one the request was made from.
  const report = useEffectEvent((asked: string, topicIds: string[]) => {
    const now = answer?.text ?? "";
    // The words moved on while the model thought: this mapping is not theirs.
    if (now.trim() !== asked) return;
    onChange({ questionId: question.id, keys: [], text: now, topicIds }, false);
  });

  useEffect(() => {
    if (busy || !mapWords || mapped || words.length < BONUS_MIN_CHARS) return;
    // `live` drops a result whose words were edited, or whose screen was left, before it landed.
    let live = true;
    const timer = setTimeout(() => {
      void mapWords(question.id, words).then((ids) => {
        if (live && ids !== undefined) report(words, ids);
      });
    }, BONUS_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [busy, mapWords, mapped, words, question.id]);

  /** An edit. Whitespace at the ends does not change the words, so it keeps their mapping. */
  function edit(value: string) {
    const keep = answer?.topicIds !== undefined && value.trim() === words;
    onChange(
      {
        questionId: question.id,
        keys: [],
        text: value,
        ...(keep ? { topicIds: answer.topicIds } : {}),
      },
      false,
    );
  }

  const shown = (answer?.topicIds ?? []).filter((id) => listed.has(id));

  return (
    <>
      <Eyebrow as="p" className="block text-[11px]">
        Bonus question
      </Eyebrow>
      <h1
        id={headingId}
        tabIndex={-1}
        className="text-ink-hi mt-4 text-[clamp(34px,6cqw,72px)] leading-[1.04] tracking-[-0.025em] text-balance outline-none"
      >
        {question.prompt}
      </h1>
      {/* The disclosure (SPEC §3.2), in the sub-line: sent to OpenRouter, and kept. */}
      <p className="text-ink/62 mt-3 max-w-[720px] text-[clamp(16px,1.8cqw,19px)] leading-[1.45]">
        Optional. A place, a period, an object, an obsession. It is sent to an
        AI service (OpenRouter) to match it to topics, and we keep it to learn
        what Ambit is missing.
      </p>
      <Input
        ref={input}
        aria-labelledby={headingId}
        maxLength={MAX_ANSWER_TEXT}
        value={text}
        placeholder="Lighthouses, Persian carpets, old seed catalogues"
        onChange={(e) => edit(e.target.value)}
        className="mt-7 max-w-[720px] py-3.5 text-[clamp(20px,2.4cqw,28px)]"
      />
      {shown.length > 0 && (
        <div className="mt-7 max-w-[720px]" aria-live="polite">
          <p className="text-ink/78 border-ink/16 border-b pb-3 text-[16px]">
            Mapped to {WORDS[shown.length] ?? shown.length}{" "}
            {shown.length === 1 ? "topic" : "topics"}.
          </p>
          <ul>
            {shown.map((id) => (
              <li
                key={id}
                data-mapped-topic={id}
                className="text-ink-hi border-ink/8 border-b py-3 text-[17px]"
              >
                {labels?.get(id) ?? id}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-8 flex flex-wrap items-center gap-6">
        <Button
          aria-busy={busy}
          className="px-[30px]"
          onClick={() => {
            if (!busy) onContinue();
          }}
        >
          Continue to your exhibition
        </Button>
        <Button
          variant="link"
          onClick={() => {
            onChange({ questionId: question.id, keys: [], text: "" }, false);
            input.current?.focus();
          }}
        >
          Clear and try again
        </Button>
      </div>
    </>
  );
}
