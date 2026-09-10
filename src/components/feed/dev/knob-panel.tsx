"use client";

import * as React from "react";

import { Button } from "~/components/ui/button";
import { Slider } from "~/components/ui/slider";
import type { FeedCard } from "~/server/services/feed";
import type { FeedKnobs } from "~/server/services/feed-knobs";
import { sumStats, type PageStats } from "./feed-stats";
import { KNOB_SPECS } from "./use-dev-knobs";

// The drawer (plan 09-05-26, Decision D8): a fixed right column of sliders and readouts. It is
// the Phase 0.5 bench's `<aside id="knobs">` rebuilt in the app's own tokens, plus the readouts
// the bench never had — per-page and per-session tier counts, the original/grown split, and the
// drift paths of the last page with their sims, which is the "why" the feel question needs.
//
// Purely presentational: every number comes in as a prop and every action goes out as a
// callback. FeedScreen owns the query, the forget cycle and the stats.
export interface KnobPanelProps {
  knobs: FeedKnobs;
  onSet: (k: keyof FeedKnobs, v: number) => void;
  onReset: () => void;
  onCopy: () => void;
  onRestart: () => void;
  pageStats: PageStats[];
  topicLabels: Record<string, string>;
  lastPage: FeedCard[];
  served: number;
  forgotten: number;
  forgetError: string | null;
}

const SECTIONS = [
  "Tier mix",
  "Taste",
  "Drift shape",
  "Grown topics",
  "Diversity",
] as const;

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-accent text-[11px] font-semibold tracking-[0.6px] uppercase">
      {children}
    </h3>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-ink/62 shrink-0 text-[12px]">{label}</span>
      <span className="text-ink text-right text-[12px] tabular-nums">
        {value}
      </span>
    </div>
  );
}

function StatsBlock({
  title,
  stats,
  topicLabels,
}: {
  title: string;
  stats: PageStats;
  topicLabels: Record<string, string>;
}) {
  const pct = (n: number) =>
    stats.cards ? Math.round((100 * n) / stats.cards) : 0;
  const top = (m: Map<string, number>, n: number) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  return (
    <div className="flex flex-col gap-1">
      <SectionLabel>{title}</SectionLabel>
      <Stat label="cards" value={stats.cards} />
      <Stat
        label="tiers"
        value={`CORE ${stats.tiers.CORE} · DRIFT ${stats.tiers.DRIFT} · JUMP ${stats.tiers.JUMP} · WILD ${stats.tiers.WILD}`}
      />
      <Stat
        label="original / grown / wild"
        value={`${stats.original} (${pct(stats.original)}%) / ${stats.grown} (${pct(stats.grown)}%) / ${stats.wild} (${pct(stats.wild)}%)`}
      />
      <Stat
        label="topics"
        value={top(stats.topics, 6)
          .map(([id, n]) => `${topicLabels[id] ?? id} ${n}`)
          .join(" · ")}
      />
      <Stat
        label="sources"
        value={top(stats.sources, 5)
          .map(([s, n]) => `${s} ${n}`)
          .join(" · ")}
      />
    </div>
  );
}

export function KnobPanel({
  knobs,
  onSet,
  onReset,
  onCopy,
  onRestart,
  pageStats,
  topicLabels,
  lastPage,
  served,
  forgotten,
  forgetError,
}: KnobPanelProps) {
  const [open, setOpen] = React.useState(true);
  const tierTotal =
    knobs.tierCore + knobs.tierDrift + knobs.tierJump + knobs.tierWild;
  const share = (n: number) =>
    tierTotal ? Math.round((100 * n) / tierTotal) : 0;
  const session = sumStats(pageStats);
  const last = pageStats.at(-1);
  const name = (id: string) => topicLabels[id] ?? id;

  return (
    <aside
      data-testid="knob-panel"
      className={[
        "bg-surface border-ink/12 fixed top-0 right-0 z-30 flex h-dvh w-[340px] flex-col border-l",
        "shadow-sheet transition-transform duration-200",
        open ? "translate-x-0" : "translate-x-[calc(100%-36px)]",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-ink/62 hover:text-ink bg-surface border-ink/12 absolute top-3 left-0 -translate-x-full rounded-l-md border border-r-0 px-2 py-1 text-[11px]"
        aria-label={open ? "Collapse knob panel" : "Expand knob panel"}
      >
        {open ? "›" : "‹ tune"}
      </button>

      <div className="flex flex-col gap-5 overflow-y-auto px-4 pt-4 pb-8">
        <div className="flex items-center justify-between">
          <h2 className="text-ink-hi text-[15px] font-semibold">
            Composition knobs
          </h2>
          <span className="text-ink/40 text-[11px]">dev · FEED_DEBUG</span>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" shape="pill" onClick={onRestart}>
            Restart feed
          </Button>
          <Button size="sm" variant="ghost" shape="pill" onClick={onReset}>
            Reset knobs
          </Button>
          <Button size="sm" variant="accent" shape="pill" onClick={onCopy}>
            Copy JSON
          </Button>
        </div>

        <div className="flex flex-col gap-1">
          <Stat label="served this session" value={served} />
          <Stat label="forgotten so far" value={forgotten} />
          {forgetError ? (
            <p className="text-error text-[12px]">{forgetError}</p>
          ) : (
            <p className="text-ink/40 text-[11px]">
              Every apply forgets the pages this session served. Nothing tuned
              here stays in seen_item.
            </p>
          )}
        </div>

        {SECTIONS.map((section) => (
          <div key={section} className="flex flex-col gap-3">
            <SectionLabel>
              {section}
              {section === "Tier mix"
                ? ` · ${share(knobs.tierCore)} / ${share(knobs.tierDrift)} / ${share(knobs.tierJump)} / ${share(knobs.tierWild)}`
                : null}
            </SectionLabel>
            {KNOB_SPECS.filter((s) => s.section === section).map((s) => (
              <Slider
                key={s.key}
                label={s.label}
                value={knobs[s.key]}
                min={s.min}
                max={s.max}
                step={s.step}
                note={s.note}
                onCommit={(v) => onSet(s.key, v)}
              />
            ))}
          </div>
        ))}

        {last ? (
          <StatsBlock
            title="Last page"
            stats={last}
            topicLabels={topicLabels}
          />
        ) : null}
        <StatsBlock title="Session" stats={session} topicLabels={topicLabels} />

        {lastPage.length > 0 ? (
          <div className="flex flex-col gap-1">
            <SectionLabel>Last page — why</SectionLabel>
            <ol className="flex flex-col gap-[2px]">
              {lastPage.map((c) => (
                <li
                  key={c.item.id}
                  className="text-ink/62 text-[11px] leading-snug"
                >
                  <span className="text-ink tabular-nums">{c.tier}</span>{" "}
                  {c.driftPath
                    ? c.driftPath.map(name).join(" → ")
                    : name(c.topicId ?? "∅")}
                  {c.debug ? (
                    <span className="text-ink/40">
                      {" "}
                      · {c.debug.curationScore}
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
