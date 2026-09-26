import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ExploreScreen } from "~/components/explore/explore-screen";
import { auth } from "~/lib/auth";
import { TOPICS } from "~/server/config/topics";
import { api, HydrateClient } from "~/trpc/server";

// `/explore` — a signed-out taste of the feed (09-26-26, docs/PLAN_explore-route.md). A second
// front door beside the landing at `/`, so the two can be compared; `/` is untouched.
//
// Same shape as /feed's shell: one guard, one prefetch, the client screen. The guard is the
// landing's rule, not the feed's — a signed-in reader has the real feed and is sent to it. Not in
// proxy.ts's AUTHED_PREFIXES, because it isn't authed; the service worker already treats it as
// NetworkOnly (only the feed's pages are cached for offline).

// Out of search results while it's an experiment.
export const metadata: Metadata = { robots: { index: false } };

export default async function ExplorePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) {
    redirect("/feed");
  }

  // **`{}` — byte-identical to ExploreScreen's `useInfiniteQuery` input**, or the client keys a
  // different query and fetches page one again. Un-awaited, as on /feed: `HydrateClient`
  // dehydrates whatever has settled by the time it renders.
  void api.feed.explore.prefetchInfinite({});

  const topicLabels = Object.fromEntries(TOPICS.map((t) => [t.id, t.label]));

  return (
    <HydrateClient>
      <ExploreScreen topicLabels={topicLabels} />
    </HydrateClient>
  );
}
