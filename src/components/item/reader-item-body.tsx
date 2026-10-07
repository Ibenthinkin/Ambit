import { Eyebrow } from "~/components/ui/eyebrow";
import { TextLink } from "~/components/ui/text-link";
import { sourceLabel } from "~/lib/source-label";
import type { Item } from "~/server/db/items";
import { prefersLinkOutBlock, LinkOutRow } from "./link-out-row";
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
// 1b (DESIGN_redesign §6.4): no eyebrow above the title; a three-column meta strip (Source /
// Reading / Kept in) under the lede; the link-out at the foot is the bracket form. "Kept in" is
// the signed-in reader's collection, resolved by the page on the server and passed in — a
// stranger, or an article not kept, reads "—".
//
// The link-out at the foot is the generalized version of the blog posture (CLAUDE.md's 08-20-26
// rights decision): the reader should always be one tap from the original. Blog-specific framing
// is 6.3's.
export interface ReaderItemBodyProps {
  item: Item;
  /** The name of the reader's collection this item is kept in; null/absent renders "—". */
  keptIn?: string | null;
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Eyebrow as="div">{label}</Eyebrow>
      <div className="text-ink mt-[3px] text-[13px]">{value}</div>
    </div>
  );
}

export function ReaderItemBody({ item, keptIn = null }: ReaderItemBodyProps) {
  const source = sourceLabel(item.source);
  return (
    <article>
      <h1 className="text-ink-hi text-[32px] leading-[1.08] font-normal">
        {item.title}
      </h1>

      {/* The lede. When there's no stored body this is the whole read, which is why it isn't
          folded into the block list — it's always here, and always set larger. */}
      {item.summary ? (
        <p className="text-ink/78 mt-[14px] text-[17px] leading-[1.45]">
          {item.summary}
        </p>
      ) : null}

      <div className="border-ink/14 mt-[18px] grid grid-cols-3 border-y py-[10px]">
        <MetaCell label="Source" value={source} />
        <MetaCell
          label="Reading"
          value={item.readingMinutes ? `${item.readingMinutes} min` : "—"}
        />
        <MetaCell label="Kept in" value={keptIn ?? "—"} />
      </div>

      <ReuseNotice item={item} />

      <div className="mt-[20px]">
        {item.body ? <ReaderBlocks body={item.body} /> : null}
      </div>

      {/* One link out at the foot, never two (writing Phase 4). A link-card or PDR piece gets the
          prominent row the image page uses; an open source's article (Wikipedia, PoetryDB,
          Loupe) keeps the quiet inline link — its body is the whole read, and the row's
          "go there instead" weight would be wrong for it. */}
      {prefersLinkOutBlock(item.source) ? (
        <LinkOutRow source={item.source} sourceUrl={item.sourceUrl} />
      ) : (
        <div className="mt-[20px]">
          <TextLink
            href={item.sourceUrl}
            external
            bracket
            className="text-[13.5px]"
          >
            Read on {source}
          </TextLink>
        </div>
      )}
    </article>
  );
}
