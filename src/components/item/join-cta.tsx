import Link from "next/link";

import { Card } from "~/components/ui/card";

// The invitation, shown only to signed-out visitors at the foot of an item page.
//
// **No "keep browsing without an account" link** for a stranger from a shared link, which the
// prototype offers: `/feed` is auth-gated (src/proxy.ts) and would bounce them straight back to the
// landing page, and the wander-next teaser above is already doing the "here's what this is" work.
// A visitor who came from `/explore` (09-26-26) is the exception — there *is* somewhere for them to
// keep browsing, so the card offers it.
//
// Signed-in readers see nothing at all: they're already inside.
export interface JoinCtaProps {
  /** The article variant gets a quieter, shorter card — it sits under a long read, not a picture. */
  variant: "image" | "article";
  /** The visit began on `/explore`: add a "Keep exploring" link back to it. */
  exploring?: boolean;
}

function KeepExploring() {
  return (
    <Link
      href="/explore"
      className="text-accent mt-[14px] block text-[13.5px] font-medium"
    >
      Keep exploring
    </Link>
  );
}

export function JoinCta({ variant, exploring = false }: JoinCtaProps) {
  if (variant === "article") {
    return (
      <Card className="mt-[30px] rounded-[22px] px-[22px] py-[24px] text-center">
        <h2 className="text-ink-hi text-[22px] leading-[1.24] font-semibold">
          Ambit is a quieter way to read.
        </h2>
        <p className="text-ink/58 mx-auto mt-[10px] max-w-[30ch] text-[13.5px] leading-[1.6]">
          An invite-only feed of public-domain images and writing, tuned to what
          you&rsquo;re curious about.
        </p>
        <Link
          href="/"
          className="text-accent mt-[16px] inline-block text-[13.5px] font-medium"
        >
          Get your invite →
        </Link>
        {exploring ? <KeepExploring /> : null}
      </Card>
    );
  }

  return (
    <Card className="mt-[34px] rounded-[22px] px-[22px] py-[28px] text-center">
      <h2 className="text-ink-hi text-[24px] leading-[1.22] font-semibold">
        Curiosity, without the doomscroll.
      </h2>
      <p className="text-ink/58 mx-auto mt-[12px] max-w-[32ch] text-[14px] leading-[1.6]">
        Ambit is an invite-only feed of public-domain images and writing — no
        likes, no comments, no one performing for anyone.
      </p>
      <Link
        href="/"
        className="bg-accent text-on-accent rounded-pill mt-[20px] inline-block px-[22px] py-[11px] text-[14px] font-semibold"
      >
        Get your invite
      </Link>
      {exploring ? <KeepExploring /> : null}
    </Card>
  );
}
