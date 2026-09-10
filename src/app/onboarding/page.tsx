import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { OnboardingScreen } from "~/components/onboarding/onboarding-screen";
import { auth } from "~/lib/auth";
import { hasCompletedOnboarding, listTopics } from "~/server/db/topics";

// /onboarding (SPEC §8.1, PHASE5_PLAN_5.3.md) — the topic-chip grid a newly-signed-up user lands
// on before ever seeing a feed. A Server Component, same shape as `/` and the `/feed` placeholder:
// the session check here is defense in depth behind src/proxy.ts's cookie-shape-only optimistic
// redirect (that file's matcher already covers /onboarding/:path*), and the onboarded check keeps
// an already-set-up user from re-visiting the picker directly (Decision 10 — there is no re-pick
// UI in v1). Onboarding has its own chrome and shares no wrapper with the landing screen — it
// never did, and as of 5.11 there is no shared shell left to reuse anyway (`LandingShell` and its
// drifting orbs were deleted with the Landing 2 rebuild).
export default async function OnboardingPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/");
  }

  if (await hasCompletedOnboarding(session.user.id)) {
    redirect("/feed");
  }

  // Every pickable topic, not the sixteen config rows the grid used to map (09-10-26): the
  // screen groups them into four stages by facet. `facet!` is safe — `listTopics` is defined as
  // "the rows where facet IS NOT NULL", which is exactly what makes them pickable.
  const topics = await listTopics();
  return (
    <OnboardingScreen
      topics={topics.map((t) => ({
        id: t.id,
        label: t.label,
        facet: t.facet!,
      }))}
      minPicks={3}
    />
  );
}
