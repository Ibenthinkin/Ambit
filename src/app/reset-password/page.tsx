import Link from "next/link";

import { LandingShell } from "~/components/landing/landing-shell";
import { ResetPasswordCard } from "~/components/landing/reset-password-card";
import { Rise } from "~/components/ui/rise";

// Where the reset-password email actually lands. Better Auth's own `/api/auth/reset-password/
// {token}` endpoint (not this page) validates the token first and redirects here — with
// `?token=...` on success or `?error=INVALID_TOKEN` on an expired/bad one (verified against
// Better Auth v1.6.23 docs during planning). No session check: someone resetting a password is
// by definition signed out, so src/proxy.ts's matcher deliberately excludes this route.
//
// Next 16: `searchParams` is a Promise and must be awaited. Reading it opts this route out of
// prerendering, same reason `/` reads `headers()` — see PHASE5_PLAN_5.2.md's "structural
// constraints" section.
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  return (
    <LandingShell>
      <div className="flex flex-1 flex-col justify-center">
        <Rise delayMs={80}>
          {token && !error ? (
            <ResetPasswordCard token={token} />
          ) : (
            <div className="text-center">
              <div className="text-ink-hi text-[23px] font-semibold tracking-[-0.2px]">
                This link has expired.
              </div>
              <div className="text-ink/62 mt-2 text-[15.5px] leading-[1.55]">
                Password reset links are valid for one hour. Request a new one
                from the sign-in screen.
              </div>
              <Link
                href="/"
                className="text-ink/55 mt-[22px] inline-block font-sans text-[13px] font-medium"
              >
                Back to sign in
              </Link>
            </div>
          )}
        </Rise>
      </div>
    </LandingShell>
  );
}
