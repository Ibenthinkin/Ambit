import * as React from "react";

import { Diamond } from "~/components/icons";

// The serendipity tile — the feed's one moment of self-explanation, and the only place the topic
// drift engine (SPEC §9) surfaces as something the reader can see. It sits immediately above the
// card it's explaining.
//
// **Inert on purpose**: no tap, no long press, nothing to save. It isn't an item; it's a caption
// for the item below it, and a tappable one would just be a second, worse way into the same page.
//
// The two stacked lines *are* the from→to — there's no arrow glyph. "you've been exploring
// Botany" over "Astronomy" in accent reads as the jump without drawing one
// (PHASE5_PLAN_5.6.md Decision 2).
export interface BecauseTileProps {
  from: string;
  to: string;
}

export function BecauseTile({ from, to }: BecauseTileProps) {
  return (
    <div className="border-hairline bg-ink/3 border-ink/6 border px-[13px] py-4">
      <div className="flex items-center gap-[7px]">
        <Diamond size={8} className="text-accent" />
        <span className="text-ink/34 text-[9.5px] font-semibold tracking-[1.3px] uppercase">
          Because
        </span>
      </div>
      <p className="text-ink/50 mt-[9px] text-[12px] leading-[1.5]">
        you&apos;ve been exploring {from}
      </p>
      <p className="text-accent mt-[6px] text-[15px] leading-[1.35]">{to}</p>
    </div>
  );
}
