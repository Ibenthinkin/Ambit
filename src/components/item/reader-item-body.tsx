import { parseReaderBlocks } from "~/lib/reader-blocks";
import { sourceLabel } from "~/lib/source-label";
import type { Item } from "~/server/db/items";
import { CreditLine } from "./credit-line";

// The reader variant of `/i/[itemId]`: an article, typeset.
//
// The body comes from the stored `body` column and nothing else — no runtime fetch, no HTML from
// the source, so no sanitizing question to get wrong. `parseReaderBlocks` (src/lib/reader-blocks.ts)
// turns that plain text into headings and paragraphs; a body with no section markers (every row
// ingested before 5.7's adapter flip) simply reads as continuous prose.
//
// The link-out at the foot is the generalized version of the blog posture (CLAUDE.md's 08-20-26
// rights decision): the reader should always be one tap from the original. Blog-specific framing
// is 6.3's.
export interface ReaderItemBodyProps {
  item: Item;
}

export function ReaderItemBody({ item }: ReaderItemBodyProps) {
  const blocks = parseReaderBlocks(item.body ?? "");

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

      <div className="mt-[20px]">
        {blocks.map((block, index) => {
          // Index keys are safe here and only here: the block list is derived from an immutable
          // column, rendered once on the server, and never reordered or spliced.
          if (block.kind === "heading") {
            return (
              <h2
                key={index}
                className="text-ink-hi mt-[26px] mb-[10px] text-[19px] leading-[1.3] font-semibold"
              >
                {block.text}
              </h2>
            );
          }
          if (block.kind === "subheading") {
            return (
              <h3
                key={index}
                className="text-ink/72 mt-[26px] mb-[10px] text-[15px] font-semibold tracking-[0.4px]"
              >
                {block.text}
              </h3>
            );
          }
          return (
            <p
              key={index}
              className="text-ink/78 mb-4 text-[16px] leading-[1.72]"
            >
              {block.text}
            </p>
          );
        })}
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
