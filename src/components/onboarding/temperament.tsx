import { TEMPERAMENT_DIMENSIONS } from "~/server/config/temperament";
import type { Temperament as TemperamentValues } from "~/lib/interview/temperament";

import { SectionHeader, type SectionHeadingLevel } from "./section-header";

// The temperament strip (docs/DESIGN_redesign.md §5.3 item 5, left column): five rows, each a
// name and its gloss over a hairline that carries a 3 px ink bar to the value. Ink, not green —
// a meter's fill is not one of the accent's seven jobs (§3.2). Shared by the reveal and
// /profile/topics; every number arrives in `temperament` (lib/interview/temperament.ts).

/** The one-line intro under the header (the copy deck's "Temperament intro"). */
export const TEMPERAMENT_INTRO =
  "Five dimensions that hold across music, film and books. Kept now, they can seed what you watch and listen to later.";

export function Temperament({
  temperament,
  headingLevel,
}: {
  temperament: TemperamentValues;
  headingLevel?: SectionHeadingLevel;
}) {
  return (
    <div role="group" aria-label="Temperament">
      <SectionHeader
        title="Temperament"
        level={headingLevel}
        count={TEMPERAMENT_DIMENSIONS.length}
      />
      <p className="text-ink/55 mt-3 mb-1 text-[14px] leading-[1.45]">
        {TEMPERAMENT_INTRO}
      </p>
      {TEMPERAMENT_DIMENSIONS.map((d) => {
        const pct = Math.round(temperament[d.id] * 100);
        return (
          <div key={d.id} className="border-ink/8 border-b py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-ink-hi text-[17px]">{d.label}</span>
              <span className="text-ink/55 text-right text-[13px]">
                {d.gloss}
              </span>
            </div>
            <div
              role="meter"
              aria-label={d.label}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              className="bg-ink/14 relative mt-[10px] h-px"
            >
              <div
                className="bg-ink absolute top-[-1px] left-0 h-[3px]"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
