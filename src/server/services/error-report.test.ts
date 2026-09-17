// Unit tests for the server-error reporter (Phase 8.2, PHASE8_PLAN_8.2.md D4). Everything the
// reporter touches — the clock, the log sink, the mailer — is passed in, so none of this needs
// Next, a network, or a mail server. The local end-to-end proof (a throwing route, Mailpit) is in
// docs/PHASE8_WALKTHROUGH_8.2.md.
import { describe, expect, it, vi } from "vitest";

import type { Mailer } from "./mailer";
import {
  ERROR_MAIL_INTERVAL_MS,
  ErrorThrottle,
  formatServerError,
  MAX_REMEMBERED_SIGNATURES,
  reportServerError,
} from "./error-report";

const now = new Date("2026-09-17T14:00:00Z");
const request = {
  path: "/api/trpc/feed.page?batch=1&input=%7B%7D",
  method: "GET",
  headers: { cookie: "better-auth.session_token=SECRET" },
};
const context = {
  routerKind: "App Router",
  routePath: "/api/trpc/[trpc]",
  routeType: "route",
};

function boom(message = "relation does not exist"): Error {
  const err = new Error(message);
  err.stack = [
    `Error: ${message}`,
    ...Array.from(
      { length: 12 },
      (_, i) => `    at frame${i} (file.ts:${i}:1)`,
    ),
  ].join("\n");
  return err;
}

describe("formatServerError", () => {
  it("produces the D4 line: level, time, request, route, message", () => {
    expect(formatServerError(boom(), request, context, now)).toMatchObject({
      level: "error",
      at: "2026-09-17T14:00:00.000Z",
      method: "GET",
      routeType: "route",
      routePath: "/api/trpc/[trpc]",
      message: "relation does not exist",
    });
  });

  // A query string can carry a secret — a password-reset link's ?token= is the obvious one — so
  // only the pathname is written down.
  it("keeps the pathname and drops the query string", () => {
    expect(formatServerError(boom(), request, context, now).path).toBe(
      "/api/trpc/feed.page",
    );
  });

  it("cuts the stack to eight frames", () => {
    const { stack } = formatServerError(boom(), request, context, now);
    const frames = stack!.split("\n");
    expect(frames).toHaveLength(8);
    expect(frames[0]).toContain("frame0");
    expect(frames[7]).toContain("frame7");
  });

  it("carries Next's digest when the error has one", () => {
    const err = Object.assign(boom(), { digest: "3127954876" });
    expect(formatServerError(err, request, context, now).digest).toBe(
      "3127954876",
    );
  });

  it("describes a thrown non-Error by its string form, without a stack", () => {
    const line = formatServerError("plain string", request, context, now);
    expect(line.message).toBe("plain string");
    expect(line.stack).toBeUndefined();
  });

  // Cookies — session tokens — live in the headers. Nothing from them may be written or mailed.
  it("never includes request headers", () => {
    const json = JSON.stringify(
      formatServerError(boom(), request, context, now),
    );
    expect(json).not.toContain("SECRET");
    expect(json).not.toContain("cookie");
  });
});

describe("ErrorThrottle", () => {
  it("allows the first occurrence of a signature", () => {
    expect(new ErrorThrottle().shouldSend("a", now.getTime())).toBe(true);
  });

  it("refuses the same signature again within the hour", () => {
    const t = new ErrorThrottle();
    t.shouldSend("a", now.getTime());
    expect(t.shouldSend("a", now.getTime() + ERROR_MAIL_INTERVAL_MS - 1)).toBe(
      false,
    );
  });

  it("allows it again once the hour has passed", () => {
    const t = new ErrorThrottle();
    t.shouldSend("a", now.getTime());
    expect(t.shouldSend("a", now.getTime() + ERROR_MAIL_INTERVAL_MS)).toBe(
      true,
    );
  });

  it("throttles each signature independently", () => {
    const t = new ErrorThrottle();
    t.shouldSend("a", now.getTime());
    expect(t.shouldSend("b", now.getTime())).toBe(true);
  });

  // An error storm with a new message every time (an id in the text, say) must not grow the map
  // without bound. The oldest signature is forgotten — at worst, it can mail once more.
  it("remembers at most 200 signatures, forgetting the oldest", () => {
    const t = new ErrorThrottle();
    for (let i = 0; i <= MAX_REMEMBERED_SIGNATURES; i++) {
      t.shouldSend(`sig-${i}`, now.getTime());
    }
    expect(t.size).toBe(MAX_REMEMBERED_SIGNATURES);
    expect(t.shouldSend("sig-0", now.getTime())).toBe(true);
    expect(
      t.shouldSend(`sig-${MAX_REMEMBERED_SIGNATURES}`, now.getTime()),
    ).toBe(false);
  });
});

describe("reportServerError", () => {
  function deps(
    overrides: Partial<Parameters<typeof reportServerError>[3]> = {},
  ) {
    const send = vi.fn<Mailer["send"]>().mockResolvedValue(undefined);
    const log = vi.fn<(line: string) => void>();
    return {
      send,
      log,
      d: {
        log,
        getMailer: () => ({ send }),
        opsEmail: "ops@example.test",
        throttle: new ErrorThrottle(),
        now: () => now,
        ...overrides,
      },
    };
  }

  it("logs one JSON line and mails it", async () => {
    const { send, log, d } = deps();
    await reportServerError(boom(), request, context, d);

    expect(log).toHaveBeenCalledTimes(1);
    const line = log.mock.calls[0]![0];
    expect(line).not.toContain("\n");
    expect(JSON.parse(line)).toMatchObject({ level: "error" });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0]).toMatchObject({ to: "ops@example.test" });
    expect(send.mock.calls[0]![0].text).toContain(line);
  });

  it("logs every occurrence but mails a repeated error once an hour", async () => {
    const { send, log, d } = deps();
    await reportServerError(boom(), request, context, d);
    await reportServerError(boom(), request, context, d);

    expect(log).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("logs only, and never builds a mailer, when OPS_EMAIL is unset", async () => {
    const getMailer = vi.fn();
    const { log, d } = deps({ opsEmail: undefined, getMailer });
    await reportServerError(boom(), request, context, d);

    expect(log).toHaveBeenCalledTimes(1);
    expect(getMailer).not.toHaveBeenCalled();
  });

  // An error reporter that throws turns one failure into two. A mail provider that is down, or a
  // misconfigured key, is logged and swallowed.
  it("does not propagate a mailer that rejects, and logs that the mail failed", async () => {
    const { send, log, d } = deps();
    send.mockRejectedValue(new Error("Resend 403"));

    await expect(
      reportServerError(boom(), request, context, d),
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledTimes(2);
    expect(log.mock.calls[1]![0]).toContain("Resend 403");
  });

  it("does not propagate a mailer that throws while being built", async () => {
    const { d } = deps({
      getMailer: () => {
        throw new Error("no transport");
      },
    });
    await expect(
      reportServerError(boom(), request, context, d),
    ).resolves.toBeUndefined();
  });
});
