import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AuthCard } from "~/components/landing/auth-card";
import { LandingShell } from "~/components/landing/landing-shell";
import { Rise } from "~/components/ui/rise";
import { auth } from "~/lib/auth";

// The real Ambit landing/sign-in screen (SPEC §8.1, docs/PHASE5_PLAN_5.2.md), replacing the t3
// starter boilerplate. A Server Component: it checks for a real session itself (not the
// cookie-shape-only check in src/proxy.ts — see that file's comment for why the redirect can't
// live there) and bounces straight to /feed, so a signed-in visitor never sees the auth card
// flash before redirecting. Reading `headers()` also opts this route out of prerendering, which
// is what keeps `auth.api.getSession` from ever running at build time.
export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) {
    redirect("/feed");
  }

  return (
    <LandingShell>
      <Rise delayMs={80}>
        <div className="flex flex-1 flex-col justify-center">
          {/* Sora at display sizes needs NEGATIVE tracking — the serif this replaced wanted
              +0.2px, but a geometric sans at 42px reads loose at its natural spacing. */}
          <h1 className="text-ink-hi text-[42px] leading-[1.06] font-semibold tracking-[-0.6px]">
            A quieter way
            <br />
            to be curious.
          </h1>
          <p className="text-ink/62 mt-5 max-w-[300px] text-[17px] leading-[1.55]">
            No feeds engineered to keep you. Ambit hands you one interesting
            thing at a time — art, ideas, the odd corner of the world — then
            quietly steps back.
          </p>
        </div>
      </Rise>

      <Rise delayMs={160}>
        <AuthCard />
      </Rise>
    </LandingShell>
  );
}
