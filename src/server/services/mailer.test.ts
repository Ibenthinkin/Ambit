import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResendMailer } from "./mailer";

// The Resend SDK is the boundary: nothing here should ever reach the network, and what matters is
// exactly what we hand it. The mock records the last payload and lets a test make the call fail.
const sent = vi.hoisted(() => ({
  payload: undefined as Record<string, unknown> | undefined,
  error: null as { name: string; message: string } | null,
}));
vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: (payload: Record<string, unknown>) => {
        sent.payload = payload;
        return Promise.resolve({ error: sent.error });
      },
    };
  },
}));

describe("ResendMailer", () => {
  beforeEach(() => {
    sent.payload = undefined;
    sent.error = null;
  });

  // Phase 8.1: the from-address used to be the literal `Ambit <noreply@ambit.app>` — a domain
  // nobody verified — and because auth.ts fires the reset mail without awaiting it, a rejected
  // send left no trace anywhere. It now comes from MAIL_FROM, and this is the test that says so.
  it("sends from the configured address, not a hardcoded one", async () => {
    const mailer = new ResendMailer(
      "re_test_key",
      "Ambit <noreply@example.test>",
    );

    await mailer.send({
      to: "reader@example.test",
      subject: "Hi",
      text: "Hello",
    });

    expect(sent.payload).toMatchObject({
      from: "Ambit <noreply@example.test>",
      to: "reader@example.test",
      subject: "Hi",
    });
  });

  it("throws when Resend rejects the send, so an awaiting caller can see it", async () => {
    sent.error = {
      name: "validation_error",
      message: "domain is not verified",
    };
    const mailer = new ResendMailer(
      "re_test_key",
      "Ambit <noreply@example.test>",
    );

    await expect(
      mailer.send({ to: "reader@example.test", subject: "Hi", text: "Hello" }),
    ).rejects.toThrow(/validation_error/);
  });
});
