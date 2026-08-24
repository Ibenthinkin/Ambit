import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ProfileEditScreen } from "~/components/profile/profile-edit-screen";
import { auth } from "~/lib/auth";
import { api, HydrateClient } from "~/trpc/server";

// Edit's server shell — the same three moves as `app/profile/page.tsx`, one prefetch instead of
// two. Prefetching matters more here than anywhere else in the phase: the form seeds its state from
// `user.me` on mount, so a client-side fetch would mean an empty form flashing before the values
// arrive.
//
// **No onboarding redirect**, same reasoning as /profile and /saved: this screen edits data the
// reader owns, and it needs no topic picks to exist.

export const metadata = { title: "Edit profile · Ambit" };

export default async function ProfileEditPage() {
  // Defense in depth behind src/proxy.ts's cookie-shape-only optimistic redirect.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/");
  }

  // Input-less, so the byte-identical-input contract with the screen's own `useQuery` holds
  // trivially. Un-awaited by design — see `app/profile/page.tsx`.
  void api.user.me.prefetch();

  return (
    <HydrateClient>
      <ProfileEditScreen />
    </HydrateClient>
  );
}
