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
//
// **Do not add `-webkit-touch-callout: none` here when 5.8 does wire that tap.** The feed tiles set
// it (see `components/feed/image-tile.tsx`, where it's load-bearing — iOS raises its own image
// menu partway through the long-press that opens the item sheet, and the gesture never completes),
// so copying that block over is the obvious move and it would be a regression. Leaving the callout
// alone is what gives the hero iOS's native **"Add to Photos"** on long-press: two taps to the
// camera roll, against three through the share sheet, and verified on device 08-20-26. No web API
// can write to the photo library directly — `navigator.share({files})` handing off to the OS sheet
// is the ceiling for a web app — so this native callout is genuinely the best path we have, and it
// costs nothing but restraint. The share sheet's Save-image row stays as the *discoverable* one
// (nobody guesses at a long-press) and as the right behaviour on desktop.
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
