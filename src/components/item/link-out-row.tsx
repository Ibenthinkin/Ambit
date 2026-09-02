import { ChevronRight } from "~/components/icons";
import { sourceLabel } from "~/lib/source-label";
import { isBlogSource } from "~/server/config/blogs";
import { PDR } from "~/server/config/pdr";

// The prominent link-out that makes a blog item read as a link preview rather than a
// republication (Phase 6.3, docs/PHASE6_DESIGN_6.3.md §7). The credit line already links every
// item's source; this row is the blog-specific extra `credit-line.tsx` reserved for 6.3 — the
// call-to-action, full width, under the blurb, on the two surfaces that show item text.
//
// Server-safe on purpose: no hooks, no handlers, a plain anchor — so `ImageItemBody` stays a
// server component (React refuses a function prop on a host element there, which is why the
// `stopPropagation` the gallery sheet needs lives on a wrapper in the sheet, not here).
//
// No prototype in the handoff shows this element; it borrows the pill's row idiom (a rounded,
// ink-tinted, ≥44px target) rather than inventing a new one. (09-02-26: also rendered for `pdr`
// — see the guard.)
export interface LinkOutRowProps {
  source: string;
  sourceUrl: string;
  className?: string;
}

export function LinkOutRow({ source, sourceUrl, className }: LinkOutRowProps) {
  // Blogs, and the one publication that earns the same prominent row without being a blog: a
  // PDR collection's page holds the full gallery, an essay card's page holds the essay.
  const isPdr = source === PDR.id;
  if (!isBlogSource(source) && !isPdr) return null;
  const copy = isPdr
    ? `See it on ${PDR.label}`
    : `Read the post on ${sourceLabel(source)}`;
  return (
    <a
      href={sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={
        "bg-ink/6 text-ink-hi mt-[22px] flex h-12 w-full items-center justify-between " +
        "rounded-[14px] px-[16px] text-[15px] font-semibold transition-transform" +
        "duration-150 active:scale-[0.98]" +
        (className ?? "")
      }
    >
      <span>{copy}</span>
      <ChevronRight className="text-ink/50" />
    </a>
  );
}
