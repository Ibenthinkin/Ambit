"use client";

import { useState } from "react";

import { TopicLevels, type LevelTopic } from "~/components/topics/topic-levels";
import { Button } from "~/components/ui/button";
import { ERROR_HINT } from "~/components/ui/field";
import { Rise } from "~/components/ui/rise";
import { Segmented } from "~/components/ui/segmented";
import { TextLink } from "~/components/ui/text-link";
import { MIN_PICKS } from "~/lib/interview/config";
import { exploreOneIn } from "~/lib/interview/explore-share";
import type { Pick } from "~/lib/interview/picks";
import {
  draftPicks,
  reseed,
  sameProposal,
  seedDraft,
  withLevel,
  withOff,
} from "~/lib/interview/reveal-draft";
import type { TasteFields } from "~/lib/interview/taste";
import { cn } from "~/lib/utils";
import {
  READING_AMOUNTS,
  READING_LABELS,
  type ReadingAmount,
} from "~/server/config/reading-amount";
import { weightOf } from "~/server/config/topic-levels";
import { DEFAULT_KNOBS } from "~/server/services/feed-knobs";

import { ExhibitionCard } from "./exhibition-card";
import type { HungPicture } from "./exhibition-head";
import { SectionHeader } from "./section-header";

// The questionnaire's last screen (docs/DESIGN_redesign.md §5.3), top to bottom in the shell's
// 1120 px container:
//
//   1–5. the exhibition (exhibition-card.tsx): eyebrow, title, subtitle, the hang, temperament,
//        the travel compass and "You’d open";
//   6.   **Your mix** — every proposed topic at a level, grouped under facet headings
//        (TopicLevels, decision 3), a "Proposed" tag on the rows Ambit added itself (starter
//        top-ups, decision 4); then **Reading mixed in**, one row: how much writing the feed
//        carries;
//   7.   **Kept out** — each rather-not choice with an Allow;
//   8.   the explore line, its number the feed's own (explore-share.ts);
//   9.   Open my feed, and Start over.
//
// **A local draft.** The proposal (`proposed`, from lib/interview/picks.ts) seeds a draft that is
// edited here (lib/interview/reveal-draft.ts); nothing is saved until "Open my feed" hands the
// draft and the Reading row's value to `onSubmit`. What is written is exactly what this screen
// showed — which is why `onboarding.complete` *overwrites*. If the proposal changes while the
// screen is up — a kept-out subject allowed back in — the draft is **re-seeded**: rows the
// reader set by hand keep what they set, the rest follow the new proposal.
//
// **Off keeps the row.** A switched-off topic stays on the page with "off" pressed, so a stray
// tap can be undone without going back through the questions. It just isn't submitted.
export interface RevealStepProps {
  /** `topics.list` rows — the labels, and the facet each is grouped under. */
  topics: readonly LevelTopic[];
  /** What the answers proposed. Seeds the draft; a different proposal later re-seeds it. */
  proposed: readonly Pick[];
  /** The proposed topics Ambit added itself (`isStarter`) — tagged "Proposed". */
  starters?: ReadonlySet<string>;
  /** The exhibition the answers make (taste.ts). Absent on a bank without its questions — the
   *  reveal is then the mix alone. */
  taste?: TasteFields;
  /** The hang the shell computed (hang.ts) — drawn as given, never recomputed here. */
  hang?: readonly HungPicture[];
  /** What the Reading row opens on: a retaking reader's stored amount, else what the article
   *  cards suggested, else "some" (the shell decides). */
  readingDefault?: ReadingAmount;
  /** The rather-not choices, each with an Allow (kept-out.ts). */
  keptOut?: readonly { key: string; label: string }[];
  onAllow?: (key: string) => void;
  /** A signed-up reader retaking the questions: this will *replace* what they have. */
  retake: boolean;
  submitting: boolean;
  error: string;
  onSubmit: (picks: Pick[], writingAmount: ReadingAmount) => void;
  /** "Start over": clear the answers and go back to the intro. */
  onRestart?: () => void;
}

/** The Reading row's four options, None first (the Segmented's order, DESIGN §4.3). */
const READING_OPTIONS = READING_AMOUNTS.map((key) => ({
  key,
  label: READING_LABELS[key],
}));

/** The explore line's "one in _n_", from the feed's own tier weights — computed once. */
const ONE_IN = exploreOneIn(DEFAULT_KNOBS);

export function RevealStep({
  topics,
  proposed,
  starters,
  taste,
  hang = [],
  readingDefault = "some",
  keptOut = [],
  onAllow,
  retake,
  submitting,
  error,
  onSubmit,
  onRestart,
}: RevealStepProps) {
  const [draft, setDraft] = useState(() => seedDraft(proposed));
  // Re-seeding during render, not in an effect, so no frame shows the old rows against a new
  // proposal. Compared by content: a parent handing over an equal list in a new array is not a
  // new proposal, and must not loop.
  const [seededFrom, setSeededFrom] = useState(proposed);
  if (!sameProposal(seededFrom, proposed)) {
    setSeededFrom(proposed);
    setDraft(reseed(draft, proposed));
  }
  const [reading, setReading] = useState<ReadingAmount>(readingDefault);

  const short = draft.picks.size < MIN_PICKS;

  function submit() {
    // Guarded here as well as by `disabled` — and against a second press while one is in flight.
    if (short || submitting) return;
    // In the proposal's own order (best first), so the submitted list reads like the answers did.
    onSubmit(draftPicks(draft), reading);
  }

  // Back is the shell's (onboarding-screen.tsx, top-left, the same as every question's). The
  // button and any failure sit in the flow under the mix, so all of it rises together.
  const mixLevel = taste ? "h3" : "h2";

  return (
    <Rise>
      <div data-step="reveal">
        {taste && (
          <ExhibitionCard
            taste={taste}
            topicLabels={new Map(topics.map((t) => [t.id, t.label]))}
            hang={hang}
            headingLevel="h1"
          />
        )}

        <div className={cn("max-w-[860px]", taste && "mt-16")}>
          {/* With no exhibition above it, "Your mix" is the page's heading, and the headers under
              it are h2s so the outline does not skip a level. */}
          {taste ? (
            <h2 className={MIX_HEADING}>Your mix</h2>
          ) : (
            <h1 className={MIX_HEADING}>Your mix</h1>
          )}
          <p className="text-ink/55 mt-[10px] max-w-[620px] text-[15px] leading-[1.45]">
            Set from your answers. Change anything. Topics marked proposed are
            ones Ambit added to round out the start.
          </p>
          {retake && (
            <p className="text-ink/82 mt-3 text-[15px] leading-[1.55]">
              This replaces your current topics.{" "}
              <TextLink href="/profile/topics" replace tone="body">
                Cancel
              </TextLink>
            </p>
          )}

          <div className="mt-8">
            <TopicLevels
              topics={topics}
              picks={draft.picks}
              off={draft.off}
              proposed={starters}
              onLevel={(id, level) =>
                setDraft((d) => withLevel(d, id, weightOf(level)))
              }
              onOff={(id) => setDraft((d) => withOff(d, id))}
              headingLevel={mixLevel}
            />
          </div>

          {/* Reading mixed in (decision 2): bank v3's amount question, as one more row. */}
          <div className="mt-11">
            <SectionHeader title="Reading mixed in" level={mixLevel} />
            <div className="border-ink/8 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b py-3">
              <span className="text-ink block text-[18px] leading-[1.25]">
                How much writing in the feed
              </span>
              <Segmented
                label="How much writing in the feed"
                options={READING_OPTIONS}
                value={reading}
                onChange={setReading}
              />
            </div>
          </div>

          {keptOut.length > 0 && (
            <div className="mt-8">
              <SectionHeader title="Kept out" level={mixLevel} />
              <ul>
                {keptOut.map((k) => (
                  <li
                    key={k.key}
                    className="border-ink/8 flex items-baseline justify-between gap-4 border-b py-3"
                  >
                    <span className="text-ink-hi text-[17px]">{k.label}</span>
                    <Button
                      variant="link"
                      aria-label={`Allow ${k.label}`}
                      className="text-[14px]"
                      onClick={() => onAllow?.(k.key)}
                    >
                      Allow
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {ONE_IN !== null && (
            <p className="text-ink/48 mt-5 text-[14px] italic">
              About one post in {ONE_IN} comes from outside this mix, so the
              feed keeps learning from what you save.
            </p>
          )}

          {error && (
            <div
              role="alert"
              data-testid="onboarding-error"
              // The green mono hint (DESIGN §3.2 job 7) — 1b has no error colour.
              className={cn(ERROR_HINT, "mt-8")}
            >
              {error}
            </div>
          )}
          <div className="mt-8 flex flex-wrap items-center gap-6">
            <Button
              size="lg"
              disabled={short}
              aria-busy={submitting}
              onClick={submit}
              className={cn(
                "px-[34px] text-[16px]",
                submitting && "pointer-events-none opacity-80",
              )}
            >
              {short ? "Keep at least three" : "Open my feed"}
            </Button>
            {onRestart && (
              <Button variant="link" onClick={onRestart} disabled={submitting}>
                Start over
              </Button>
            )}
          </div>
        </div>
      </div>
    </Rise>
  );
}

const MIX_HEADING =
  "text-ink-hi text-[clamp(34px,5cqw,56px)] leading-[1.04] tracking-[-0.025em]";
