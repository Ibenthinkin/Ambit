import Link from "next/link";

import { Card } from "~/components/ui/card";

// The invitation, shown only to signed-out visitors at the foot of an item page.
//
// **No "keep browsing without an account" link**, which the prototype offers. There is nowhere for
// it to go: `/feed` is auth-gated (src/proxy.ts) and would bounce a stranger straight back to the
// landing page. A link that dead-ends is a worse first impression than no link — the wander-next
// teaser above is already doing the "here's what this is" work, so the card just asks.
//
// Signed-in readers see nothing at all: they're already inside.
export interface JoinCtaProps {
  /** The article variant gets a quieter, shorter card — it sits under a long read, not a picture. */
  variant: "image" | "article";
}

export function JoinCta({ variant }: JoinCtaProps) {
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
    </Card>
  );
}
