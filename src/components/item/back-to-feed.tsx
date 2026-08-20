"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { cameFromFeed } from "~/components/feed/feed-origin";

// The item page's way back to the feed, which has to serve two arrivals that want opposite things
// (see `feed-origin.ts` for the full account):
//
//   - **Tapped a tile.** The feed is one entry down the history stack, intact. Pop to it and the
//     reader gets the same tiles at the same scroll offset, with nothing refetched.
//   - **Opened a shared link cold.** There is no feed behind this page — `/i/[itemId]` is public
//     (SPEC §8.1) — so "back" would leave Ambit. The reader needs a feed *built*, and `?focus=`
//     is how the new one puts this item under their eye.
//
// **One element, decided at click time.** The obvious shape — read the marker during render and
// return either a button or a link — is a hydration mismatch by construction: the server has no
// `sessionStorage` and would always render the cold branch. So the markup is unconditionally the
// anchor (which is also the honest fallback if JS never boots), and the pop is an interception of
// its click. Same DOM on both sides, no branch to get wrong.
export function BackToFeed({
  itemId,
  className,
  children = "← Back",
}: {
  itemId: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <Link
      href={`/feed?focus=${itemId}`}
      className={className}
      onClick={(event) => {
        // Modified clicks (new tab/window) and non-primary buttons belong to the browser — the
        // reader is asking for a second context, not to leave this one.
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        if (!cameFromFeed(itemId)) return;
        event.preventDefault();
        router.back();
      }}
    >
      {children}
    </Link>
  );
}
