import { headers } from "next/headers";
import { redirect } from "next/navigation";

import packageJson from "../../../package.json";

import { SettingsScreen } from "~/components/settings/settings-screen";
import { auth } from "~/lib/auth";
import { api, HydrateClient } from "~/trpc/server";

// Settings' server shell — the same guard-and-prefetch pattern as /profile, with four reads instead
// of two. All four back something visible above the fold (the two shortcut cards, the "What you
// see" row's value), so a client-side fetch here would mean a screen that arrives half-blank and
// fills in.
//
// **No onboarding redirect.** Beyond the reasoning /profile and /saved share, there's a specific one
// here: "What you see" *is* a topic picker. A reader with zero picks is exactly who most needs to
// reach it, and bouncing them to /onboarding would be circular.

export const metadata = { title: "Settings · Ambit" };

export default async function SettingsPage() {
  // Defense in depth behind src/proxy.ts's cookie-shape-only optimistic redirect.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/");
  }

  // Every one input-less, so the byte-identical-input hydration contract holds trivially. Un-awaited
  // by design — see `app/profile/page.tsx`.
  void api.user.me.prefetch();
  void api.saves.count.prefetch();
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
