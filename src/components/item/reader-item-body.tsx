import { Eyebrow } from "~/components/ui/eyebrow";
import { TextLink } from "~/components/ui/text-link";
import { sourceLabel } from "~/lib/source-label";
import type { Item } from "~/server/db/items";
import { CreditLine } from "./credit-line";
import { hasLinkOutRow, LinkOutRow } from "./link-out-row";
import { ReaderBlocks } from "./reader-blocks";
import { ReuseNotice } from "./reuse-notice";

// The reader variant of `/i/[itemId]`: an article, typeset.
//
// The body comes from the stored `body` column and nothing else — no runtime fetch, no HTML from
// the source, so no sanitizing question to get wrong. `ReaderBlocks` (./reader-blocks.tsx, over
// src/lib/reader-blocks.ts) turns that plain text into headings and paragraphs; a body with no
// section markers (every row ingested before 5.7's adapter flip) simply reads as continuous prose.
// That block list was extracted into its own component on 09-02-26 so the image variant could
// typeset a Public Domain Review collection's preamble with the same ramp.
//
// The link-out at the foot is the generalized version of the blog posture (CLAUDE.md's 08-20-26
// rights decision): the reader should always be one tap from the original. Blog-specific framing
// is 6.3's.
export interface ReaderItemBodyProps {
  item: Item;
}

export function ReaderItemBody({ item }: ReaderItemBodyProps) {
  return (
    <article>
      <Eyebrow as="p" className="block">
        {sourceLabel(item.source)}
      </Eyebrow>

      <h1 className="text-ink-hi mt-[10px] text-[30px] leading-[1.16]">
        {item.title}
      </h1>

      <CreditLine source={item.source} sourceUrl={item.sourceUrl} />

      {/* The lede. When there's no stored body this is the whole read, which is why it isn't
          folded into the block list — it's always here, and always set larger. */}
      {item.summary ? (
        <p className="text-ink/62 mt-[16px] text-[17px] leading-[1.5]">
          {item.summary}
        </p>
      ) : null}

      <div className="bg-ink/10 mt-[22px] h-[0.5px] w-full" />

      <ReuseNotice item={item} />

      <div className="mt-[20px]">
        {item.body ? <ReaderBlocks body={item.body} /> : null}
      </div>

      {/* One link out at the foot, never two (writing Phase 4). A link-card or PDR piece gets the
          prominent row the image page uses; an open source's article (Wikipedia, PoetryDB,
          Loupe) keeps the quiet inline link — its body is the whole read, and the row's
          "go there instead" weight would be wrong for it. */}
      {hasLinkOutRow(item.source) ? (
        <LinkOutRow source={item.source} sourceUrl={item.sourceUrl} />
      ) : (
        // Task 4.5 turns this into the bracket form; until then the label (and e2e's name for it)
        // stays as it was.
        <TextLink
          href={item.sourceUrl}
          external
          className="mt-[6px] inline-block text-[14px]"
        >
          Read on {sourceLabel(item.source)} →
        </TextLink>
      )}
    </article>
  );
}
