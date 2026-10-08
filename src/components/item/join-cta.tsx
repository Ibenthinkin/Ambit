import Link from "next/link";

import { OUTLINE_BLOCK, PRIMARY_BLOCK } from "~/components/ui/button";
import { cn } from "~/lib/utils";

// The invitation, shown only to signed-out visitors at the foot of an item page.
//
// **No "keep browsing without an account" link** for a stranger from a shared link, which the
// prototype offers: `/feed` is auth-gated (src/proxy.ts) and would bounce them straight back to
// `/`, and the wander-next teaser above is already doing the "here's what this is" work. A
// visitor who came from the taste at `/` (09-26-26) is the exception — there *is* somewhere for
// them to keep browsing, so the card offers the way back.
//
// Signed-in readers see nothing at all: they're already inside.
//
// DESIGN_redesign §6.2: no card — left-aligned type on the page itself, a 26 px title, 14.5 px
// body and a 50 px white block. The prototype draws no second action; the way back is a second
// 50 px block in the outline variant, 10 px under the first, so the pair reads as one control
// group. It was a 13.5 px underlined TextLink hanging off the block's corner until Ben's phone
// look (10-08-26), which read as an afterthought against a full-width white block.
export interface JoinCtaProps {
  /** The article variant gets a quieter, shorter card — it sits under a long read, not a picture. */
  variant: "image" | "article";
  /** The visit began on the explore feed at `/`: add a "Keep exploring" link back to it. */
  exploring?: boolean;
}

function KeepExploring() {
  return (
    <Link href="/" className={cn(OUTLINE_BLOCK, BLOCK, "mt-[10px]")}>
      Keep exploring
    </Link>
  );
}

// The prototype's 50 px block (DESIGN §4.1), shared by both actions so they are the same size.
const BLOCK = "flex h-[50px] items-center justify-center text-[15px]";

export function JoinCta({ variant, exploring = false }: JoinCtaProps) {
  if (variant === "article") {
    return (
      <section className="mt-[44px]">
        <h2 className="text-ink-hi text-[22px] leading-[1.2]">
          Ambit is a quieter way to read.
        </h2>
        <p className="text-ink/68 mt-[10px] max-w-[34ch] text-[14.5px] leading-[1.5]">
          An invite-only feed of public-domain images and writing, tuned to what
          you&rsquo;re curious about.
        </p>
        <GetInvite />
        {exploring ? <KeepExploring /> : null}
      </section>
    );
  }

  return (
    <section className="mt-[44px] pb-[40px]">
      <h2 className="text-ink-hi text-[26px] leading-[1.12] tracking-[-0.015em]">
        Curiosity, without the doomscroll.
      </h2>
      <p className="text-ink/68 mt-[10px] max-w-[40ch] text-[14.5px] leading-[1.5]">
        Ambit is an invite-only feed of public-domain images and writing — no
        likes, no comments, no one performing for anyone.
      </p>
      <GetInvite />
      {exploring ? <KeepExploring /> : null}
    </section>
  );
}

// Button's `primary` colours at the prototype's 50 px (DESIGN §4.1) — a filled green CTA is not
// one of the accent's seven jobs. A styled <Link> rather than a <Button>: it navigates.
function GetInvite() {
  return (
    <Link href="/" className={cn(PRIMARY_BLOCK, BLOCK, "mt-[20px]")}>
      Get your invite
    </Link>
  );
}
