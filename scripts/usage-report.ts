// Admin script: print the usage digest (docs/DESIGN_usage.md, Cut 0) as markdown — who read,
// for how long, what they saved, how the feed's sources compare with the corpus, who came back.
// Run with `bun run usage:report [--days N] [--weeks N] [--prune] [--mail]` (defaults 7 and 6).
//   --prune  after printing, delete usage events older than USAGE_RETENTION_DAYS (default off)
//   --mail   also send the digest to OPS_EMAIL through the app's mailer (Mailpit locally,
//            Resend in production); exits 1 up front if OPS_EMAIL is unset
//
// On production, the same way as `invite` (the container is found by port, never by name):
//   C=$(docker ps -q --filter publish=3000); docker exec "$C" bun run usage:report
//
// Read-only: every query is a SELECT. It never prints an email — readers are `#3 (joined
// 09-20)` by account order — and it leaves out the twenty personas and the e2e accounts, which
// are not people. Safe to paste into a chat.
import { USAGE_RETENTION_DAYS } from "~/config/usage";
import { env } from "~/env";
import { PERSONAS, personaEmail } from "~/server/config/personas";
import {
  clientErrors,
  installs,
  itemActions,
  itemOpens,
  onboardingFunnel,
  onboardingRuns,
  pruneEvents,
  readerLabels,
  readersActive,
  retentionByWeek,
  screensPerVisit,
  savesPerHundred,
  signIns,
  sittings,
  sourceShare,
  topicEdits,
  visits,
} from "~/server/db/usage";
import { getMailer } from "~/server/services/mailer";
import { renderMail, renderReport } from "~/server/services/usage-report";

/** `--days 14` -> 14. Anything missing or not a positive integer falls back to `fallback`. */
function flag(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  const n = i >= 0 ? Number(process.argv[i + 1]) : NaN;
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/** A bare switch: `--prune` is on if it appears anywhere in argv. */
const has = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const mail = has("mail");
  // Fail before touching the database: a --mail run with nowhere to send is a mistake to hear
  // about at once, not after a minute of queries.
  if (mail && !env.OPS_EMAIL) {
    console.error("usage-report: --mail needs OPS_EMAIL to be set.");
    process.exit(1);
  }
  const days = flag("days", 7);
  const weeks = flag("weeks", 6);
  const until = new Date();
  const since = new Date(until.getTime() - days * 24 * 60 * 60 * 1000);
  const excludeEmails = PERSONAS.map((p) => personaEmail(p.slug));
  const w = { since, until, excludeEmails };

  // The readers are independent SELECTs, so they run side by side.
  const [
    labels,
    readers,
    sit,
    saves,
    onboarding,
    sign,
    sources,
    retention,
    vis,
    screens,
    opens,
    actions,
    edits,
    funnel,
    inst,
    errors,
  ] = await Promise.all([
    readerLabels(excludeEmails),
    readersActive(w),
    sittings(w),
    savesPerHundred(w),
    onboardingRuns(w),
    signIns(w),
    sourceShare(w),
    retentionByWeek({ weeks, excludeEmails, now: until }),
    visits(w),
    screensPerVisit(w),
    itemOpens(w),
    itemActions(w),
    topicEdits(w),
    onboardingFunnel(w),
    installs(w),
    clientErrors(w),
  ]);

  const report = renderReport({
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
    visits: vis,
    screens,
    opens,
    actions,
    topicEdits: edits,
    funnel,
    installs: inst,
    errors,
  });
  console.log(report);

  if (mail && env.OPS_EMAIL) {
    const { subject, text } = renderMail(
      report,
      since.toISOString().slice(0, 10),
    );
    await getMailer().send({ to: env.OPS_EMAIL, subject, text });
    console.log(`Mailed the digest to ${env.OPS_EMAIL}.`);
  }

  // Last, so the count is the final line of output. Rows older than the retention window
  // (posture 5: events are kept 90 days, not forever).
  if (has("prune")) {
    const n = await pruneEvents(USAGE_RETENTION_DAYS);
    console.log(
      `Pruned ${n} usage events older than ${USAGE_RETENTION_DAYS} days.`,
    );
  }
  // The Postgres pool would otherwise keep the process alive.
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error("usage-report script failed:", err);
  process.exit(1);
});
