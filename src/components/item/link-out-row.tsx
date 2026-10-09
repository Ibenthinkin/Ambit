import { LinkOutAnchor } from "~/components/item/link-out-anchor";
import { PRIMARY_BLOCK } from "~/components/ui/button";
import { sourceLabel } from "~/lib/source-label";
import { cn } from "~/lib/utils";
import { isBlogSource } from "~/server/config/blogs";
import { PDR } from "~/server/config/pdr";
import { isLinkCardSource } from "~/server/config/publications";

// The white "Original post" / "Original source" button: on **every** item with a source URL,
// under the picture's facts. The credit line and the From row already link the source quietly
// and by name; this is the call-to-action — and, on a designated blog, the link-out that makes
// the card read as a link preview rather than a republication (Phase 6.3,
// docs/PHASE6_DESIGN_6.3.md §7).
//
// DESIGN_redesign §6.2 drew it as a full-width 50 px block reading "Read the post on <source> ↗".
// Ben's phone look at the deployed redesign (10-08-26) overruled that: with the name and the
// arrow it "looked like a whole page divided section", not a button. So it is a button now —
// inline, 40 px, two words, no glyph; the source's name stays in the From row, two lines up. The
// desktop's bracketed link in the summary keeps `linkOutCopy`'s full sentence, because there the
// link is a line of prose, not a control.
//
// Server-safe on purpose: it has no hooks or handlers of its own — the anchor is the tiny client
// island `LinkOutAnchor`, which only records the click — so it renders unchanged inside
// the reader (a server component) and inside `ItemFacts` under the client `ItemScreen` alike.
// The reader still asks `prefersLinkOutBlock` before using it: an open source's article keeps its quiet
// inline link there (writing Phase 4).
export interface LinkOutRowProps {
  source: string;
  sourceUrl: string;
  /** Which item the click is recorded against (`item.linkout`). */
  itemId: string;
  className?: string;
}

/** Whether an *article* from this source ends on the white block rather than the quiet bracket
 *  link — link-card sources and PDR do; an open source's article (Wikipedia, PoetryDB, Loupe) does
 *  not. (Pictures always get the block: `LinkOutRow` itself renders for any source URL.) */
export function prefersLinkOutBlock(source: string): boolean {
  return isLinkCardSource(source) || source === PDR.id;
}

/** The button's label: a blog's or a publication's item is a *post*; a museum's, a library's or
 *  PDR's is a *source*. Two words either way — the name is in the From row. */
export function linkOutLabel(source: string): string {
  return isBlogSource(source) || isLinkCardSource(source)
    ? "Original post"
    : "Original source";
}

/** The link-out as a sentence, for the desktop summary's bracketed prose link: PDR, blogs and
 *  link-card publications keep their own verbs; everything else is "the original". */
export function linkOutCopy(source: string): string {
  if (source === PDR.id) return `See it on ${PDR.label}`;
  if (isBlogSource(source)) return `Read the post on ${sourceLabel(source)}`;
  if (isLinkCardSource(source)) return `Read it on ${sourceLabel(source)}`;
  return `Read the original on ${sourceLabel(source)}`;
}

export function LinkOutRow({
  source,
  sourceUrl,
  itemId,
  className,
}: LinkOutRowProps) {
  if (!sourceUrl) return null;
  return (
    <LinkOutAnchor
      itemId={itemId}
      href={sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        PRIMARY_BLOCK,
        "mt-[24px] inline-flex h-[40px] items-center px-[18px] text-[14px] whitespace-nowrap",
        className,
      )}
    >
      {linkOutLabel(source)}
    </LinkOutAnchor>
  );
}
