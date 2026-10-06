import {
  activePole,
  compassSentence,
  type Axes,
} from "~/lib/interview/compass";
import { cn } from "~/lib/utils";

import { SectionHeader } from "./section-header";

// The travel compass (docs/DESIGN_redesign.md §5.3 item 5, right column): the sentence, then four
// rows `64px | 1fr | 64px` — a pole each side of a hairline, a 9 px green dot at the value (the
// compass marker is the accent's job 2). The **plus pole sits on the left** (Wild / Built,
// Old / New, Quiet / Lively, Far / Near — the prototype's order, the copy deck's New cell), so
// +1 puts the dot at the left end. The pole the reader leans to is set in ink and the other
// left at `ink/40` — `activePole`'s cut, the same as the sentence's, so a row never claims a
// pole the sentence left out. Shared by the reveal and /profile/topics.

/** Each axis's poles as the rows print them: plus first. */
export const COMPASS_ROWS: readonly [keyof Axes, string, string][] = [
  ["wild", "Wild", "Built"],
  ["old", "Old", "New"],
  ["still", "Quiet", "Lively"],
  ["far", "Far", "Near"],
];

export function Compass({ compass }: { compass: Axes }) {
  const sentence = compassSentence(compass);
  return (
    <div role="group" aria-label="Travel compass">
      <SectionHeader title="Travel compass" count={COMPASS_ROWS.length} />
      {sentence && (
        <p className="text-ink/55 mt-3 mb-1 text-[14px] leading-[1.45]">
          {sentence}
        </p>
      )}
      {COMPASS_ROWS.map(([axis, plus, minus]) => {
        const value = compass[axis];
        const lean = activePole(value);
        // +1 at the left end, −1 at the right.
        const pct = Math.round(((1 - value) / 2) * 100);
        const tone = (on: boolean) => (on ? "text-ink" : "text-ink/40");
        return (
          <div
            key={axis}
            className="border-ink/8 grid grid-cols-[64px_minmax(0,1fr)_64px] items-center gap-3 border-b py-4 font-mono text-[10.5px] uppercase"
          >
            <span data-on={lean === "plus"} className={tone(lean === "plus")}>
              {plus}
            </span>
            <div className="bg-ink/22 relative h-px">
              <span
                aria-hidden="true"
                className="bg-accent absolute top-1/2 size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ left: `${pct}%` }}
              />
            </div>
            <span
              data-on={lean === "minus"}
              className={cn("text-right", tone(lean === "minus"))}
            >
              {minus}
            </span>
          </div>
        );
      })}
    </div>
  );
}
