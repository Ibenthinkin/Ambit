// Transactional mail (password reset, SPEC §3.1). Same isolation ethos as `SourceAdapter`
// (server/services/sources/*, Phase 3): one small interface, swappable implementations, and the
// call sites (src/lib/auth.ts) never know or care which one is live.
//
// Two implementations:
//   - MailpitMailer: dev only. Mailpit (docker-compose.yml) is a fake SMTP server that catches
//     everything sent to it instead of delivering — read caught mail at http://localhost:8025.
//     No credentials: it accepts any connection on localhost:1025.
//   - ResendMailer: prod. A real transactional-mail provider; needs RESEND_API_KEY.
//
// `getMailer()` picks one at call time based on env, so the app never branches on
// `NODE_ENV`/`RESEND_API_KEY` outside this file.
import { Resend } from "resend";
import nodemailer from "nodemailer";

import { env } from "~/env";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

class MailpitMailer implements Mailer {
  // Lazily constructed nodemailer transport aimed at the compose Mailpit container.
  private transport = nodemailer.createTransport({
    host: "localhost",
    port: 1025,
    secure: false, // Mailpit doesn't speak TLS on 1025.
    // No `auth` key: nodemailer skips SMTP AUTH entirely when it's omitted, which is what
    // Mailpit expects (it authenticates nobody).
  });

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({
      from: "Ambit <dev@ambit.local>",
      ...message,
    });
  }
}

// Exported for its own test only — `getMailer()` below is how the app gets one.
export class ResendMailer implements Mailer {
  private client: Resend;
  private from: string;

  /**
   * @param from - the envelope sender, which Resend rejects unless it is on a domain verified in
   *   the account. Defaults to `MAIL_FROM` (8.1); passed explicitly by tests.
   */
  constructor(apiKey: string, from: string = env.MAIL_FROM) {
    this.client = new Resend(apiKey);
    this.from = from;
  }

  async send(message: MailMessage): Promise<void> {
    const { error } = await this.client.emails.send({
      from: this.from,
      ...message,
    });
    if (error) {
      // Surfaced to whoever awaits send() — callers that fire-and-forget (see auth.ts's
      // sendResetPassword) intentionally won't see this, which is the accepted tradeoff for
      // avoiding timing-attack leakage on the reset-password endpoint.
      throw new Error(`ResendMailer: ${error.name} — ${error.message}`);
    }
  }
}

let cached: Mailer | undefined;

// Resend only in production, and only once an API key actually exists — otherwise fall back to
// Mailpit so a misconfigured prod env fails loudly (mail silently vanishes into a mailbox nobody
// reads) rather than crashing. `RESEND_API_KEY` is optional in env.js precisely so this check is
// meaningful instead of a hard boot-time requirement.
export function getMailer(): Mailer {
  cached ??=
    env.NODE_ENV === "production" && env.RESEND_API_KEY
      ? new ResendMailer(env.RESEND_API_KEY)
      : new MailpitMailer();
  return cached;
}
