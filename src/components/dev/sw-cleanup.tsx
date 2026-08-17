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

// The reload below is corrective, but it's also a loop hazard: if some *other* context keeps
// re-registering the worker — an old tab still running a pre-fix bundle, or the installed PWA
// window from the 5.5 device pass — then "found a registration → reload" fires on every load and
// the page refreshes forever (it did, on 08-17-26). sessionStorage survives reloads but is scoped
// to this one tab, which makes it exactly the right memory for "this tab already got its one
// corrective reload".
const RELOADED_KEY = "ambit:dev-sw-cleanup-reloaded";

export async function cleanupStaleServiceWorkers(
  reload: () => void = () => window.location.reload(),
): Promise<void> {
  if (!("serviceWorker" in navigator)) return;

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    if (registrations.length === 0) {
      // Clean state: re-arm the guard so a worker that shows up much later in this tab's life
      // still gets its one corrective reload.
      sessionStorage.removeItem(RELOADED_KEY);
      return;
    }

    await Promise.all(registrations.map((r) => r.unregister()));
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }

    // Reload only if it can actually help, and only once per tab session.
    //
    // `controller` is the worker currently serving THIS page's requests. If it's null, the page
    // came straight from the network — nothing live is stale, so the unregister alone finishes
    // the job. If it's set, the bundle running right now may have come from the SW cache, and one
    // reload swaps in the clean state.
    if (!navigator.serviceWorker.controller) {
      console.info(
        "[dev] Removed %d stale service worker registration(s) and cleared caches.",
        registrations.length,
      );
      return;
    }
    if (sessionStorage.getItem(RELOADED_KEY)) {
      // We already reloaded once and a registration is BACK — reloading again would loop.
      // Something else on this origin keeps re-registering the worker.
      console.warn(
        "[dev] A service worker re-appeared after cleanup already reloaded this tab — not reloading again. " +
          "Close other localhost tabs and any installed Ambit PWA window, then reload manually.",
      );
      return;
    }
    sessionStorage.setItem(RELOADED_KEY, "1");
    console.info(
      "[dev] Removed %d stale service worker registration(s) and cleared caches. Reloading…",
      registrations.length,
    );
    reload();
  } catch (err) {
    // Never let dev-only cleanup break the page it's cleaning up.
    console.warn("[dev] service worker cleanup failed", err);
  }
}

export function SwCleanup() {
  React.useEffect(() => {
    void cleanupStaleServiceWorkers();
  }, []);

  return null;
}
