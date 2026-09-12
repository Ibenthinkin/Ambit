import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { CollectionsTab } from "~/components/profile/collections-tab";
import { auth } from "~/lib/auth";
import { api, HydrateClient } from "~/trpc/server";

// The Collections tab's server shell — `/profile`, the hub's landing tab (docs/DESIGN_list-screens.md
// §2). The identity block, nav and toolbar are `app/profile/layout.tsx`'s (and its `user.me`
// prefetch); this shell feeds the grid. The prefetch exists so the tiles paint filled on arrival
// instead of spinning — the empirical check is the same as /feed's and /saved's: hard-reload
// /profile with the Network tab open and there must be no client `saves.*` requests.
//
// **No onboarding redirect**, same as /saved and for the same kind of reason: this screen renders
// data the user themselves created, which needs no topic picks to exist. Bouncing a mid-onboarding
// reader who taps the pill's avatar into the topic picker would be a trap — they asked for their
// profile, not for onboarding.

export const metadata = { title: "Profile · Ambit" };

export default async function ProfilePage() {
  // Defense in depth behind src/proxy.ts's cookie-shape-only optimistic redirect, same as every
  // other authed route — a stale or forged cookie that gets past the proxy still bounces here. Kept
  // under the layout's own guard on purpose: a layout's server code runs on the document load, and
  // a client tab switch into this page re-renders only the page segment.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/");
  }

  // Input-less, so the "input expression byte-identical to the screen's useQuery" contract is
  // trivially satisfied. Un-awaited by design: it seeds the shared per-request query client, and
  // `HydrateClient` dehydrates whatever has settled by the time it renders.
  void api.saves.collections.prefetch();

  return (
    <HydrateClient>
      <CollectionsTab />
    </HydrateClient>
  );
}
