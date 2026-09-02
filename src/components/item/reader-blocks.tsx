import { parseReaderBlocks } from "~/lib/reader-blocks";

// The typeset block list a stored `body` becomes — headings, subheadings, paragraphs — shared by
// the reader variant (an article's whole read) and, since the Public Domain Review landed
// (09-02-26), by the image variant too: a PDR collection is a picture that also carries its own
// essay, and the same parser and the same type ramp serve both. Server-safe: no hooks, no
// handlers. See src/lib/reader-blocks.ts for what the parser accepts.
export interface ReaderBlocksProps {
  body: string;
}

export function ReaderBlocks({ body }: ReaderBlocksProps) {
  const blocks = parseReaderBlocks(body);
  return (
    <div>
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
  );
}
