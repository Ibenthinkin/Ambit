"use client";

// Mounts the usage client once (layout.tsx, only when NEXT_PUBLIC_USAGE_ENABLED === "1"): starts
// the visit, flushes on page hide, and records one `screen.open` per route change. Renders nothing.
import { nanoid } from "nanoid";
import { usePathname, useSearchParams } from "next/navigation";
import * as React from "react";

import { DESKTOP_QUERY } from "~/hooks/use-media-query";
import {
  browserSend,
  browserStorage,
  createUsage,
  installUsage,
  screenFor,
  track,
  viaFor,
  type Track,
} from "~/lib/usage";

/** `useUsage().track` works anywhere; with the flag off (no provider) it is a no-op. */
export function useUsage(): { track: Track } {
  return { track };
}

function UsageProviderInner() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const lastScreen = React.useRef<string | null>(null);

  React.useEffect(() => {
    const usage = createUsage({
      send: browserSend,
      now: () => Date.now(),
      storage: browserStorage,
      isVisible: () => document.visibilityState === "visible",
      newId: () => nanoid(16),
    });
    installUsage(usage);
    usage.start({
      screen:
        screenFor(window.location.pathname, window.location.search) ??
        undefined,
      // Read straight from matchMedia: the useMediaQuery hook answers its *server* value (false)
      // during the first client render, which would label every desktop visit "phone".
      device:
        typeof window.matchMedia === "function" &&
        window.matchMedia(DESKTOP_QUERY).matches
          ? "desktop"
          : "phone",
      standalone:
        typeof window.matchMedia === "function" &&
        window.matchMedia("(display-mode: standalone)").matches,
      via: viaFor(document.referrer, window.location.origin),
    });

    // `visibilitychange → hidden` is the reliable "leaving" signal on phones (switching apps never
    // fires `pagehide`); `pagehide` covers desktop tab close. Coming back is the same visit.
    const onVisibility = () => {
      if (document.visibilityState === "hidden") usage.end();
      else usage.resume();
    };
    const onPageHide = () => usage.end();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      usage.end();
      usage.stop();
      installUsage(null);
    };
  }, []);

  // One screen.open per change of *screen*. `/saved` -> `/saved?collection=x` keeps the pathname
  // and changes the query (collection chips use router.replace), so the effect depends on both;
  // the ref stops a query change that stays on the same screen (or a re-run) from repeating.
  React.useEffect(() => {
    const screen = screenFor(pathname, search);
    if (!screen || screen === lastScreen.current) return;
    lastScreen.current = screen;
    track("screen.open", { screen });
  }, [pathname, search]);

  return null;
}

/**
 * `useSearchParams()` makes a component wait for the request's query string, so Next wants a
 * Suspense boundary around it. This renders nothing, so a null fallback changes no layout.
 */
export function UsageProvider() {
  return (
    <React.Suspense fallback={null}>
      <UsageProviderInner />
    </React.Suspense>
  );
}
