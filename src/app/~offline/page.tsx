// Precached by the service worker (see src/app/serwist/sw.js/route.ts's `additionalPrecacheEntries`
// and src/app/sw.ts's `fallbacks`), so this renders even with no network at all — the one page
// guaranteed to be in the cache before anything goes wrong. The `~` prefix keeps it out of any
// real navigation (nothing links here); it's Serwist's fallback target only.
export default function OfflinePage() {
  return (
    // Brought onto the design system in Phase 5.4 — this page carried the T3 starter's purple
    // gradient and `text-white` right through 5.1-5.3, being the one screen no route links to.
    <main className="bg-bg flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <h1 className="text-ink-hi text-[26px] leading-[1.1] font-semibold tracking-[-0.3px]">
        You&apos;re offline
      </h1>
      <p className="text-ink/62 mt-3 max-w-[280px] text-[15.5px] leading-[1.55]">
        Ambit needs a connection to load new pages. Reconnect and try again.
      </p>
    </main>
  );
}
