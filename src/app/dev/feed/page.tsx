import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { FeedScreen } from "~/components/feed/feed-screen";
import { auth } from "~/lib/auth";
import { hasCompletedOnboarding, listAllTopics } from "~/server/db/topics";
import { feedDebugEnabled } from "~/server/services/feed-debug";

// The feed tuning bench (plan 09-05-26): the real FeedScreen with the knob panel mounted.
//
// Three guards, in this order:
//   1. The dev gate — the SAME expression that decides whether `feed.page` honours knobs
//      (services/feed-debug.ts). A route that showed sliders the server ignores would be worse
//      than no route; tying both to one function makes that state unrepresentable. Under a
//      production build with FEED_DEBUG unset this is a 404, which is also why
//      src/proxy.ts's AUTHED_PREFIXES does not need to know about /dev/*.
//   2. Session, 3. onboarding — verbatim from /feed/page.tsx, same reasons.
//
// **No `api.feed.page.prefetchInfinite` here, on purpose.** /feed prefetches with `{}` so the
// client's identical `{}` query hydrates from it. This screen's input carries knobs and a nonce
// and never matches a prefetch; one would only compose (and, once acked, burn) a page nobody
// renders. The first page here is a plain client fetch, and it is forgotten like every other.
export default async function DevFeedPage() {
  if (!(await feedDebugEnabled())) notFound();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");
  if (!(await hasCompletedOnboarding(session.user.id))) redirect("/onboarding");

  // Every topic, once: labels so Because tiles and the readout can name grown topics (on
  // /feed only the sixteen are passed — out of scope to change there), and the original-tier
  // ids for the readout's original/grown split. The DB's `tier` column is the authority;
  // the engine's own CORE_TOPIC_IDS is config, and topics.test.ts pins that they agree.
  const topics = await listAllTopics();
  const topicLabels = Object.fromEntries(topics.map((t) => [t.id, t.label]));
  const originalTopicIds = topics
    .filter((t) => t.tier === "original")
    .map((t) => t.id);

  return <FeedScreen topicLabels={topicLabels} dev={{ originalTopicIds }} />;
}
