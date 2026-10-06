"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Button } from "~/components/ui/button";
import { Column } from "~/components/ui/column";
import { Eyebrow } from "~/components/ui/eyebrow";
import { Rise } from "~/components/ui/rise";
import { askable } from "~/lib/interview/askable";
import { BANK_VERSION, QUESTIONS, STARTER_TOPICS } from "~/lib/interview/bank";
import { SKIP } from "~/lib/interview/config";
import { faceKey, type QuestionFaces } from "~/lib/interview/faces";
import { columnFor, type Phase } from "~/lib/interview/layout";
import { picksFrom, type Pick } from "~/lib/interview/picks";
import { scoreAnswers } from "~/lib/interview/score";
import { shown } from "~/lib/interview/show";
import { STEP_LABELS, STEP_OF, stepsAsked } from "~/lib/interview/steps";
import {
  buildTaste,
  chosenDestinations,
  type OpenedCard,
} from "~/lib/interview/taste";
import type { Answer, Question } from "~/lib/interview/types";
import { api } from "~/trpc/react";

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
// questions — then a **reveal**: "Here's where we'll start", every
// proposed topic at a little / some / a lot / off.
//
// How it holds together:
//
//   intro → questions → (interpreting) → reveal → /feed
//
// (An optional "About you" — age range, place, gender — sat before the reveal until 10-05-26;
// Ben's critique removed it and migration 0014 dropped its three columns.)
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
//
// First Exhibition (bank v2, docs/DESIGN_first-exhibition.md) added four things, all derived from
// the answers so Back-and-change is always honoured: the progress line counts **steps** (steps.ts)
// rather than questions; a `show.top` question (the playoff) is **ranked** by the scores so far
// before it is shown (show.ts); the reading amount **opened on a default** read off the article
// cards (bank v3 moved it to the reveal — Task 6.6 wires the Reading row); and the reveal's
// **taste** (taste.ts) is computed here and sent with the run.

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

/** The forward button, named for what it will do. Declining the destinations is a real answer,
 *  so it says so. (The reading screens said "I'd rather look at pictures" until Ben's 10-05-26
 *  critique; they skip like every other screen now, and a skip there is still counted.) */
function forwardLabel(q: Question, answered: boolean): string {
  if (answered) return "Next";
  if (q.id === "destinations") return "Nowhere in particular";
  return "Skip";
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const current = asked[answers.length];

  // What the answers so far have scored — the playoff ranks by it, the reveal is built from it.
  const scoresSoFar = useMemo(
    () => scoreAnswers(bank, answers, listed),
    [bank, answers, listed],
  );
  /** The question as it is shown: a `show.top` question cut to the reader's best few. */
  const onScreen = current ? shown(current, scoresSoFar, listed) : undefined;

  /** The article cards opened so far — read from the answers, so Back-and-change is honoured. */
  const opened = useMemo((): OpenedCard[] => {
    return answers.flatMap((a) => {
      const q = bank.find((x) => x.id === a.questionId);
      const key = a.keys[0];
      if (!q || !key || key === SKIP) return [];
      const o = q.options.find((x) => x.key === key);
      const face = o?.face?.writing ? faces[faceKey(q.id, key)] : undefined;
      return face?.writing
        ? [
            {
              itemId: face.itemId,
              title: face.writing.title,
              kind: face.writing.kind,
              minutes: face.writing.minutes,
            },
          ]
        : [];
    });
  }, [answers, bank, faces]);

  // The progress line counts steps; a bank with no STEP_OF entries (a test's) keeps v1's
  // question count.
  const steps = useMemo(() => stepsAsked(asked), [asked]);
  const stepNow = current ? STEP_OF[current.id] : undefined;
  const stepIndex = stepNow !== undefined ? steps.indexOf(stepNow) : -1;

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

  /** After the last question: map any free text to topics, then on to the reveal. */
  async function finishQuestions(all: Answer[]) {
    const texts = all.flatMap((a) =>
      a.text ? [{ questionId: a.questionId, text: a.text }] : [],
    );
    if (texts.length === 0) {
      setPhase("reveal");
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
    setPhase("reveal");
  }

  // What the answers add up to — recomputed when they change. Today that only happens before
  // the reveal is on screen; RevealStep re-seeds its draft if it ever happens after (Allow).
  const proposed = useMemo(
    () => picksFrom(scoresSoFar, listed, starters),
    [scoresSoFar, listed, starters],
  );
  // What the reveal shows above the levels, and what is stored with the run (user_taste).
  const taste = useMemo(
    () =>
      buildTaste({
        scores: scoresSoFar,
        listed,
        destinations: chosenDestinations(answers),
        opened,
      }),
    [scoresSoFar, listed, answers, opened],
  );

  async function submit(picks: Pick[]) {
    if (submitting) return;
    setError("");
    setSubmitting(true);
    try {
      await complete.mutateAsync({
        picks,
        // Bank v3 asks no amount question; the reveal's Reading row will send one (Task 6.6).
        // Until then null = "not said": the column is left as it was and the feed reads at
        // its default share — what a skipped amount question always meant.
        writingAmount: null,
        answers,
        bankVersion: BANK_VERSION,
        taste,
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

  // Narrow for words, wide for pictures (lib/interview/layout.ts; Ben's critique 10-05-26). Both
  // are `mx-auto`, but the heading, progress line and Back sit at the column's *left* edge, so at
  // 1440 they step 260 px sideways where bank v2 crosses the seam (intro → the wings,
  // destinations → rather-not). Left for Ben's eye; if it jars, keep the column narrow and let
  // only the card grid break out wide.
  const width = columnFor(onScreen, phase);

  return (
    <main className="bg-bg min-h-dvh">
      {/* The bottom padding clears the fixed bar. */}
      <Column width={width} className="px-6 pt-16 pb-[180px]">
        {phase === "intro" && (
          <>
            <Rise>
              <Eyebrow as="p" className="block">
                Ambit · {retake ? "Start again" : "Setup"}
              </Eyebrow>
              <h1 className="text-ink-hi mt-[14px] text-[34px] leading-[1.12] tracking-[-0.4px]">
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
                  {/* TextLink's look (DESIGN §4.6) on a plain <Link>: TextLink doesn't pass
                      `replace` through, and this one must not add a history entry. */}
                  <Link
                    href="/profile/topics"
                    replace
                    className="text-ink hover:decoration-accent underline decoration-1 underline-offset-3 transition-colors hover:text-white"
                  >
                    Cancel
                  </Link>
                </p>
              )}
              {/* Under the copy it answers, not in the fixed bar at the foot of the screen (Ben's
                  critique, 10-05-26): on a tall desktop window the two were a screen apart. Not
                  `fixed`, so it can live inside <Rise> and arrive with the words. */}
              <div className="mt-8">
                <Button size="md" onClick={() => setPhase("questions")}>
                  Begin
                </Button>
              </div>
            </Rise>
          </>
        )}

        {phase === "questions" && current && (
          <>
            {/* Keyed by question so <Rise> plays again: each one should arrive, not swap. */}
            {/* Outside the keyed <Rise> on purpose: a live region created with its content is not
                announced, so this one stays mounted and only its text changes. */}
            <Eyebrow as="p" aria-live="polite" className="mb-[14px] block">
              {stepIndex >= 0
                ? `Step ${stepIndex + 1} of ${steps.length} · ${STEP_LABELS[stepNow! - 1]}`
                : `${answers.length + 1} of ${asked.length}`}
            </Eyebrow>
            <Rise key={current.id}>
              <QuestionStep
                question={onScreen ?? current}
                listed={listed}
                faces={faces}
                answer={draft}
                onChange={(answer, done) =>
                  done ? advance(answer) : setDraft(answer)
                }
              />
            </Rise>
            <StepBar width={width}>
              <Button size="md" variant="outline" onClick={back}>
                Back
              </Button>
              {/* One button, named for what it will do: nothing said yet → Skip. */}
              <Button size="md" onClick={() => advance(draft)}>
                {forwardLabel(current, isAnswered(draft))}
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

        {phase === "reveal" && (
          <RevealStep
            topics={topics}
            proposed={proposed}
            taste={taste}
            retake={retake}
            submitting={submitting}
            error={error}
            onSubmit={submit}
            // The same Back every question has: the last answer comes back on screen.
            onBack={back}
          />
        )}
      </Column>
    </main>
  );
}
