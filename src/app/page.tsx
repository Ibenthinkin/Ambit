import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { preload } from "react-dom";

import { AuthCard } from "~/components/landing/auth-card";
import { LandingScreen } from "~/components/landing/landing-screen";
import { resolveTempo } from "~/components/landing/tempos";
import { auth } from "~/lib/auth";
import { guessShape } from "~/server/config/landing-pool";
import { feedDebugEnabled } from "~/server/services/feed-debug";
import { getReels } from "~/server/services/landing-pool";

// The real Ambit landing/sign-in screen (SPEC §8.1). A Server Component: it checks for a real
// session itself (not the cookie-shape-only check in src/proxy.ts — see that file's comment for
// why the redirect can't live there) and bounces straight to /feed, so a signed-in visitor never
// sees the landing flash before redirecting. Reading `headers()` also keeps the route dynamic,
// which is what keeps both the session check and the reel pick out of build time.
//
// 8.3 (docs/DESIGN_landing-redo.md) made it pick the reel too: the server chooses the pictures
// (D2), so the first ones are `<link rel="preload">`s in the HTML and the first `<img>` is in the
// markup — nothing about the imagery waits for hydration. `?tempo=cut|dissolve` is honoured only
// under the dev gate (D5), the same function that gates /dev/feed, so a production build ignores
// it; that is how Ben compares the two tempos on a device.
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ tempo?: string }>;
}) {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (session) {
    redirect("/feed");
  }

  const { tempo: tempoParam } = await searchParams;
  const tempo = resolveTempo(tempoParam, await feedDebugEnabled());
  // Two reels — tall for a phone held upright, wide for anything else (09-25-26) — and a guess at
  // which this reader needs, from the user agent. Only the guessed reel is preloaded; the client
  // swaps to the other if the screen's real orientation disagrees.
  const reels = await getReels();
  const initialShape = guessShape(requestHeaders.get("user-agent"));

  // The budget's "preloaded from <head>" line: the gate's worth of the guessed reel. A `data:`
  // picture (the e2e fixtures) is inline already and needs no preload.
  for (const p of reels[initialShape].slice(0, tempo.gateFrames)) {
    if (p.src.startsWith("data:")) continue;
    preload(p.src, { as: "image", fetchPriority: "high" });
  }

  return (
    <LandingScreen
      mode="cycle"
      reels={reels}
      initialShape={initialShape}
      tempo={tempo}
    >
      <AuthCard />
    </LandingScreen>
  );
}
