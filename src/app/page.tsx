import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ExploreScreen } from "~/components/explore/explore-screen";
import { auth } from "~/lib/auth";
import { TOPICS } from "~/server/config/topics";
import { api, HydrateClient } from "~/trpc/server";

// `/` — the front door: a signed-out taste of the feed (docs/PLAN_explore-route.md). Built
// 09-26-26 as `/explore`, a second front door beside the overture-and-reel landing so the two
// could be compared; the same evening Ben chose this one ("I like this version a lot better"),
// so it moved here and the reel landing was parked at `/dev/landing` — kept whole, gated, in
// case it comes back. `/explore` is a permanent redirect here.
//
// Same shape as /feed's shell: one guard, one prefetch, the client screen. The guard is the
// landing's rule, not the feed's — a signed-in reader has the real feed and is sent to it. Not in
// proxy.ts's AUTHED_PREFIXES, because it isn't authed; the service worker treats it as
// NetworkOnly (only the feed's pages are cached for offline). Indexable — the old landing was.

/** The one `?open=` values the page honours — anything else is ignored, never echoed. */
const OPENABLE = ["signin", "signup", "about"] as const;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ open?: string | string[] }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) {
    redirect("/feed");
  }

  // **`{}` — byte-identical to ExploreScreen's `useInfiniteQuery` input**, or the client keys a
  // different query and fetches page one again. Un-awaited, as on /feed: `HydrateClient`
  // dehydrates whatever has settled by the time it renders.
  void api.feed.explore.prefetchInfinite({});

  const topicLabels = Object.fromEntries(TOPICS.map((t) => [t.id, t.label]));

  // `?open=` — sent by the item page's end card, whose actions need a sheet this page owns.
  const { open } = await searchParams;
  const initialOpen = OPENABLE.find((o) => o === open);

  return (
    <HydrateClient>
      <ExploreScreen topicLabels={topicLabels} initialOpen={initialOpen} />
    </HydrateClient>
  );
}
