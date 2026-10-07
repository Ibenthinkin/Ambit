import { TextLink } from "~/components/ui/text-link";
import { sourceLabel } from "~/lib/source-label";

// `from Wikipedia ↗` — one line under every item's title, on both variants, linking out to where
// the thing actually lives (DESIGN_redesign §6.2: 14 px `ink/55`, the source an underlined ink
// link — `TextLink external` supplies the underline and the arrow).
//
// **Every source, not just blogs.** The 08-20-26 rights decision (CLAUDE.md, BUILD_PLAN 6.3) asks
// for a visible credit and a prominent link back on designated blogs; generalizing it to the whole
// corpus costs nothing and is simply more honest — a Met object and a Wikipedia article both
// belong to someone, and the reader should be one tap from the original in either case.
export interface CreditLineProps {
  source: string;
  sourceUrl: string;
}

export function CreditLine({ source, sourceUrl }: CreditLineProps) {
  return (
    <p className="text-ink/55 mt-[10px] text-[14px]">
      from{" "}
      <TextLink href={sourceUrl} external tone="body">
        {sourceLabel(source)}
      </TextLink>
    </p>
  );
}
