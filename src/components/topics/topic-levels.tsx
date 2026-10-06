"use client";

import * as React from "react";

import { Eyebrow } from "~/components/ui/eyebrow";
import { Segmented } from "~/components/ui/segmented";
import { cn } from "~/lib/utils";
import {
  LEVEL_LABELS,
  LEVELS,
  levelOf,
  type Level,
} from "~/server/config/topic-levels";
import type { TopicFacet } from "~/server/db/schema";

// The reader's topics as a list of levels — "how much of this?" for every topic they have.
// Two hosts render it: the questionnaire's reveal (`onboarding/reveal-step.tsx`), over the draft
// a reader is about to save, and `/profile/topics`, over their live picks.
//
// **Grouped under facet headings again (DESIGN_redesign decision 3, 10-06-26).** From 10-02-26
// this was one flat list, on Ben's verdict that the facets meant nothing to a reader; the
// redesign reverses that on purpose for these two screens only. The headings are reader words,
// not facet names — five of them over six facets (`medium` and `tradition` share one, `form` is
// "Writing"), in `HEADINGS`' order. Inside a heading, label order. A heading with no row
// is not drawn. The grouping lives here, not in either host, so the reveal and Profile → Topics
// cannot drift apart; `levelRowOrder` hands the drawn order to a host that needs it
// (topics-screen's focus hand-off after a removal).
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

/** A topic as this list needs it — any `topics.list` row will do. `facet` picks its heading;
 *  a topic without one (never pickable, so only a defensive case) is listed last, unheaded. */
export interface LevelTopic {
  id: string;
  label: string;
  facet?: TopicFacet | null;
}

/** The five headings (DESIGN_redesign §5.3 item 6), in the order they are drawn. */
export const HEADINGS = [
  "Subjects",
  "Mediums & traditions",
  "Looks",
  "Places",
  "Writing",
] as const;

/** Every facet's heading. A `Record`, so a facet added to `TopicFacet` is a compile error here
 *  until it is given a heading — never a silent unheaded row. */
export const FACET_HEADING: Record<TopicFacet, (typeof HEADINGS)[number]> = {
  subject: "Subjects",
  medium: "Mediums & traditions",
  tradition: "Mediums & traditions",
  look: "Looks",
  place: "Places",
  form: "Writing",
};

/** One heading's rows, as drawn. `heading` is null for the unfaceted tail. */
export interface LevelGroup<T extends LevelTopic> {
  heading: string | null;
  rows: T[];
}

/**
 * The rows this list draws, grouped: `topics` that are picked or kept `off`, under their
 * heading in `HEADINGS` order, label order inside each, empty headings dropped. A pick the
 * list doesn't hold (a topic retired since) has no label to show and is left out. Label order,
 * never picks-insertion order — which would move a row every time a reader re-picked something.
 */
export function groupLevelRows<T extends LevelTopic>(
  topics: readonly T[],
  picks: Picks,
  off?: ReadonlySet<string>,
): LevelGroup<T>[] {
  const rows = topics
    .filter((t) => picks.has(t.id) || off?.has(t.id))
    .sort((a, b) => a.label.localeCompare(b.label));
  const groups: LevelGroup<T>[] = HEADINGS.map((heading) => ({
    heading,
    rows: rows.filter(
      (t) => t.facet != null && FACET_HEADING[t.facet] === heading,
    ),
  }));
  // Only a topic with no facet at all lands here (the type rules out an unmapped one).
  groups.push({ heading: null, rows: rows.filter((t) => t.facet == null) });
  return groups.filter((g) => g.rows.length > 0);
}

/** Topic ids top to bottom, as `TopicLevels` draws them. */
export function levelRowOrder(
  topics: readonly LevelTopic[],
  picks: Picks,
  off?: ReadonlySet<string>,
): string[] {
  return groupLevelRows(topics, picks, off).flatMap((g) =>
    g.rows.map((t) => t.id),
  );
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
  /** Topics Ambit added itself rather than the reader's answers (DESIGN_redesign decision 4) —
   *  marked with the green "Proposed" tag above the name so they can tell. */
  proposed?: ReadonlySet<string>;
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
  proposed,
  onLevel,
  onOff,
}: TopicLevelsProps) {
  if (picks.size === 0 && !off?.size) {
    return <p className="text-ink/62 text-[15px]">Nothing picked yet.</p>;
  }

  const groups = groupLevelRows(topics, picks, off);

  return (
    <div className="flex flex-col">
      {groups.map((group) => (
        <div
          key={group.heading ?? "unheaded"}
          data-facet-group
          // 44 px between groups, the prototype's gap above a mono header.
          className="mt-11 first:mt-0"
        >
          {group.heading && (
            // A mono heading over its rule (DESIGN_redesign §5.3 item 6). The count is a glance
            // for sighted readers; a screen reader counts the rows itself.
            <div className="border-ink/16 flex items-baseline justify-between border-b pb-[10px]">
              <Eyebrow as="h3" className="text-[11px]">
                {group.heading}
              </Eyebrow>
              <Eyebrow aria-hidden="true" className="text-[11px]">
                {group.rows.length}
              </Eyebrow>
            </div>
          )}
          {group.rows.map((topic) => (
            <LevelRow
              key={topic.id}
              topic={topic}
              weight={picks.get(topic.id)}
              proposed={proposed?.has(topic.id) ?? false}
              onLevel={onLevel}
              onOff={onOff}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** One row (DESIGN_redesign §4.3): name block left — the "Proposed" tag above the name — the
 *  segmented control right, an `ink/8` hairline below. */
function LevelRow({
  topic,
  weight,
  proposed,
  onLevel,
  onOff,
}: {
  topic: LevelTopic;
  /** Undefined for a row kept on screen with "off" pressed. */
  weight: number | undefined;
  proposed: boolean;
  onLevel: (topicId: string, level: Level) => void;
  onOff: (topicId: string) => void;
}) {
  // A picked topic reads its level off its weight; an `off` one presses the fourth segment.
  const level = weight === undefined ? "off" : levelOf(weight);
  return (
    <div
      role="group"
      aria-label={`${topic.label} level`}
      data-topic={topic.id}
      className="border-ink/8 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b py-3"
    >
      <div className="min-w-0">
        {proposed && (
          // The green mono "Proposed" tag — DESIGN §3.2 job 6, so it keeps the accent.
          <Eyebrow className="text-accent mb-[6px] block">Proposed</Eyebrow>
        )}
        <span
          className={cn(
            "block text-[18px] leading-[1.25]",
            // An "off" row's name steps back with its quiet segment (the Profile prototype).
            level === "off" ? "text-ink/40" : "text-ink",
          )}
        >
          {topic.label}
        </span>
      </div>
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
}
