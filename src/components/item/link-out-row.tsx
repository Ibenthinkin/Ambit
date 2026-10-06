import { sourceLabel } from "~/lib/source-label";
import { cn } from "~/lib/utils";
import { isBlogSource } from "~/server/config/blogs";
import { PDR } from "~/server/config/pdr";
import { isLinkCardSource } from "~/server/config/publications";

// The white "Read the original on <source> ↗" block (DESIGN_redesign §6.2): on **every** item with
// a source URL, under the picture's facts. The credit line and the From row already link the
// source quietly; this is the call-to-action — and, on a designated blog, the link-out that makes
// the card read as a link preview rather than a republication (Phase 6.3,
// docs/PHASE6_DESIGN_6.3.md §7).
//
// Server-safe on purpose: no hooks, no handlers, a plain anchor — so it renders unchanged inside
// the reader (a server component) and inside `ItemFacts` under the client `ItemScreen` alike.
// The reader still asks `hasLinkOutRow` before using it: an open source's article keeps its quiet
// inline link there (writing Phase 4).
export interface LinkOutRowProps {
  source: string;
  sourceUrl: string;
  className?: string;
}

/** Whether `LinkOutRow` renders for a source — exported so the reader knows not to add its own
 *  inline link beside it. */
export function hasLinkOutRow(source: string): boolean {
  return isLinkCardSource(source) || source === PDR.id;
}

export function LinkOutRow({ source, sourceUrl, className }: LinkOutRowProps) {
  if (!sourceUrl) return null;
  // The link-card sources and PDR keep their own verbs; everything else is "the original".
  const copy =
    source === PDR.id
      ? `See it on ${PDR.label}`
      : isBlogSource(source)
        ? `Read the post on ${sourceLabel(source)}`
        : isLinkCardSource(source)
          ? `Read it on ${sourceLabel(source)}`
          : `Read the original on ${sourceLabel(source)}`;
  return (
    <a
      href={sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "bg-ink text-on-accent mt-[24px] flex min-h-[50px] w-full items-center justify-between gap-3 px-4 py-[15px] text-[15px] transition-colors duration-150 hover:bg-white hover:shadow-[inset_0_-2px_0_var(--color-accent)] active:bg-[#E6E6E6]",
        className,
      )}
    >
      <span>{copy}</span>
      <span aria-hidden="true">↗</span>
    </a>
  );
}
