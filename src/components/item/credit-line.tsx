import { sourceLabel } from "~/lib/source-label";

// `from: Wikipedia` — one line under every item's title, on both variants, linking out to where
// the thing actually lives.
//
// **Every source, not just blogs.** The 08-20-26 rights decision (CLAUDE.md, BUILD_PLAN 6.3) asks
// for a visible credit and a prominent link back on designated blogs; generalizing it to the whole
// corpus costs nothing and is simply more honest — a Met object and a Wikipedia article both
// belong to someone, and the reader should be one tap from the original in either case.
//
// The blog-specific extras — the standing blurb, the heavier link-out treatment that makes the
// card read as a link preview rather than a republication — are 6.3's, deliberately not here.
export interface CreditLineProps {
  source: string;
  sourceUrl: string;
}

export function CreditLine({ source, sourceUrl }: CreditLineProps) {
  return (
    <p className="text-ink/50 mt-[10px] text-[13px]">
      from:{" "}
      <a
        href={sourceUrl}
        target="_blank"
        rel="noopener"
        className="text-accent underline-offset-2 hover:underline"
      >
        {sourceLabel(source)}
      </a>
    </p>
  );
}
