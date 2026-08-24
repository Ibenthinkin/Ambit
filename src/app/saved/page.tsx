import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { SavedScreen } from "~/components/saved/saved-screen";
import { auth } from "~/lib/auth";
import { api, HydrateClient } from "~/trpc/server";

// Saved's server shell, patterned on `app/feed/page.tsx`: one guard, three prefetches, and the
// client screen. The prefetches exist so the masonry paints filled on arrival instead of
// spinning — the check is the same empirical one as the feed's: hard-reload /saved with the
// Network tab open and there must be no client `saves.*` requests.
//
// One deliberate divergence from /feed's guards: **no onboarding redirect.** The feed needs topic
// picks to have anything to draw from; a saves list doesn't — it's just rows the user created,
// and a signed-in user who somehow reaches /saved mid-onboarding sees their (empty) collection
// rather than a bounce.

export const metadata = { title: "Saved · Ambit" };

export default async function SavedPage({
  searchParams,
}: {
  searchParams: Promise<{ collection?: string }>;
}) {
  // Defense in depth behind src/proxy.ts's cookie-shape-only optimistic redirect, same as /feed —
  // a stale or forged cookie that gets past the proxy still bounces here.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/");
  }

  const { collection } = await searchParams;

  // **Each input expression is byte-identical to `SavedScreen`'s `useQuery` calls.** React Query
  // keys on (path, input); a mismatch doesn't throw, it just orphans the payload and the client
  // refetches. Unlike /feed — where a missed handoff permanently burns a page of corpus — the
  // cost here is only a round trip, but the contract is the same. Un-awaited by design: each
  // prefetch seeds the shared per-request query client, and `HydrateClient` dehydrates whatever
  // has settled by the time it renders.
  void api.saves.list.prefetch(collection ? { collectionId: collection } : {});
  void api.saves.collections.prefetch();
  void api.saves.count.prefetch();

  return (
    <HydrateClient>
      <SavedScreen />
    </HydrateClient>
  );
}
