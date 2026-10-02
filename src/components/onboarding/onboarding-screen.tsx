"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Button } from "~/components/ui/button";
import { Column } from "~/components/ui/column";
import { Rise } from "~/components/ui/rise";
import { askable } from "~/lib/interview/askable";
import { BANK_VERSION, QUESTIONS, STARTER_TOPICS } from "~/lib/interview/bank";
import { SKIP } from "~/lib/interview/config";
import type { QuestionFaces } from "~/lib/interview/faces";
import { picksFrom, readingAmountFrom, type Pick } from "~/lib/interview/picks";
import { scoreAnswers } from "~/lib/interview/score";
import type { Answer, Question } from "~/lib/interview/types";
import { api } from "~/trpc/react";

import { AboutStep, type About } from "./about-step";
import { QuestionStep } from "./question-step";
import { RevealStep } from "./reveal-step";
import { StepBar } from "./step-bar";

// Onboarding as a questionnaire (10-02-26, docs/PLAN_onboarding-questionnaire.md) — the screen a
// freshly invited sign-up lands on before ever seeing a feed, and the one "Retake the questions"
// on /profile/topics comes back to.
//
// It replaced four stages of chips (Subject / Medium / Look / Place) after Ben's verdict that
// facets and umbrella groups mean nothing to a reader. Now: about a dozen skippable questions
// that feel like getting to know someone — two free-text ones, picture face-offs, a few word
// questions — then an optional "About you", then a **reveal**: "Here's where we'll start", every
// proposed topic at a little / some / a lot / off.
//
// How it holds together:
//
//   intro → questions → (interpreting) → about → reveal → /feed
//
//   - **The state is the list of answers.** The question on screen is `asked[answers.length]`;
//     answering appends, Back pops (and shows what was popped, so a reader can change it). There
//     is no separate "current index" to drift out of step with the answers.
//   - **Everything topic-shaped is pure and client-side** (src/lib/interview/): which questions
//     this database can ask, what the answers score, what the reveal proposes.
//   - **Two server calls, both at the end.** `onboarding.interpret` once, on leaving the last
//     question, if anything was typed — and the flow goes on whether or not it answers.
//     `onboarding.complete` once, from the reveal. Until then nothing is written, so closing the
//     tab half-way leaves no trace and `/feed` still sends the reader back here.

type Phase = "intro" | "questions" | "interpreting" | "about" | "reveal";

export interface OnboardingScreenProps {
  /** `topics.list` — every pickable topic in this database. */
  topics: { id: string; label: string }[];
  /** The picture for each face-off card (services/question-faces.ts); missing ones are text. */
  faces: QuestionFaces;
  /** A signed-up reader retaking the questions: the result *replaces* their topics. */
  retake: boolean;
  /** The questions — the real bank unless a test brings its own. */
  bank?: readonly Question[];
  /** What a too-short reveal is topped up with. */
  starters?: readonly string[];
}

/** Has the reader actually said something? An empty box or an emptied multi is not an answer. */
function isAnswered(answer: Answer | undefined): answer is Answer {
  if (!answer) return false;
  if (answer.text !== undefined) return answer.text.trim() !== "";
  return answer.keys.length > 0 && answer.keys[0] !== SKIP;
}

export function OnboardingScreen({
  topics,
  faces,
  retake,
  bank = QUESTIONS,
  starters = STARTER_TOPICS,
}: OnboardingScreenProps) {
  const router = useRouter();
  const utils = api.useUtils();
  const complete = api.onboarding.complete.useMutation();
  const interpret = api.onboarding.interpret.useMutation();

  const listed = useMemo(() => new Set(topics.map((t) => t.id)), [topics]);
  // Only what this database can honour — CI's sixteen topics ask far fewer than production.
  const asked = useMemo(() => askable(bank, listed), [bank, listed]);

  const [phase, setPhase] = useState<Phase>("intro");
  /** One entry per question already left, in order. */
  const [answers, setAnswers] = useState<Answer[]>([]);
  /** The question on screen's answer-in-progress. */
  const [draft, setDraft] = useState<Answer | undefined>(undefined);
  const [about, setAbout] = useState<About | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const current = asked[answers.length];

  // A question that arrives takes focus on its heading. The one it replaced was unmounted by the
  // tap that answered it, which drops focus to <body> — and a screen-reader user would get no cue
  // that anything changed. Keyed on the question, so typing into a text box never steals focus.
  const currentId = phase === "questions" ? current?.id : undefined;
  useEffect(() => {
    if (currentId) document.getElementById(`q-${currentId}`)?.focus();
  }, [currentId]);

  /** Leaves the question on screen with `answer` (or a skip) and moves on. */
  function advance(answer: Answer | undefined) {
    if (!current) return;
    const kept: Answer = isAnswered(answer)
      ? answer.text !== undefined
        ? { ...answer, text: answer.text.trim() }
        : answer
      : { questionId: current.id, keys: [SKIP] };
    const next = [...answers, kept];
    setAnswers(next);
    setDraft(undefined);
    if (next.length >= asked.length) void finishQuestions(next);
  }

  /** Back from a question: the previous one, with what was said there; or the intro. */
  function back() {
    const last = answers[answers.length - 1];
    if (!last) {
      setDraft(undefined);
      setPhase("intro");
      return;
    }
    setAnswers(answers.slice(0, -1));
    // A skip comes back as a blank question, not as a pressed "skip".
    setDraft(isAnswered(last) ? last : undefined);
    setPhase("questions");
  }

  /** After the last question: map any free text to topics, then on to About you. */
  async function finishQuestions(all: Answer[]) {
    const texts = all.flatMap((a) =>
      a.text ? [{ questionId: a.questionId, text: a.text }] : [],
    );
    if (texts.length === 0) {
      setPhase("about");
      return;
    }
    setPhase("interpreting");
    try {
      const mapped = await interpret.mutateAsync({ texts });
      const byQuestion = new Map(mapped.map((m) => [m.questionId, m.topicIds]));
      setAnswers(
        all.map((a) =>
          a.text ? { ...a, topicIds: byQuestion.get(a.questionId) ?? [] } : a,
        ),
      );
    } catch {
      // The service already answers empty lists on its own failures; this is the network
      // between here and it. Either way the reveal is built from the other answers.
    }
    setPhase("about");
  }

  // What the answers add up to — recomputed when they change, which only happens before the
  // reveal is on screen (RevealStep reads `proposed` once, on mount).
  const proposed = useMemo(
    () => picksFrom(scoreAnswers(bank, answers, listed), listed, starters),
    [bank, answers, listed, starters],
  );

  async function submit(picks: Pick[]) {
    if (submitting) return;
    setError("");
    setSubmitting(true);
    try {
      await complete.mutateAsync({
        picks,
        writingAmount: readingAmountFrom(bank, answers),
        answers,
        bankVersion: BANK_VERSION,
        about: about ?? undefined,
      });
      // On a retake the cache still holds the old picks, the old reading amount and a feed
      // composed from them; a first run has nothing cached, and this costs nothing.
      await utils.invalidate();
      // `replace`, not `push`: /onboarding left in history would only bounce forward again.
      // `submitting` stays true through the navigation, like AuthCard's post-sign-up redirect.
      router.replace(retake ? "/profile/topics" : "/feed");
    } catch {
      setError("Something went wrong saving your answers — try again.");
      setSubmitting(false);
    }
  }

  return (
    <main className="bg-bg min-h-dvh">
      {/* One narrow column on every width (docs/DESIGN_desktop-polish.md §1). The bottom padding
          clears the fixed bar. */}
      <Column width="narrow" className="px-6 pt-16 pb-[180px]">
        {phase === "intro" && (
          <>
            <Rise>
              <p className="text-accent font-sans text-[11px] font-semibold tracking-[1.8px] uppercase">
                Ambit · {retake ? "Start again" : "Setup"}
              </p>
              <h1 className="text-ink-hi mt-[14px] text-[34px] leading-[1.12] font-semibold tracking-[-0.4px]">
                {retake ? "Let’s ask again" : "Let’s find where to start"}
              </h1>
              <p className="text-ink/62 mt-3 text-[16px] leading-[1.55]">
                A few questions about what you like — some pictures, some words.
                Skip any of them. At the end you’ll see what we made of it, and
                you can change all of it.
              </p>
              {retake && (
                <p className="text-ink/82 mt-3 text-[15px] leading-[1.55]">
                  Your answers will replace the topics you have now.{" "}
                  <Link
                    href="/profile/topics"
                    replace
                    className="text-accent underline underline-offset-2"
                  >
                    Cancel
                  </Link>
                </p>
              )}
            </Rise>
            {/* Outside <Rise>: its transform would capture a `fixed` child. */}
            <StepBar>
              <Button
                shape="pill"
                size="md"
                onClick={() => setPhase("questions")}
              >
                Begin
              </Button>
            </StepBar>
          </>
        )}

        {phase === "questions" && current && (
          <>
            {/* Keyed by question so <Rise> plays again: each one should arrive, not swap. */}
            {/* Outside the keyed <Rise> on purpose: a live region created with its content is not
                announced, so this one stays mounted and only its text changes. */}
            <p
              aria-live="polite"
              className="text-accent mb-[14px] font-sans text-[11px] font-semibold tracking-[1.8px] uppercase"
            >
              {answers.length + 1} of {asked.length}
            </p>
            <Rise key={current.id}>
              <QuestionStep
                question={current}
                listed={listed}
                faces={faces}
                answer={draft}
                onChange={(answer, done) =>
                  done ? advance(answer) : setDraft(answer)
                }
              />
            </Rise>
            <StepBar>
              <Button shape="pill" size="md" variant="ghost" onClick={back}>
                Back
              </Button>
              {/* One button, named for what it will do: nothing said yet → Skip. */}
              <Button shape="pill" size="md" onClick={() => advance(draft)}>
                {isAnswered(draft) ? "Next" : "Skip"}
              </Button>
            </StepBar>
          </>
        )}

        {phase === "interpreting" && (
          <p
            role="status"
            className="text-ink/62 pt-24 text-center text-[17px]"
          >
            Putting it together…
          </p>
        )}

        {phase === "about" && (
          <AboutStep
            initial={about ?? undefined}
            onContinue={(given) => {
              setAbout(given);
              setPhase("reveal");
            }}
            onSkip={() => {
              setAbout(null);
              setPhase("reveal");
            }}
            onBack={back}
          />
        )}

        {phase === "reveal" && (
          <RevealStep
            topics={topics}
            proposed={proposed}
            retake={retake}
            submitting={submitting}
            error={error}
            onSubmit={submit}
            onBack={() => setPhase("about")}
          />
        )}
      </Column>
    </main>
  );
}
