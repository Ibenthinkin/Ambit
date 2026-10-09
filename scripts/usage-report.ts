// Admin script: print the usage digest (docs/DESIGN_usage.md, Cut 0) as markdown — who read,
// for how long, what they saved, how the feed's sources compare with the corpus, who came back.
// Run with `bun run usage:report [--days N] [--weeks N]` (defaults 7 and 6).
//
// On production, the same way as `invite` (the container is found by port, never by name):
//   C=$(docker ps -q --filter publish=3000); docker exec "$C" bun run usage:report
//
// Read-only: every query is a SELECT. It never prints an email — readers are `#3 (joined
// 09-20)` by account order — and it leaves out the twenty personas and the e2e accounts, which
// are not people. Safe to paste into a chat.
import { PERSONAS, personaEmail } from "~/server/config/personas";
import {
  onboardingRuns,
  readerLabels,
  readersActive,
  retentionByWeek,
  savesPerHundred,
  signIns,
  sittings,
  sourceShare,
} from "~/server/db/usage";
import { renderReport } from "~/server/services/usage-report";

/** `--days 14` -> 14. Anything missing or not a positive integer falls back to `fallback`. */
function flag(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  const n = i >= 0 ? Number(process.argv[i + 1]) : NaN;
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

async function main() {
  const days = flag("days", 7);
  const weeks = flag("weeks", 6);
  const until = new Date();
  const since = new Date(until.getTime() - days * 24 * 60 * 60 * 1000);
  const excludeEmails = PERSONAS.map((p) => personaEmail(p.slug));
  const w = { since, until, excludeEmails };

  // The readers are independent SELECTs, so they run side by side.
  const [labels, readers, sit, saves, onboarding, sign, sources, retention] =
    await Promise.all([
      readerLabels(excludeEmails),
      readersActive(w),
      sittings(w),
      savesPerHundred(w),
      onboardingRuns(w),
      signIns(w),
      sourceShare(w),
      retentionByWeek({ weeks, excludeEmails, now: until }),
    ]);

  console.log(
    renderReport({
      window: { since, until },
      weeks,
      labels,
      readers,
      sittings: sit,
      saves,
      onboarding,
      signIns: sign,
      sources,
      retention,
    }),
  );
  // The Postgres pool would otherwise keep the process alive.
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error("usage-report script failed:", err);
  process.exit(1);
});
