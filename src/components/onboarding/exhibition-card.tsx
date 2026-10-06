"use client";

import { Eyebrow } from "~/components/ui/eyebrow";
import { WINGS } from "~/server/config/interview-wings";
import { TEMPERAMENT_DIMENSIONS } from "~/server/config/temperament";
import { WRITING_KIND_LABELS } from "~/server/config/writing";
import { activePole, compassSentence } from "~/lib/interview/compass";
import { exhibitionSubtitle, readingSummary } from "~/lib/interview/exhibition";
import { FRAME } from "~/lib/interview/frame";
import type { TasteV1 } from "~/lib/interview/taste";
import { cn } from "~/lib/utils";

// The reveal's head (docs/DESIGN_first-exhibition.md §6) — the reader's first exhibition, named:
// title, subtitle, the temperament strip, the travel compass and "You’d open". Rendered above
// the levels list on the reveal and again on /profile/topics from the stored taste. Set in Hanken Grotesk
// like everything else (Ben: no serif). Pure presentation; every number arrives in `taste`, the
// frame's words come from lib/interview/frame.ts, and the sentences are exhibition.ts's.

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
        className="bg-ink/8 h-[6px] flex-1 overflow-hidden"
      >
        {/* Ink, not green: a meter's fill is not one of the accent's seven jobs (DESIGN §3.2). */}
        <div className="bg-ink h-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** A bipolar bar: −1 at the left pole, +1 at the right. The pole the reader leans to is set in
 *  ink and the other left grey — the same cut as the sentence under the bars (`activePole`). */
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
  const lean = activePole(value);
  const tone = (on: boolean) => (on ? "text-ink-hi" : "text-ink/62");
  return (
    <div className="flex items-center gap-3 text-[12px]">
      <span
        data-on={lean === "minus"}
        className={cn("w-[52px] shrink-0 text-right", tone(lean === "minus"))}
      >
        {left}
      </span>
      <div className="bg-ink/8 relative h-[6px] flex-1">
        {/* The compass marker — DESIGN §3.2 job 2, so it stays green — as a 9 px dot (the
            sizes no-rounded.test.ts's DOTS rule excuses). */}
        <span
          className="bg-accent absolute top-1/2 size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ left: `${pct}%` }}
        />
      </div>
      <span
        data-on={lean === "plus"}
        className={cn("w-[52px] shrink-0", tone(lean === "plus"))}
      >
        {right}
      </span>
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
  const subtitle = exhibitionSubtitle(
    taste.wings.map(wingLabel),
    taste.mediums.map((id) => topicLabels.get(id) ?? id),
  );
  const sentence = taste.compass ? compassSentence(taste.compass) : "";
  const reading = readingSummary(taste);

  return (
    <section
      aria-label={FRAME.eyebrow}
      className="border-hairline border-ink/12 p-5"
    >
      <Eyebrow as="p" className="block">
        {FRAME.eyebrow}
      </Eyebrow>
      <h2 className="text-ink-hi mt-2 text-[30px] leading-[1.1] tracking-[-0.4px]">
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
        <Eyebrow as="p" className="block">
          Temperament
        </Eyebrow>
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
          <Eyebrow as="p" className="block">
            Travel compass
          </Eyebrow>
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

      {taste.opened.length === 0 ? (
        // No card was opened: the sentence alone, with no "You’d open" over an empty list.
        <p className="text-ink/82 mt-6 text-[14px]">{reading}</p>
      ) : (
        <div className="mt-6">
          <Eyebrow as="p" className="block">
            You’d open
          </Eyebrow>
          <ul className="mt-2 flex flex-col gap-2">
            {taste.opened.map((o) => (
              <li key={o.itemId} className="text-[14px] leading-[1.4]">
                <Eyebrow>
                  {WRITING_KIND_LABELS[o.kind]} · {o.minutes} min
                </Eyebrow>
                <br />
                <span className="text-ink-hi">{o.title}</span>
              </li>
            ))}
          </ul>
          <p className="text-ink/82 mt-2 text-[14px]">{reading}</p>
        </div>
      )}
    </section>
  );
}
