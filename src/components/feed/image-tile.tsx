"use client";

import * as React from "react";

import { usePress } from "~/hooks/use-press";
import { cn } from "~/lib/utils";
import type { FeedCard } from "~/server/services/feed";
import { DebugBadge } from "./debug-badge";

// The feed's dominant tile: **the image and nothing else**. Square corners, no border, no title,
// no source line, no per-tile save button — the redesign's feed is a wall of pictures, and every
// piece of chrome added here is a piece of the wall taken away. Anything you might want to know
// about the item lives one tap deeper, on `/i/[itemId]`.
//
// The four iOS incantations on the wrapper (`select-none`, `touch-manipulation`,
// `-webkit-touch-callout: none`, plus `pointer-events-none` on the `<img>` itself) are all load-
// bearing together, as established on /dev/tokens: without them Safari raises its own
// image-callout menu or starts a text selection partway through a long press, and the gesture
// never completes.

// A dropped image request is not the same event as a blocked one, and the tile used to treat them
// identically: the first `onError` latched `broken` forever, unmounting the `<img>` so nothing
// could ever re-request it. On a desktop that's nearly invisible; on a phone — patchy coverage, a
// backgrounded tab, iOS discarding decoded bitmaps under memory pressure — it means a transient
// blip permanently pocks the wall of pictures the feed is supposed to be (found 08-18-26 on-device).
//
// Two retries with a widening gap, then the caption. Deliberately NOT cache-busted: appending a
// unique query param would miss the CDN's cache on every attempt and turn a rate-limit into a
// harder rate-limit. Remounting on `attempt` is enough to re-issue the request, since browsers
// don't cache a failed response.
const MAX_IMAGE_RETRIES = 2;
const RETRY_BACKOFF_MS = 1_200;

export interface ImageTileProps {
  card: FeedCard;
  /** A literal Tailwind aspect class from `IMAGE_ASPECTS` — see masonry.ts on why literal. */
  aspectClass: string;
  onTap: () => void;
  onLongPress: () => void;
}

export function ImageTile({
  card,
  aspectClass,
  onTap,
  onLongPress,
}: ImageTileProps) {
  const press = usePress({ onTap, onLongPress });
  const [broken, setBroken] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  const { item } = card;

  // The pending retry has to be cancellable: the feed keeps tiles mounted as the reader scrolls,
  // but a navigation away mid-backoff would otherwise set state on an unmounted tile.
  const retryTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(
    () => () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
    },
    [],
  );

  const handleError = React.useCallback(() => {
    setAttempt((prev) => {
      if (prev >= MAX_IMAGE_RETRIES) {
        setBroken(true);
        return prev;
      }
      retryTimer.current = setTimeout(
        () => setAttempt(prev + 1),
        RETRY_BACKOFF_MS * (prev + 1),
      );
      return prev;
    });
  }, []);

  // Every http(s) image is fetched through Ambit's own proxy (`/api/img/[itemId]`) — one origin,
  // no referer sent upstream, which is what unblocked AIC (see the route's header comment). The
  // `data:` bypass is for the e2e corpus, whose items carry inline base64 pixels: there is nothing
  // for a proxy to fetch, and teaching the route to dereference `data:` would be strictly worse
  // than branching here.
  const src = item.imageUrl?.startsWith("data:")
    ? item.imageUrl
    : `/api/img/${item.id}`;

  return (
    <div
      {...press}
      className={cn(
        "relative block w-full cursor-pointer touch-manipulation overflow-hidden select-none",
        aspectClass,
      )}
      style={{ WebkitTouchCallout: "none" }}
    >
      {broken || !item.imageUrl ? (
        // Images come through Ambit's own proxy as of 5.7, which removes the referer-block class
        // of failure entirely — but not flaky networks, a source CDN that's down, or an object
        // that's been de-accessioned upstream. The tile still has to hold its slot when one of
        // those happens: collapsing it would reshuffle the column under the reader's thumb.
        <div className="bg-ink/5 flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-center">
          <span className="text-ink/40 text-[11px]">Image unavailable</span>
          {/* Which source failed, readable from a phone with no DevTools attached — the on-device
              pass has no console, and `Image unavailable` alone can't distinguish "this one CDN
              blocks us" from "this device can't reach any CDN". The two have completely different
              fixes, and telling them apart on 08-18-26 took exactly this label. Dev-only: in
              production the caption stays bare. */}
          {process.env.NODE_ENV !== "production" && item.imageUrl && (
            <span className="text-ink/30 text-[9px] break-all">
              {card.item.source} · {new URL(item.imageUrl).hostname}
            </span>
          )}
        </div>
      ) : (
        // A plain `<img>`, not `next/image`, and not an oversight. `next/image` needs every image
        // host declared in next.config.js — but this feed draws from an open, growing set of
        // museum CDNs (SPEC §6.1's five sources today, more in Phase 6, plus the private
        // ambit-archive/loupe hosts), so the allowlist would be a permanent maintenance tax that
        // silently breaks a source the day it's added. The proxy (5.7) is what collapses that open
        // set to one origin at the network layer, which is the part that actually mattered.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          // Remounting on `attempt` is what re-issues the request — same URL, fresh element.
          key={attempt}
          loading="lazy"
          src={src}
          alt={item.title}
          onError={handleError}
          className="pointer-events-none block h-full w-full object-cover"
        />
      )}
      <DebugBadge card={card} />
    </div>
  );
}
