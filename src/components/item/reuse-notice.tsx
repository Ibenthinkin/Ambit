import { PDR } from "~/server/config/pdr";
import type { Item } from "~/server/db/items";

// The line PDR's reuse terms ask for when its CC BY-SA text is shown in full: name the original,
// name The Public Domain Review, link back (publicdomainreview.org/reusing-material). Rendered
// above the stored body on both item variants — an essay in the reader view, a collection's
// preamble under its picture. Keyed on DATA, not on type: a PDR item with a body is exactly the
// set of items that reproduce PDR's text, and a PDR link card (no body) correctly gets nothing.
// Server-safe: a plain paragraph and an anchor.
export interface ReuseNoticeProps {
  item: Item;
}

export function ReuseNotice({ item }: ReuseNoticeProps) {
  if (item.source !== PDR.id || !item.body) return null;
  return (
    <p className="text-ink/50 mt-[18px] text-[12.5px] leading-[1.5]">
      Text originally published on{" "}
      <a
        href={item.sourceUrl}
        target="_blank"
        rel="noopener"
        className="text-accent underline-offset-2 hover:underline"
      >
        {PDR.label}
      </a>{" "}
      under CC BY-SA 4.0.
    </p>
  );
}
