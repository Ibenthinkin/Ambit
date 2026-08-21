import { sourceLabel } from "~/lib/source-label";
import type { Item } from "~/server/db/items";
import { CreditLine } from "./credit-line";

// The image variant of `/i/[itemId]`: the picture, big, then the least text that makes it
// legible — title, who made it, where it came from, and the summary.
//
// **The hero has no tap handler on purpose.** The design puts a full-screen gallery behind it, and
// that gallery is 5.8's. An affordance that invites a tap and then does nothing is worse than no
// affordance, so until 5.8 wires it this is a picture and not a button — no `cursor-pointer`, no
// `onClick`, nothing to discover and be disappointed by.
export interface ImageItemBodyProps {
  item: Item;
}

export function ImageItemBody({ item }: ImageItemBodyProps) {
  // Through the proxy, except for the inline `data:` pixels the e2e corpus seeds — same branch as
  // the feed's tiles. See `src/app/api/img/[itemId]/route.ts` for why the proxy exists at all.
  const src = item.imageUrl?.startsWith("data:")
    ? item.imageUrl
    : `/api/img/${item.id}`;

  return (
    <article>
      {item.imageUrl ? (
        // Plain `<img>`, never `next/image` — the image hosts are an open, growing set; see
        // `components/feed/image-tile.tsx` for the full account.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={item.title}
          className="rounded-tile block h-[300px] w-full object-cover"
        />
      ) : null}

      {/* Stays an `<h1>` on both variants: it's the page's actual subject, and e2e leans on it. */}
      <h1 className="text-ink-hi mt-[20px] text-[28px] leading-[1.16] font-semibold">
        {item.title}
      </h1>

      {/* Whoever the source names as maker; failing that, the institution holding it. */}
      <p className="text-ink/50 mt-[8px] text-[13px]">
        {item.attribution ?? sourceLabel(item.source)}
      </p>

      <CreditLine source={item.source} sourceUrl={item.sourceUrl} />

      {item.summary ? (
        <p className="text-ink/72 mt-[18px] text-[17px] leading-[1.6]">
          {item.summary}
        </p>
      ) : null}
    </article>
  );
}
