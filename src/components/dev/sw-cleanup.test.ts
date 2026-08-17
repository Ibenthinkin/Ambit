// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cleanupStaleServiceWorkers } from "./sw-cleanup";

// These tests drive the extracted cleanup routine, not the <SwCleanup /> wrapper — the component
// is a one-line useEffect around it. jsdom has no navigator.serviceWorker or caches at all, so
// each test stubs exactly the browser state it's about: how many registrations exist, whether the
// page is currently controlled by a worker, and what the once-per-session guard flag says.

function stubServiceWorker({
  registrations = [] as Array<{ unregister: () => Promise<boolean> }>,
  controlled = false,
} = {}) {
  const sw = {
    getRegistrations: vi.fn(async () => registrations),
    controller: controlled
      ? { scriptURL: "http://localhost/serwist/sw.js" }
      : null,
  };
  vi.stubGlobal("navigator", { serviceWorker: sw });
  const caches = {
    keys: vi.fn(async () => ["serwist-precache"]),
    delete: vi.fn(async () => true),
  };
  vi.stubGlobal("caches", caches);
  return { sw, caches };
}

function registration() {
  return { unregister: vi.fn(async () => true) };
}

describe("cleanupStaleServiceWorkers", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("unregisters every registration and clears all caches", async () => {
    const regs = [registration(), registration()];
    const { caches } = stubServiceWorker({
      registrations: regs,
      controlled: true,
    });

    await cleanupStaleServiceWorkers(vi.fn());

    for (const r of regs) expect(r.unregister).toHaveBeenCalledOnce();
    expect(caches.delete).toHaveBeenCalledWith("serwist-precache");
  });

  it("reloads a controlled page (its live bundle may be stale) and arms the guard", async () => {
    stubServiceWorker({ registrations: [registration()], controlled: true });
    const reload = vi.fn();

    await cleanupStaleServiceWorkers(reload);

    expect(reload).toHaveBeenCalledOnce();
  });

  it("never reloads twice in one tab session — warns instead, breaking any reload loop", async () => {
    stubServiceWorker({ registrations: [registration()], controlled: true });
    const reload = vi.fn();

    await cleanupStaleServiceWorkers(reload);
    // Something (another tab, an installed PWA) re-registered the worker; the page reloaded and
    // cleanup runs again in the same tab session.
    stubServiceWorker({ registrations: [registration()], controlled: true });
    await cleanupStaleServiceWorkers(reload);

    expect(reload).toHaveBeenCalledOnce();
    expect(console.warn).toHaveBeenCalled();
  });

  it("skips the reload entirely when no worker controls the page", async () => {
    stubServiceWorker({ registrations: [registration()], controlled: false });
    const reload = vi.fn();

    await cleanupStaleServiceWorkers(reload);

    expect(reload).not.toHaveBeenCalled();
  });

  it("re-arms the guard once a pass finds nothing to clean", async () => {
    stubServiceWorker({ registrations: [registration()], controlled: true });
    const reload = vi.fn();
    await cleanupStaleServiceWorkers(reload);

    // Post-reload pass: clean. The guard should reset so a future stale worker (much later in
    // this tab's life) still gets its one corrective reload.
    stubServiceWorker({ registrations: [], controlled: false });
    await cleanupStaleServiceWorkers(reload);

    stubServiceWorker({ registrations: [registration()], controlled: true });
    await cleanupStaleServiceWorkers(reload);

    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("swallows failures instead of breaking the page it is cleaning", async () => {
    const sw = {
      getRegistrations: vi.fn(async () => {
        throw new Error("boom");
      }),
      controller: null,
    };
    vi.stubGlobal("navigator", { serviceWorker: sw });

    await expect(cleanupStaleServiceWorkers(vi.fn())).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalled();
  });
});
