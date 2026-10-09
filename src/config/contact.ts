// Ambit's public contact address (Ben, 10-09-26) — a Proton mailbox, separate from Ben's own
// address and from the two server-side ones (`OPS_EMAIL` is error mail, `MAIL_FROM` the no-reply
// sender). A constant, not an env var: it is public and the same on every host.
//
// A no-import leaf, like `config/explore.ts`, so both the browser (Settings, the about dialog)
// and the server (the invite gate in `lib/auth.ts`) can read it without dragging anything across
// the bundle boundary.

export const CONTACT_EMAIL = "ambit.app@proton.me";

/** Why someone is writing — prefilled as the mail's subject so the inbox sorts itself. */
export type ContactSubject = "Ambit" | "Removal request" | "Invite request";

/** A `mailto:` href with the subject prefilled. */
export function contactMailto(subject: ContactSubject = "Ambit"): string {
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}
