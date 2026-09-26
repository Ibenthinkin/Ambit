import Link from "next/link";

import { LandingScreen } from "~/components/landing/landing-screen";
import { ResetPasswordCard } from "~/components/landing/reset-password-card";
import { TEMPOS } from "~/components/landing/tempos";
import { getReel } from "~/server/services/landing-pool";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  // One picture from the same pool as `/` (docs/DESIGN_landing-redo.md D2). `getReel` never
  // returns an empty list — an empty pool is the committed fallback.
  const still = await getReel(1);

  // Static mode: the same screen as `/`, but with one still image and the sheet already up. A
  // reader arriving here came from an email and has a job to do — there is nothing to introduce
  // them to, and making them watch the reel first would be an obstacle rather than a mood.
  return (
    <LandingScreen mode="static" pictures={still} tempo={TEMPOS.cut}>
      {token && !error ? (
        <ResetPasswordCard token={token} />
      ) : (
        <div className="text-center">
          <div className="text-ink-hi text-[23px] font-semibold tracking-[-0.2px]">
            This link has expired.
          </div>
          <div className="text-ink/62 mt-2 text-[15.5px] leading-[1.55]">
            Password reset links are valid for one hour. Request a new one from
            the sign-in screen.
          </div>
          <Link
            href="/"
            className="text-ink/55 mt-[22px] inline-block font-sans text-[13px] font-medium"
          >
            Back to sign in
          </Link>
        </div>
      )}
    </LandingScreen>
  );
}
