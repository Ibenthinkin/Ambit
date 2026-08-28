import { sourceLabel } from "~/lib/source-label";
import type { Item } from "~/server/db/items";
import { CreditLine } from "./credit-line";
import { HeroGalleryLink } from "./hero-gallery-link";
import { LinkOutRow } from "./link-out-row";

// The image variant of `/i/[itemId]`: the picture, big, then the least text that makes it
// legible — title, who made it, where it came from, and the summary.
//
// **The hero is the doorway into the gallery** as of 5.8: a tap opens `/g/[itemId]`. It stayed a
// plain picture through 5.7 on purpose — an affordance that invites a tap and then does nothing is
// worse than no affordance — and the tap now goes somewhere, so `cursor-pointer` has earned its
// place. The handler lives in `HeroGalleryLink`, a client wrapper, which keeps this file a server
// component.
//
// **There is still no `-webkit-touch-callout: none` here, and there must never be.** The feed tiles
// set it (see `components/feed/image-tile.tsx`, where it's load-bearing — iOS raises its own image
// menu partway through the long-press that opens the item sheet, and the gesture never completes),
// so copying that block over is the obvious move and it would be a regression. Leaving the callout
// alone is what gives the hero iOS's native **"Add to Photos"** on long-press: two taps to the
// camera roll, against three through the share sheet, and verified on device 08-20-26. No web API
// can write to the photo library directly — `navigator.share({files})` handing off to the OS sheet
// is the ceiling for a web app — so this native callout is genuinely the best path we have, and it
// costs nothing but restraint. It is also why the wrapper is a `<div>` with a pointer handler and
// not an `<a>`: an anchor changes the callout iOS offers on the image inside it. The share sheet's
// Save-image row stays as the *discoverable* one (nobody guesses at a long-press) and as the right
// behaviour on desktop.
export interface ImageItemBodyProps {
  item: Item;
}

export function ImageItemBody({ item }: ImageItemBodyProps) {
  // Through the proxy, except for the inline `data:` pixels the e2e corpus seeds — same branch as
  // the feed's tiles. See `src/app/api/img/[itemId]/route.ts` for why the proxy exists at all.
  const src = item.imageUrl?.startsWith("data:")
    ? item.imageUrl
    : `/api/img/${item.id}`;

  // Whoever the source names as maker — unless that is just the source's own name again, in which
  // case the credit line below already says it and saying it twice reads as a bug. Phase 6.3
  // exposed this: a blog's attribution IS the blog. (This also drops the old museum fallback that
  // printed the source label as a maker line; it duplicated the credit line there too.)
  const label = sourceLabel(item.source);
  const maker =
    item.attribution && item.attribution !== label ? item.attribution : null;

  return (
    <article>
      {item.imageUrl ? (
        <HeroGalleryLink itemId={item.id}>
          {/* Plain `<img>`, never `next/image` — the image hosts are an open, growing set; see
              `components/feed/image-tile.tsx` for the full account. Untouched by the wrapper: every
              attribute here is exactly what 5.7 shipped. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {/* **This is the LCP element of the app's one public, shareable page** (Phase 7.3, T5).
              `fetchPriority="high"` tells the browser to pull it ahead of the other requests the
              page starts — without it the hero competes with the JS bundle for the first
              connections — and `decoding="async"` keeps the decode off the main thread so it can
              never delay the rest of the paint. Neither changes a pixel of the result. The
              matching `preload` is in `app/i/[itemId]/page.tsx`, which starts the request before
              this markup is even parsed. */}
          <img
            src={src}
            alt={item.title}
            fetchPriority="high"
            decoding="async"
            className="rounded-tile block h-[300px] w-full object-cover"
          />
        </HeroGalleryLink>
      ) : null}

      {/* Stays an `<h1>` on both variants: it's the page's actual subject, and e2e leans on it. */}
      <h1 className="text-ink-hi mt-[20px] text-[28px] leading-[1.16] font-semibold">
        {item.title}
      </h1>

      {maker ? (
        <p className="text-ink/50 mt-[8px] text-[13px]">{maker}</p>
      ) : null}

      <CreditLine source={item.source} sourceUrl={item.sourceUrl} />

      {item.summary ? (
        <p className="text-ink/72 mt-[18px] text-[17px] leading-[1.6]">
          {item.summary}
        </p>
      ) : null}

      {/* Blog items only (renders null otherwise): the link-out that makes the card a preview. */}
      <LinkOutRow source={item.source} sourceUrl={item.sourceUrl} />
    </article>
  );
}
