import { headers } from "next/headers";
import { redirect } from "next/navigation";

import packageJson from "../../../../package.json";

import { SettingsScreen } from "~/components/settings/settings-screen";
import { auth } from "~/lib/auth";
import { api, HydrateClient } from "~/trpc/server";

// The Settings tab's server shell — `/profile/settings` since 09-12-26 (docs/DESIGN_list-screens.md
// §5; `/settings` redirects here). The same guard-and-prefetch pattern as the other hub tabs, with
// the two reads the "What you see" row's value needs — the identity block above is the layout's.
// A client-side fetch here would mean a row that arrives blank and fills in.
//
// **No onboarding redirect.** Beyond the reasoning /profile and /saved share, there's a specific one
// here: "What you see" leads to the topic picker. A reader with zero picks is exactly who most needs
// to reach it, and bouncing them to /onboarding would be circular.

export const metadata = { title: "Settings · Ambit" };

export default async function SettingsPage() {
  // Defense in depth behind src/proxy.ts's cookie-shape-only optimistic redirect — kept under the
  // layout's own guard, because a client tab switch re-renders only this page segment.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/");
  }

  // Every one input-less, so the byte-identical-input hydration contract holds trivially. Un-awaited
  // by design — see `app/profile/page.tsx`.
  void api.topics.list.prefetch();
  void api.topics.mine.prefetch();

  return (
    <HydrateClient>
      {/* The version footer is real, not decorative: read from package.json here (server-side —
          importing it into a client component would bundle the whole manifest, dependency list
          included) and rendered as "v0.4". Bumping the package version is what changes it. */}
      <SettingsScreen versionLabel={versionLabel(packageJson.version)} />
    </HydrateClient>
  );
}

/** `"0.4.0"` → `"v0.4"`. The patch digit is build noise; the footer is for telling builds apart. */
function versionLabel(version: string): string {
  const [major, minor] = version.split(".");
  return `v${major}.${minor}`;
}
