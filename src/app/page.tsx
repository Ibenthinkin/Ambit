import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AuthCard } from "~/components/landing/auth-card";
import { LandingScreen } from "~/components/landing/landing-screen";
import { auth } from "~/lib/auth";

// The real Ambit landing/sign-in screen (SPEC §8.1). A Server Component: it checks for a real
// session itself (not the cookie-shape-only check in src/proxy.ts — see that file's comment for
// why the redirect can't live there) and bounces straight to /feed, so a signed-in visitor never
// sees the auth card flash before redirecting. Reading `headers()` also opts this route out of
// prerendering, which is what keeps `auth.api.getSession` from ever running at build time.
//
// Phase 5.11 replaced 5.2's shell — a 42px hero over two drifting blurred orbs — with the
// redesign's `Landing 2`: a full-bleed slideshow that resolves into a sign-in sheet. The hero copy
// survives at the prototype's much smaller sheet scale (see `auth-sheet.tsx`); `AuthCard` itself is
// untouched, and still owns all four of the real email+password flow's states.
export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) {
    redirect("/feed");
  }

  return (
    <LandingScreen mode="cycle">
      <AuthCard />
    </LandingScreen>
  );
}
