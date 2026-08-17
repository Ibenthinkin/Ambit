"use client";

import * as React from "react";

// Dev-only: tear down any service worker (and its caches) still installed on this origin.
//
// Why this exists. The app registers a real precaching service worker (Serwist, ~120KB) for the
// PWA, and until Phase 5.5 it registered in development too. That is a bad combination with a dev
// server: chunk URLs change on every rebuild, so a device that visited earlier in the session keeps
// getting served stale JS from the SW cache. The page still renders — the HTML and CSS are fine —
// but the hydration bundle doesn't match, so **nothing on the page responds to a tap**, with no
// error in the terminal and none in the browser console either. It cost an hour of debugging on a
// real phone during 5.5's device pass before the SW was suspected at all.
//
// `layout.tsx` no longer registers the SW outside production, which prevents the problem going
// forward — but that alone can't help a device that already has one installed, since an installed
// worker keeps controlling the origin whether or not the page registers it again. Hence this: in
// dev, actively unregister and clear, so any phone or laptop already in that state fixes itself on
// the next load instead of needing Settings → Clear Website Data.
//
// Renders nothing, and is never included in a production build (see layout.tsx).
export function SwCleanup() {
  React.useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    void (async () => {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        if (registrations.length === 0) return;

        await Promise.all(registrations.map((r) => r.unregister()));
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }

        // The unregistered worker keeps controlling THIS page until it's replaced or the page is
        // reloaded, so the stale bundle is still live right now — one reload makes the clean state
        // take effect.
        console.info(
          "[dev] Removed %d stale service worker registration(s) and cleared caches. Reloading…",
          registrations.length,
        );
        window.location.reload();
      } catch (err) {
        // Never let dev-only cleanup break the page it's cleaning up.
        console.warn("[dev] service worker cleanup failed", err);
      }
    })();
  }, []);

  return null;
}
