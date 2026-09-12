import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ProfileHub } from "~/components/profile/profile-hub";
import { auth } from "~/lib/auth";
import { api, HydrateClient } from "~/trpc/server";

// The Profile hub's server shell (docs/DESIGN_list-screens.md §1): every route under /profile —
// Collections, Topics, Edit profile, Settings — renders inside `ProfileHub`, which this layout
// mounts once. The guard here is defense in depth *behind* each page's own: a layout's server
// code runs on the document load, and a client tab switch re-renders only the page segment, so
// the pages keep their `getSession` calls.
//
// One prefetch, `user.me`, for the identity block — input-less, so the byte-identical-input
// contract with the hub's `useQuery` holds trivially. It seeds the same per-request query client
// the child page's prefetches do (`trpc/server.ts` caches `createQueryClient` per request), so the
// nested `HydrateClient`s dehydrate one store.

export default async function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");

  void api.user.me.prefetch();

  return (
    <HydrateClient>
      <ProfileHub>{children}</ProfileHub>
    </HydrateClient>
  );
}
