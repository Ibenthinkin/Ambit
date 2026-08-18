import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { FeedScreen } from "~/components/feed/feed-screen";
import { auth } from "~/lib/auth";
import { TOPICS } from "~/server/config/topics";
import { hasCompletedOnboarding } from "~/server/db/topics";
import { api, HydrateClient } from "~/trpc/server";

// The feed's server shell: two guards, one prefetch, and the client screen. Everything visible is
// `FeedScreen`'s; this file exists to make sure the first page of items is already in the client's
// query cache when it hydrates, so the feed paints filled rather than spinning.
//
// This is the repo's **first consumer of the RSC hydration helpers** — `src/trpc/server.ts` has
// existed since Phase 1 and nothing had ever called it. The contract, in one sentence: the RSC
// prefetch and the client hook must key identically, or the handoff silently misses.
//
// The route stays dynamic (it reads `headers()` and hits the DB on every request), which is
// correct — a feed is per-user by construction and there is nothing here to prerender.
export default async function FeedPage() {
  // Defense in depth behind src/proxy.ts's cookie-shape-only optimistic redirect (see that file's
  // comment for why the proxy can't do this check itself) — a stale or forged cookie that gets
  // past the proxy still bounces here.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/");
  }

  // Carried forward verbatim from the 5.2 placeholder, as that page's comment said it would be:
  // a signed-in user with no topic picks has nothing for the feed to draw from, so send them to
  // set up first (the inverse of /onboarding's own guard).
  if (!(await hasCompletedOnboarding(session.user.id))) {
    redirect("/onboarding");
  }

  // **`{}` — byte-identical to `FeedScreen`'s `useInfiniteQuery` input.** React Query keys on
  // (path, input); a mismatch here doesn't throw, it just orphans this payload in the dehydrated
  // cache and lets the client fetch page one all over again. Which costs more than a round trip:
  // `feed.page` writes `seen_item`, so a missed handoff permanently burns a page of the user's
  // corpus on every load. The check for it is empirical, not theoretical — hard-reload /feed with
  // the Network tab open and there must be no client `feed.page` request before you scroll.
  //
  // Un-awaited by design: `prefetchInfinite` seeds the shared per-request query client, and the
  // `HydrateClient` boundary below dehydrates whatever has settled by the time it renders.
  void api.feed.page.prefetchInfinite({});

  // Resolved on the server because `TOPICS` is server config (it imports the whole seed-query
  // table) and the Because tiles only need sixteen id→label pairs out of it. Shipping the map
  // beats shipping the module.
  const topicLabels = Object.fromEntries(TOPICS.map((t) => [t.id, t.label]));

  return (
    <HydrateClient>
      <FeedScreen topicLabels={topicLabels} />
    </HydrateClient>
  );
}
