"use client";

import { WINGS } from "~/server/config/interview-wings";
import { TEMPERAMENT_DIMENSIONS } from "~/server/config/temperament";
import { WRITING_KIND_LABELS } from "~/server/config/writing";
import { compassSentence } from "~/lib/interview/compass";
import { LONG_READ_MINUTES } from "~/lib/interview/picks";
import type { TasteV1 } from "~/lib/interview/taste";

// The reveal's head (docs/DESIGN_first-exhibition.md §6) — the reader's first exhibition, named:
// title, subtitle, the temperament strip, the travel compass and "You’d open". Rendered above
// the levels list on the reveal and again on /profile/topics from the stored taste. Set in Sora
// like everything else (Ben: no serif). Pure presentation; every number arrives in `taste`.

/** "You like something short" at or under this mean; "a long read" at or over LONG_READ_MINUTES + 2. */
const SHORT_READER_MAX = 4;
const LONG_READER_MIN = LONG_READ_MINUTES + 2;

const EYEBROW =
  "text-accent font-sans text-[11px] font-semibold tracking-[1.8px] uppercase";

function Bar({
  label,
  value,
  gloss,
}: {
  label: string;
  value: number;
  gloss?: string;
}) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-3" title={gloss}>
      <span className="text-ink/82 w-[92px] shrink-0 text-[13px]">{label}</span>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="bg-ink/8 h-[6px] flex-1 overflow-hidden rounded-full"
      >
        <div
          className="bg-accent h-full rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** A bipolar bar: −1 at the left pole, +1 at the right. */
function Pole({
  left,
  right,
  value,
}: {
  left: string;
  right: string;
  value: number;
}) {
  const pct = Math.round(((value + 1) / 2) * 100);
  return (
    <div className="flex items-center gap-3 text-[12px]">
      <span className="text-ink/62 w-[52px] shrink-0 text-right">{left}</span>
      <div className="bg-ink/8 relative h-[6px] flex-1 rounded-full">
        <span
          className="bg-accent absolute top-1/2 h-[12px] w-[12px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ left: `${pct}%` }}
        />
      </div>
      <span className="text-ink/62 w-[52px] shrink-0">{right}</span>
    </div>
  );
}

export function ExhibitionCard({
  taste,
  topicLabels,
}: {
  taste: TasteV1;
  topicLabels: ReadonlyMap<string, string>;
}) {
  const wingLabel = (id: string) => WINGS.find((w) => w.id === id)?.label ?? id;
  const subtitle = [
    ...taste.wings.map(wingLabel),
    ...taste.mediums.map((id) => topicLabels.get(id) ?? id),
  ].join(" · ");
  const sentence = taste.compass ? compassSentence(taste.compass) : "";
  const readerLine =
    taste.readingMinutes === null
      ? null
      : taste.readingMinutes >= LONG_READER_MIN
        ? "You like a long read."
        : taste.readingMinutes <= SHORT_READER_MAX
          ? "You like something short."
          : null;

  return (
    <section
      aria-label="Your first exhibition"
      className="border-hairline border-ink/12 p-5"
    >
      <p className={EYEBROW}>Your first exhibition</p>
      <h2 className="text-ink-hi mt-2 text-[30px] leading-[1.1] font-semibold tracking-[-0.4px]">
        {taste.title.adjective} {taste.title.noun}
      </h2>
      {subtitle && (
        <p className="text-ink/62 mt-2 text-[14px] leading-[1.5]">{subtitle}</p>
      )}

      <div
        role="group"
        aria-label="Temperament"
        className="mt-6 flex flex-col gap-2"
      >
        <p className={EYEBROW}>Temperament</p>
        {TEMPERAMENT_DIMENSIONS.map((d) => (
          <Bar
            key={d.id}
            label={d.label}
            gloss={d.gloss}
            value={taste.temperament[d.id]}
          />
        ))}
      </div>

      {taste.compass && (
        <div
          role="group"
          aria-label="Travel compass"
          className="mt-6 flex flex-col gap-2"
        >
          <p className={EYEBROW}>Travel compass</p>
          <Pole left="Built" right="Wild" value={taste.compass.wild} />
          <Pole left="New" right="Old" value={taste.compass.old} />
          <Pole left="Lively" right="Still" value={taste.compass.still} />
          <Pole left="Near" right="Far" value={taste.compass.far} />
          {sentence && (
            <p className="text-ink/82 mt-1 text-[14px] leading-[1.5]">
              {sentence}
            </p>
          )}
        </div>
      )}

      {taste.opened.length > 0 && (
        <div className="mt-6">
          <p className={EYEBROW}>You’d open</p>
          <ul className="mt-2 flex flex-col gap-2">
            {taste.opened.map((o) => (
              <li key={o.itemId} className="text-[14px] leading-[1.4]">
                <span className="text-ink/45 font-sans text-[11px] font-semibold tracking-[1.8px] uppercase">
                  {WRITING_KIND_LABELS[o.kind]} · {o.minutes} min
                </span>
                <br />
                <span className="text-ink-hi">{o.title}</span>
              </li>
            ))}
          </ul>
          {readerLine && (
            <p className="text-ink/82 mt-2 text-[14px]">{readerLine}</p>
          )}
        </div>
      )}
    </section>
  );
}
