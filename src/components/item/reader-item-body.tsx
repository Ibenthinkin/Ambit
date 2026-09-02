import { sourceLabel } from "~/lib/source-label";
import type { Item } from "~/server/db/items";
import { CreditLine } from "./credit-line";
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
      <p className="text-accent text-[10.5px] font-semibold tracking-[1.3px] uppercase">
        {sourceLabel(item.source)}
      </p>

      <h1 className="text-ink-hi mt-[10px] text-[30px] leading-[1.16] font-semibold">
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

      <a
        href={item.sourceUrl}
        target="_blank"
        rel="noopener"
        className="text-accent mt-[6px] inline-block text-[14px] font-medium"
      >
        Read on {sourceLabel(item.source)} →
      </a>
    </article>
  );
}
