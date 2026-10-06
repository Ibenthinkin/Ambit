"use client";

import * as React from "react";

import { Eyebrow } from "~/components/ui/eyebrow";
import { Segmented } from "~/components/ui/segmented";
import {
  LEVEL_LABELS,
  LEVELS,
  levelOf,
  type Level,
} from "~/server/config/topic-levels";

// The reader's topics as a list of levels — "how much of this?" for every topic they have.
// Two hosts render it: the questionnaire's reveal (`onboarding/reveal-step.tsx`), over the draft
// a reader is about to save, and `/profile/topics`, over their live picks.
//
// **One flat list, in label order (10-02-26).** It was grouped under facet headings — Subject,
// Medium, Look, Place — until Ben's verdict that the facets mean nothing to a reader. Facets and
// umbrella groups are still how the *code* files topics; nothing on screen names them.
//
// **Why levels and not a raw number.** The engine underneath is still a fractional
// `user_topic.weight` — `topic-levels.ts`'s file header spells out the full arithmetic — but
// nobody hand-tuning a pick should have to think in those units, and a raw number invites a
// precision the weighting doesn't actually have (three picks and a nudge look identical to one
// deliberate 2.5). "A little / some / a lot" is the whole reader-facing vocabulary everywhere a
// human sets a weight by hand; `levelOf` is how this component reads a stored weight back into
// one of those three words, and `onLevel` hands back a `Level`, never a number. Turning it into a
// weight is the host's job, always through `weightOf`.
//
// **Why "off" is a fourth segment, not a separate button beside the control.** A pick a reader
// is looking at *right now* has exactly four states — three strengths plus "not this" — and the
// design treats leaving as just the fourth way to answer the same question. One control, one
// place to look, and `Segmented`'s own guard (a click on the already-checked segment fires
// nothing) is what keeps a stray tap on "some" from re-writing a pick that hasn't changed.

/** A topic as this list needs it — any `topics.list` row will do. */
export interface LevelTopic {
  id: string;
  label: string;
}

/** Topic id → weight. A `Map` so "is it picked" and "at what weight" are one lookup. */
export type Picks = ReadonlyMap<string, number>;

export interface TopicLevelsProps {
  /** `topics.list` rows — where the labels come from. */
  topics: readonly LevelTopic[];
  picks: Picks;
  /** Topics to keep on the page with "off" pressed — the questionnaire's reveal uses this so a
   *  switched-off proposal can be switched back on. `/profile/topics` passes none: there, off
   *  is a write, the row goes, and the search box is how a topic comes back. */
  off?: ReadonlySet<string>;
  /** Topics Ambit proposed rather than the reader — marked "suggested" so they can tell. */
  suggested?: ReadonlySet<string>;
  onLevel: (topicId: string, level: Level) => void;
  onOff: (topicId: string) => void;
}

// The segmented control's four options, built once at module scope — the three real levels plus
// the "off" pseudo-level, in the exact order the design calls for (§3).
const LEVEL_OPTIONS = [
  ...LEVELS.map((level) => ({ key: level, label: LEVEL_LABELS[level] })),
  // "Off" is not an achievement: selected, it wears the quiet fill (DESIGN §4.3).
  { key: "off" as const, label: LEVEL_LABELS.off, tone: "muted" as const },
];

export function TopicLevels({
  topics,
  picks,
  off,
  suggested,
  onLevel,
  onOff,
}: TopicLevelsProps) {
  if (picks.size === 0 && !off?.size) {
    return <p className="text-ink/62 text-[15px]">Nothing picked yet.</p>;
  }

  // Label order, never picks-insertion order — which would move a row every time a reader
  // re-picked something. A pick the list doesn't hold (a topic retired since) has no label to
  // show and is left out.
  const rows = topics
    .filter((t) => picks.has(t.id) || off?.has(t.id))
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="flex flex-col">
      {rows.map((topic) => {
        // A picked topic reads its level off its weight; an `off` one presses the fourth segment.
        const weight = picks.get(topic.id);
        const level = weight === undefined ? "off" : levelOf(weight);
        return (
          <div
            key={topic.id}
            role="group"
            aria-label={`${topic.label} level`}
            data-topic={topic.id}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2"
          >
            <span className="text-ink text-[15px]">
              {topic.label}
              {suggested?.has(topic.id) && (
                // The green mono "Proposed" tag — DESIGN §3.2 job 6, so it keeps the accent.
                <Eyebrow className="text-accent ml-2">suggested</Eyebrow>
              )}
            </span>
            <Segmented
              label="Level"
              options={LEVEL_OPTIONS}
              value={level}
              onChange={(key) => {
                if (key === "off") {
                  onOff(topic.id);
                } else {
                  onLevel(topic.id, key);
                }
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
