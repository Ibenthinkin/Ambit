// Server errors, written down and mailed (Phase 8.2, PHASE8_PLAN_8.2.md D4).
//
// Before this, a request that threw on the server went nowhere a person would look: the tRPC
// route logs in development only, and there is no error.tsx. In production a 500 was a gap in the
// reader's afternoon and nothing in Ben's. `src/instrumentation.ts` hands every server-side throw
// (render, route handler, server action, proxy) to `reportServerError` below, which does two
// things:
//
//   1. Always writes ONE line of JSON to stderr — so `docker logs` and Coolify's log view hold a
//      greppable record of every error, with the route, the message and eight stack frames.
//   2. When `OPS_EMAIL` is set, mails that line — at most once an hour per error signature, so a
//      broken page that every reader hits sends one mail, not a thousand.
//
// It never throws. An error reporter that errors turns one failure into two, and the second one
// (a mail provider timing out, say) would hide the first.
//
// Everything with a side effect — the clock, the log sink, the mailer — comes in as a dependency,
// which is what lets error-report.test.ts cover all of it without Next or a mail server.
import type { Mailer } from "./mailer";

/** The subset of Next's `onRequestError` request argument this reads. Headers are deliberately
 *  absent from what we use: cookies — session tokens — live there. */
export interface ErrorRequest {
  path: string;
  method: string;
}

/** The subset of Next's `onRequestError` context argument this reads. */
export interface ErrorContext {
  routePath: string;
  routeType: string;
}

/** The one line. Field order is the order it prints in. */
export interface ServerErrorLine {
  level: "error";
  at: string;
  method: string;
  path: string;
  routeType: string;
  routePath: string;
  message: string;
  /** Next's hash of a server error, shown to the reader on its error page — the join key between
   *  "a friend saw error 3127954876" and this line. */
  digest?: string;
  /** The first eight `at …` frames, newline-joined (JSON escapes them, so it stays one line). */
  stack?: string;
}

const STACK_FRAMES = 8;

export function formatServerError(
  error: unknown,
  request: ErrorRequest,
  context: ErrorContext,
  now: Date,
): ServerErrorLine {
  const isError = error instanceof Error;
  const digest =
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string"
      ? error.digest
      : undefined;
  // `stack` starts with the "Error: message" line, which `message` already carries.
  const frames = isError
    ? (error.stack ?? "")
        .split("\n")
        .filter((l) => l.trimStart().startsWith("at "))
        .slice(0, STACK_FRAMES)
    : [];
  return {
    level: "error",
    at: now.toISOString(),
    method: request.method,
    // Pathname only. A query string can carry a secret — the password-reset link's `?token=`.
    path: request.path.split("?")[0] ?? request.path,
    routeType: context.routeType,
    routePath: context.routePath,
    message: isError ? error.message : String(error),
    ...(digest !== undefined && { digest }),
    ...(frames.length > 0 && { stack: frames.join("\n") }),
  };
}

/** One mail per error signature per this long. */
export const ERROR_MAIL_INTERVAL_MS = 60 * 60 * 1000;
/** How many signatures the throttle remembers before forgetting the oldest. */
export const MAX_REMEMBERED_SIGNATURES = 200;

/**
 * "Have I mailed about this error in the last hour?" — an in-process map, like both rate limiters
 * and the image cache's in-flight map, because one app instance is the deploy shape. A restart
 * forgets it, which at worst sends one extra mail.
 *
 * Bounded: an error whose message changes every time (an id in the text) would otherwise add an
 * entry per request forever. A Map iterates in insertion order, so re-inserting on send keeps the
 * newest at the end and the first key is always the oldest to evict.
 */
export class ErrorThrottle {
  private lastSent = new Map<string, number>();

  shouldSend(signature: string, nowMs: number): boolean {
    const last = this.lastSent.get(signature);
    if (last !== undefined && nowMs - last < ERROR_MAIL_INTERVAL_MS) {
      return false;
    }
    this.lastSent.delete(signature);
    this.lastSent.set(signature, nowMs);
    if (this.lastSent.size > MAX_REMEMBERED_SIGNATURES) {
      const oldest = this.lastSent.keys().next().value;
      if (oldest !== undefined) this.lastSent.delete(oldest);
    }
    return true;
  }

  get size(): number {
    return this.lastSent.size;
  }
}

export interface ReportDeps {
  /** Where the line goes. `console.error` in production — stderr, which Docker keeps. */
  log: (line: string) => void;
  /** Lazy, so an unset OPS_EMAIL never constructs a mail transport at all. */
  getMailer: () => Mailer;
  opsEmail: string | undefined;
  throttle: ErrorThrottle;
  now: () => Date;
}

export async function reportServerError(
  error: unknown,
  request: ErrorRequest,
  context: ErrorContext,
  deps: ReportDeps,
): Promise<void> {
  try {
    const now = deps.now();
    const line = formatServerError(error, request, context, now);
    const json = JSON.stringify(line);
    deps.log(json);

    if (!deps.opsEmail) return;
    // Same route + same message = the same problem. The path is left out on purpose: a broken
    // item page throws once per item id, and that is one bug, not a thousand.
    const signature = `${line.routePath} ${line.message}`;
    if (!deps.throttle.shouldSend(signature, now.getTime())) return;

    try {
      await deps.getMailer().send({
        to: deps.opsEmail,
        subject: `[ambit] server error: ${line.message.slice(0, 80)}`,
        text:
          `${json}\n\n` +
          `Further occurrences of this error on ${line.routePath} are logged but not mailed ` +
          `for the next hour. Search the container log for the digest or the message.`,
      });
    } catch (mailErr) {
      deps.log(
        JSON.stringify({
          level: "error",
          at: deps.now().toISOString(),
          message: `error-report: mailing the error above failed — ${String(mailErr)}`,
        }),
      );
    }
  } catch {
    // Formatting or logging itself failed. There is nowhere left to say so; swallow, so the
    // original request's failure stays the only one.
  }
}
