import Link from "next/link";

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
// Task 2.8: the Card primitive is gone. The two surfaces below are plain bordered divs on the
// design's `--color-card` with no radius; Phase 4 lays this block out properly.
export interface JoinCtaProps {
  /** The article variant gets a quieter, shorter card — it sits under a long read, not a picture. */
  variant: "image" | "article";
  /** The visit began on the explore feed at `/`: add a "Keep exploring" link back to it. */
  exploring?: boolean;
}

function KeepExploring() {
  return (
    <Link
      href="/"
      className="text-accent mt-[14px] block text-[13.5px] font-medium"
    >
      Keep exploring
    </Link>
  );
}

export function JoinCta({ variant, exploring = false }: JoinCtaProps) {
  if (variant === "article") {
    return (
      <div className="border-hairline border-ink/8 bg-card mt-[30px] px-[22px] py-[24px] text-center">
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
      </div>
    );
  }

  return (
    <div className="border-hairline border-ink/8 bg-card mt-[34px] px-[22px] py-[28px] text-center">
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
    </div>
  );
}
