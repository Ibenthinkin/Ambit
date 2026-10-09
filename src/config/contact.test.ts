import { describe, expect, it } from "vitest";

import { CONTACT_EMAIL, contactMailto } from "./contact";

describe("contact", () => {
  it("is the public Proton mailbox", () => {
    expect(CONTACT_EMAIL).toBe("ambit.app@proton.me");
  });

  // The two addresses it must never regress to: Ben's own, and the deploy's domain (where
  // `MAIL_FROM`, the no-reply sender, lives).
  it("is neither Ben's own address nor the no-reply domain", () => {
    expect(CONTACT_EMAIL).not.toMatch(/gmail|benreilly/);
  });

  it("builds a mailto with the subject prefilled", () => {
    expect(contactMailto()).toBe("mailto:ambit.app@proton.me?subject=Ambit");
    expect(contactMailto("Removal request")).toBe(
      "mailto:ambit.app@proton.me?subject=Removal%20request",
    );
  });
});
