import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ProfileScreen } from "~/components/profile/profile-screen";
import { auth } from "~/lib/auth";
import { api, HydrateClient } from "~/trpc/server";

// Profile's server shell, patterned on `app/saved/page.tsx`: one guard, two prefetches, and the
// client screen. The prefetches exist so the identity row and the collections grid paint filled on
// arrival instead of spinning — the empirical check is the same as /feed's and /saved's: hard-reload
// /profile with the Network tab open and there must be no client `user.*`/`saves.*` requests.
//
// **No onboarding redirect**, same as /saved and for the same kind of reason: this screen renders
// data the user themselves created, which needs no topic picks to exist. Bouncing a mid-onboarding
// reader who taps the pill's avatar into the topic picker would be a trap — they asked for their
// profile, not for onboarding.

export const metadata = { title: "Profile · Ambit" };

export default async function ProfilePage() {
  // Defense in depth behind src/proxy.ts's cookie-shape-only optimistic redirect, same as every
  // other authed route — a stale or forged cookie that gets past the proxy still bounces here.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/");
  }

  // Both procedures take no input at all, so the "input expression byte-identical to the screen's
  // useQuery" contract every other shell has to be careful about is trivially satisfied here. Said
  // out loud rather than left implicit, because the *next* prefetch added to this file might well
  // take one. Un-awaited by design: each seeds the shared per-request query client, and
  // `HydrateClient` dehydrates whatever has settled by the time it renders.
  void api.user.me.prefetch();
  void api.saves.collections.prefetch();

  return (
    <HydrateClient>
      <ProfileScreen />
    </HydrateClient>
  );
}
