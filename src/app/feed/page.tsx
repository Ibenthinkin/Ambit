import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "~/lib/auth";
import { hasCompletedOnboarding } from "~/server/db/topics";
import { SignOutButton } from "./sign-out-button";

// THROWAWAY placeholder — DELETE IN 5.4. Exists only so a successful sign-in has somewhere to
// land before /onboarding (5.3) and the real /feed (5.4) exist; also gives e2e/auth.spec.ts a
// page to assert against (PHASE5_PLAN_5.2.md Decision 3). The real session check here is defense
// in depth behind src/proxy.ts's cookie-shape-only optimistic redirect (see that file's comment
// for why the proxy can't do this check itself) — a stale/forged cookie that gets past the proxy
// still bounces at this page. Reading `headers()` also opts this route out of prerendering.
export default async function FeedPlaceholder() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/");
  }

  // The inverse of /onboarding's guard (PHASE5_PLAN_5.3.md Decision 5) — a signed-in user with no
  // topic picks yet has nothing for the feed to draw from, so send them to set up first. Not
  // throwaway: 5.4's real feed page needs this exact same guard and carries it forward unchanged.
  if (!(await hasCompletedOnboarding(session.user.id))) {
    redirect("/onboarding");
  }

  return (
    <main className="bg-bg text-ink flex min-h-dvh flex-col items-center justify-center gap-4">
      <p className="font-sans text-[15px]">Signed in as {session.user.email}</p>
      <SignOutButton />
    </main>
  );
}
