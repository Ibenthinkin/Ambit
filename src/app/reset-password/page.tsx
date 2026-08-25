import Link from "next/link";

import { LandingScreen } from "~/components/landing/landing-screen";
import { ResetPasswordCard } from "~/components/landing/reset-password-card";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  // Static mode: the same screen as `/`, but with one still image and the sheet already up. A
  // reader arriving here came from an email and has a job to do — there is nothing to introduce
  // them to, and making them watch the slideshow first would be an obstacle rather than a mood.
  return (
    <LandingScreen mode="static">
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
