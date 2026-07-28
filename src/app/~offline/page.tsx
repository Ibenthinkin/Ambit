// Precached by the service worker (see src/app/serwist/sw.js/route.ts's `additionalPrecacheEntries`
// and src/app/sw.ts's `fallbacks`), so this renders even with no network at all — the one page
// guaranteed to be in the cache before anything goes wrong. The `~` prefix keeps it out of any
// real navigation (nothing links here); it's Serwist's fallback target only.
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#2e026d] to-[#15162c] px-4 text-center text-white">
      <h1 className="text-3xl font-extrabold tracking-tight">
        You&apos;re offline
      </h1>
      <p className="mt-4 max-w-xs text-white/70">
        Ambit needs a connection to load new pages. Reconnect and try again.
      </p>
    </main>
  );
}
