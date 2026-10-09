"use client";

// Mounts the usage client once (layout.tsx, only when NEXT_PUBLIC_USAGE_ENABLED === "1"): starts
// the visit, flushes on page hide, and records one `screen.open` per route change. Renders nothing.
import { nanoid } from "nanoid";
import { usePathname } from "next/navigation";
import * as React from "react";

import { DESKTOP_QUERY, useMediaQuery } from "~/hooks/use-media-query";
import {
  browserSend,
  browserStorage,
  createUsage,
  installUsage,
  screenFor,
  track,
  viaFor,
  type Track,
  type Usage,
} from "~/lib/usage";

/** `useUsage().track` works anywhere; with the flag off (no provider) it is a no-op. */
export function useUsage(): { track: Track } {
  return { track };
}

export function UsageProvider() {
  const pathname = usePathname();
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const usageRef = React.useRef<Usage | null>(null);
  // The entry values are read once, at start; later resizes don't make a new visit.
  const desktopRef = React.useRef(desktop);
  React.useEffect(() => {
    desktopRef.current = desktop;
  }, [desktop]);

  React.useEffect(() => {
    const usage = createUsage({
      send: browserSend,
      now: () => Date.now(),
      storage: browserStorage,
      isVisible: () => document.visibilityState === "visible",
      newId: () => nanoid(16),
    });
    usageRef.current = usage;
    installUsage(usage);
    usage.start({
      screen:
        screenFor(window.location.pathname, window.location.search) ??
        undefined,
      device: desktopRef.current ? "desktop" : "phone",
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
      usageRef.current = null;
    };
  }, []);

  // One screen.open per route change. The first run lands after the start effect (effects run in
  // order), so visit.start precedes it in the queue.
  React.useEffect(() => {
    const screen = screenFor(pathname, window.location.search);
    if (screen) track("screen.open", { screen });
  }, [pathname]);

  return null;
}
