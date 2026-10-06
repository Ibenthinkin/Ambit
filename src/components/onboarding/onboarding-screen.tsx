"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import { Eyebrow } from "~/components/ui/eyebrow";
import { Rise } from "~/components/ui/rise";
import {
  isAnswered,
  keepOrPass,
  pickAnswer,
  toggleAnswer,
} from "~/lib/interview/answer";
import { askable } from "~/lib/interview/askable";
import { BANK_VERSION, QUESTIONS, STARTER_TOPICS } from "~/lib/interview/bank";
import { EITHER, NEITHER, SKIP } from "~/lib/interview/config";
import { wingRanking } from "~/lib/interview/exhibition";
import { faceKey, type QuestionFaces } from "~/lib/interview/faces";
import { hangFrom, heroesFor } from "~/lib/interview/hang";
import { keyAction, type KeyAction, type KeyKind } from "~/lib/interview/keys";
import { keyKindOf } from "~/lib/interview/layout";
import { picksFrom, type Pick } from "~/lib/interview/picks";
import { scoreAnswers } from "~/lib/interview/score";
import { shown } from "~/lib/interview/show";
import {
  buildTaste,
  chosenDestinations,
  type OpenedCard,
} from "~/lib/interview/taste";
import type { Answer, Question } from "~/lib/interview/types";
import { api } from "~/trpc/react";

import { QuestionStep } from "./question-step";
import { RevealStep } from "./reveal-step";

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
//   intro → questions → reveal → /feed
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
//     question, if anything was typed — the last question stays on screen with its forward
//     button busy meanwhile (the "Putting it together…" screen went with the redesign), and the
//     flow goes on whether or not it answers. `onboarding.complete` once, from the reveal. Until
//     then nothing is written, so closing the tab half-way leaves no trace and `/feed` still
//     sends the reader back here.
//
// The redesign's shell (docs/DESIGN_redesign.md §5.2, Task 6.4) — what this file owns, around
// the question screens (question-step.tsx) and the reveal (reveal-step.tsx):
//
//   - **One container** for every screen: a size container (`@container`, so the screens can
//     set type in `cqw`), max 1120 px. No header, no step count, no bottom bar — nothing here is
//     `fixed`, so nothing is caught by <Rise>'s transform either.
//   - **A quiet Back link**, top-left on every question and on the reveal.
//   - **Auto-advance.** A whole-answer press (`onChange(answer, true)`) is shown at once and the
//     screen moves on `ADVANCE_MS` later. The pending pick is *state*, and an effect owns its
//     timer: a second pick replaces it (one advance, with the second), and Back — or anything
//     else that leaves the question — clears it, which cancels the timer. That is the plan's
//     Review focus 5: Back inside the window never advances twice or lands on the wrong question.
//   - **The keyboard.** One `keydown` listener on window, subscribed once, reading the latest
//     state through `useEffectEvent` (item-screen.tsx explains why an effect keyed on changing
//     handlers loses keys). keys.ts says what a key means on this screen's layout
//     (`keyKindOf`); this file says what each action does.
//
// First Exhibition (bank v2, docs/DESIGN_first-exhibition.md) added four things, all derived from
// the answers so Back-and-change is always honoured: a progress line counting **steps** (gone in
// the redesign — steps.ts still groups the questions); a `show.top` question (the playoff) is **ranked** by the scores so far
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

/** The beat between a pick and the next screen (DESIGN_redesign §5.2; the prototype's
 *  `advanceSoon`): long enough to see the outline land, short enough not to wait for. */
export const ADVANCE_MS = 380;

type Phase = "intro" | "questions" | "reveal";

/** Is a control focused that Enter already means something to (a button, a link)? Then Enter is
 *  its own job — Cancel on a retake's intro, Back or Skip after walking with the arrows. The
 *  question heading (focused by script on arrival) and the body are not controls. */
function ownsEnter(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target === document.body || target.matches("h1, [id^='q-']"))
    return false;
  return (
    target.closest(
      "button, a[href], [role='button'], [role='link'], [role='radio'], [role='checkbox'], [role='menuitem'], [role='option'], summary",
    ) !== null
  );
}

/** A key typed into a field is the field's — the keyboard never reads it as a pick. */
function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
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
  /** A whole-answer press waiting out its beat (`ADVANCE_MS`) — see the effect below. */
  const [pending, setPending] = useState<Answer | null>(null);
  /** The keyboard cursor on a card or chip screen (keys.ts), or none. Per question. */
  const [cursor, setCursor] = useState<number | null>(null);
  /** The keep stack's card (DESIGN §5.2 "Keep or pass") — how many have been decided. */
  const [stackAt, setStackAt] = useState(0);
  /** `onboarding.interpret` in flight on leaving the last question. */
  const [finishing, setFinishing] = useState(false);
  /** Bumped by anything that leaves the questions' end, so a late `interpret` answer for a run
   *  the reader has gone Back from is dropped rather than jumping them to the reveal. */
  const finishRun = useRef(0);
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

  // A question that arrives takes focus on its heading. The one it replaced was unmounted by the
  // tap that answered it, which drops focus to <body> — and a screen-reader user would get no cue
  // that anything changed. Keyed on the question, so typing into a text box never steals focus.
  const currentId = phase === "questions" ? current?.id : undefined;
  useEffect(() => {
    if (currentId) document.getElementById(`q-${currentId}`)?.focus();
  }, [currentId]);

  /** After the last question: map any free text to topics, then on to the reveal. The last
   *  question stays on screen meanwhile (its forward button busy) — there is no screen between. */
  async function finishQuestions(all: Answer[]) {
    const texts = all.flatMap((a) =>
      a.text ? [{ questionId: a.questionId, text: a.text }] : [],
    );
    if (texts.length === 0) {
      setAnswers(all);
      setDraft(undefined);
      setPhase("reveal");
      return;
    }
    const run = ++finishRun.current;
    setFinishing(true);
    let done = all;
    try {
      const mapped = await interpret.mutateAsync({ texts });
      const byQuestion = new Map(mapped.map((m) => [m.questionId, m.topicIds]));
      done = all.map((a) =>
        a.text ? { ...a, topicIds: byQuestion.get(a.questionId) ?? [] } : a,
      );
    } catch {
      // The service already answers empty lists on its own failures; this is the network
      // between here and it. Either way the reveal is built from the other answers.
    }
    // The reader went Back while the model was thinking: this run is not theirs any more.
    if (run !== finishRun.current) return;
    setFinishing(false);
    setAnswers(done);
    setDraft(undefined);
    setPhase("reveal");
  }

  /** Everything a question owns besides its answer goes when the question does. */
  function resetScreen() {
    setPending(null);
    setCursor(null);
    setStackAt(0);
  }

  /** Leaves the question on screen with `answer` (or a skip) and moves on. */
  function advance(answer: Answer | undefined) {
    if (!current || finishing) return;
    resetScreen();
    const kept: Answer = isAnswered(answer)
      ? answer.text !== undefined
        ? { ...answer, text: answer.text.trim() }
        : answer
      : { questionId: current.id, keys: [SKIP] };
    const next = [...answers, kept];
    if (next.length < asked.length) {
      setAnswers(next);
      setDraft(undefined);
      // The prototype's `next()`: a new screen starts at its top. (Optional call: jsdom has no
      // Element.scrollTo.)
      document.scrollingElement?.scrollTo?.({ top: 0 });
      return;
    }
    void finishQuestions(next);
  }

  /** A whole-answer press: shown at once, left `ADVANCE_MS` later (the effect below). */
  function pick(answer: Answer) {
    setDraft(answer);
    setPending(answer);
  }

  // The pending pick's timer. Keyed on the pick itself, so a second pick clears the first's
  // timer and starts its own, and anything that sets `pending` to null — Back, a skip, leaving
  // the question, unmounting — cancels it. `commit` reads the latest `advance` (and through it
  // the latest answers) when the beat ends, not the render the pick happened in.
  const commit = useEffectEvent((answer: Answer) => {
    // A pick belongs to the question it was made on: a stale one never advances another.
    if (answer.questionId !== current?.id) return;
    advance(answer);
  });
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => commit(pending), ADVANCE_MS);
    return () => clearTimeout(t);
  }, [pending]);

  /** Back from a question: the previous one, with what was said there; or the intro. A pick
   *  still waiting out its beat is dropped with the question it was made on. */
  function back() {
    resetScreen();
    finishRun.current += 1;
    setFinishing(false);
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

  // ── The keyboard ────────────────────────────────────────────────────────────────────────
  const kind: KeyKind =
    phase === "intro"
      ? "intro"
      : phase === "questions" && onScreen
        ? keyKindOf(onScreen)
        : "none";

  /** One keep-or-pass decision on the keep stack — the keys' ← →, and the stack's buttons. */
  function decideCard(keep: boolean) {
    // Past the last card the answer is already waiting out its beat: an extra ← / → in those
    // 380 ms must not restart it.
    if (!onScreen || stackAt >= onScreen.options.length) return;
    const r = keepOrPass(onScreen, draft, stackAt, keep);
    setStackAt(r.at);
    if (r.done) pick(r.answer);
    else setDraft(r.answer);
  }

  function act(action: KeyAction) {
    if (action.type === "next") {
      setPhase("questions");
      return;
    }
    if (!onScreen) return;
    const option = (i: number) => onScreen.options[i]?.key;
    switch (action.type) {
      case "cursor":
        setCursor(action.index);
        return;
      case "pick": {
        const key = option(action.index);
        if (key === undefined) return;
        if (onScreen.kind === "multi")
          setDraft(toggleAnswer(onScreen, draft?.keys ?? [], key));
        else pick(pickAnswer(onScreen, key, faces));
        return;
      }
      case "none":
        // The rooms' "None of these" is an answer (NEITHER scores the starters down); a reading
        // screen's decline is a skip, as its Skip button is.
        if (kind === "read") advance(undefined);
        else pick(pickAnswer(onScreen, NEITHER, faces));
        return;
      case "both":
        pick(pickAnswer(onScreen, EITHER, faces));
        return;
      case "keep":
      case "pass":
        decideCard(action.type === "keep");
        return;
    }
  }

  // keys.ts asks three things of its caller: skip a chord (⌘B is the browser's, not "both"),
  // skip a key typed into a field, and preventDefault whatever it does act on (an arrow must not
  // scroll the page, an Enter on a focused button must not click it as well).
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (isTextField(e.target)) return;
    if (e.key === "Enter" && ownsEnter(e.target)) return;
    if (finishing || submitting) return;
    const action = keyAction(
      kind,
      e.key,
      cursor,
      onScreen?.options.length ?? 0,
    );
    if (action.type === "ignore") return;
    e.preventDefault();
    act(action);
  });
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  // What the answers add up to — recomputed when they change. Today that only happens before
  // the reveal is on screen; RevealStep re-seeds its draft if it ever happens after (Allow).
  const proposed = useMemo(
    () => picksFrom(scoresSoFar, listed, starters),
    [scoresSoFar, listed, starters],
  );
  // The reader's own pictures, hung under the reveal's title (hang.ts): keeps, then picks, then
  // the doors of their best wings for a reader who skipped their way here. Task 6.6 draws it;
  // its ids go into the taste now, so what is stored is what the reveal will show.
  const hang = useMemo(
    () =>
      hangFrom({
        bank,
        answers,
        faces,
        heroes: heroesFor(
          bank,
          wingRanking(scoresSoFar, listed).map((w) => w.id),
        ),
      }),
    [bank, answers, faces, scoresSoFar, listed],
  );
  // What the reveal shows above the levels, and what is stored with the run (user_taste).
  const taste = useMemo(
    () =>
      buildTaste({
        scores: scoresSoFar,
        listed,
        destinations: chosenDestinations(answers),
        opened,
        hang: hang.map((p) => p.itemId),
      }),
    [scoresSoFar, listed, answers, opened, hang],
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

  return (
    <main className="bg-bg min-h-dvh">
      {/* The size container every screen's `cqw` measures against (DESIGN §5.2), padded
          clamp(20px, 4cqw, 56px) a side; inside it, one column, max 1120 px. */}
      <div className="@container min-h-dvh">
        <div className="px-[clamp(20px,4cqw,56px)]">
          <div className="mx-auto max-w-[1120px] pt-[clamp(36px,6cqw,72px)] pb-10">
            {/* The quiet Back (decision 1): top-left on every question and on the reveal, never
                on the intro. A text link in look, a button in kind — it moves within the page. */}
            {phase !== "intro" && (
              <div className="mb-6">
                <Button variant="link" onClick={back}>
                  Back
                </Button>
              </div>
            )}

            {phase === "intro" && (
              <Rise>
                <Eyebrow as="p" className="block">
                  Ambit · {retake ? "Start again" : "Setup"}
                </Eyebrow>
                <h1 className="text-ink-hi mt-[14px] text-[34px] leading-[1.12] tracking-[-0.4px]">
                  {retake ? "Let’s ask again" : "Let’s find where to start"}
                </h1>
                <p className="text-ink/62 mt-3 text-[16px] leading-[1.55]">
                  A few questions about what you like — some pictures, some
                  words. Skip any of them. At the end you’ll see what we made of
                  it, and you can change all of it.
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
                <div className="mt-8">
                  <Button size="md" onClick={() => setPhase("questions")}>
                    Begin
                  </Button>
                </div>
              </Rise>
            )}

            {phase === "questions" && current && (
              // Keyed by question so <Rise> plays again: each one should arrive, not swap.
              <Rise key={current.id}>
                <QuestionStep
                  question={onScreen ?? current}
                  listed={listed}
                  faces={faces}
                  answer={draft}
                  // On the keep stack the card under the stack is the one the keys act on.
                  cursor={kind === "keep" ? stackAt : cursor}
                  busy={finishing}
                  onChange={(answer, done) => {
                    if (done) pick(answer);
                    else {
                      // An edit that is not a whole answer cancels a pick still waiting.
                      setPending(null);
                      setDraft(answer);
                    }
                  }}
                  onContinue={() => advance(draft)}
                />
              </Rise>
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
              />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
