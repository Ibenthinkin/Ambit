import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { TopicsScreen } from "~/components/profile/topics-screen";
import { auth } from "~/lib/auth";
import { feedDebugEnabled } from "~/server/services/feed-debug";
import { api, HydrateClient } from "~/trpc/server";

// /profile/topics — the topic manager (docs/DESIGN_topic-facets-and-personas.md §3), reached from
// the profile screen's Topics row and from Settings' "What you see". Same server shell as every
// other authed route: one guard, prefetches so the chips paint pressed on arrival rather than
// flashing unpressed, and the client screen.
//
// **No onboarding redirect**, for the same reason /profile has none: this screen edits picks, and
// bouncing someone who came here to edit them into the onboarding picker would be a loop.

export const metadata = { title: "Topics · Ambit" };

export default async function ProfileTopicsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");

  // Both input-less, so the byte-identical-input contract with the screen's `useQuery` calls is
  // trivially satisfied. `topics.mine` carries each pick's weight as well as its id, which is
  // everything the screen's summary needs to show a level — no separate weights query to fetch.
  void api.topics.list.prefetch();
  void api.topics.mine.prefetch();
  // The exhibition card above the list (First Exhibition) — streamed with the rest.
  void api.topics.taste.prefetch();

  const dev = await feedDebugEnabled();

  return (
    <HydrateClient>
      <TopicsScreen dev={dev} />
    </HydrateClient>
  );
}
