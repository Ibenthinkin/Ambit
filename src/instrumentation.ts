// Next.js's instrumentation hook (Phase 8.2, PHASE8_PLAN_8.2.md D4). Next calls `onRequestError`
// for every error it captures on the server — a page render, a route handler (tRPC's included), a
// server action, or the proxy — and this file hands each one to services/error-report.ts, which
// writes it as one JSON line and, when OPS_EMAIL is set, mails it (once an hour per error).
// `notFound()` and `redirect()` are control flow, not errors, and Next does not report them here.
//
// **Why the dynamic import.** This file is evaluated in every runtime Next has, the Edge one
// included, and the mailer pulls in Node-only modules (nodemailer, Resend's SDK). Checking
// `NEXT_RUNTIME` first and importing inside the branch keeps those out of the Edge bundle — the
// Next docs' own pattern. (Ambit runs no Edge routes today; this is what keeps adding one from
// breaking the build.)
//
// **Why not Sentry.** Five invited readers do not need a hosted error tracker, a second account,
// or a client SDK in the bundle; one log line and one throttled mail cover them. The upgrade path
// is recorded in the plan's "Out of scope": self-hosted GlitchTip, which speaks Sentry's protocol
// (`@sentry/nextjs` with a DSN swap), once there are more than ~5 active users or the first time
// the one-mail-an-hour throttle is what hid a real problem.
import type { Instrumentation } from "next";

import type { ErrorThrottle } from "~/server/services/error-report";

// One throttle for the life of the process — the "one app instance" deploy shape. Created on the
// first error, inside the nodejs branch, so the Edge runtime never evaluates error-report.ts.
let throttle: ErrorThrottle | undefined;

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const [{ ErrorThrottle, reportServerError }, { getMailer }, { env }] =
    await Promise.all([
      import("~/server/services/error-report"),
      import("~/server/services/mailer"),
      import("~/env"),
    ]);
  throttle ??= new ErrorThrottle();

  await reportServerError(error, request, context, {
    // stderr: what `docker logs` and Coolify's log view keep.
    log: (line) => console.error(line),
    getMailer,
    opsEmail: env.OPS_EMAIL,
    throttle,
    now: () => new Date(),
  });
};
