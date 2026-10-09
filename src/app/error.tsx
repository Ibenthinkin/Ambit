"use client";

import { usePathname } from "next/navigation";
import * as React from "react";

import { Button } from "~/components/ui/button";
import { useUsage } from "~/components/usage/usage-provider";
import { DIGEST_MAX } from "~/config/usage";
import { screenFor } from "~/lib/usage";

// Next's convention: `app/error.tsx` is the boundary for anything that throws while rendering a
// route (it wraps the page, inside the root layout). Until 10-09-26 the app had none, so a render
// error showed Next's bare default. This is the plain version — what happened, and the two ways
// on — in the same voice as the offline page.
//
// It is also where `client.error` is recorded (docs/DESIGN_usage.md). The *digest* is the whole
// payload: a short hash Next stamps on a server-side error so the log line and the browser can be
// matched up. The message and stack are never sent — they can carry anything a render touched.
// (`error.digest` is absent for an error thrown in the browser; "no-digest" says so.)
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { track } = useUsage();
  const pathname = usePathname();

  // Once per error. A ref, not state: in development React runs effects twice and a second event
  // for the same failure would be a lie. `reset()` followed by another throw is a new `error`
  // object, so it counts again.
  const recorded = React.useRef<Error | null>(null);
  React.useEffect(() => {
    if (recorded.current === error) return;
    recorded.current = error;
    track("client.error", {
      screen: screenFor(pathname) ?? undefined,
      meta: { digest: (error.digest ?? "no-digest").slice(0, DIGEST_MAX) },
    });
  }, [error, pathname, track]);

  return (
    <main className="bg-bg flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <h1 className="text-ink-hi text-display">Something went wrong</h1>
      <p className="text-ink/62 mt-3 max-w-[280px] text-sm">
        That one is on us. Try again, or head back to the feed.
      </p>
      <div className="mt-8 flex items-center gap-3">
        {/* A full navigation, not router.push: after a render error it is the one sure to start
            from a clean tree. */}
        <Button onClick={() => window.location.assign("/feed")}>
          Back to the feed
        </Button>
        <Button variant="outline" onClick={reset}>
          Try again
        </Button>
      </div>
    </main>
  );
}
