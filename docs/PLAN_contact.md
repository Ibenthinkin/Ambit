# Contact — one address in four places — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Written:** 10-09-26 by Fable 5.1, from a read of every file named here at `main` = `f77fd47`.
**For:** a cold session on a cheaper model, on a plain branch `feat/contact` off `main` (Ben's
convention — no worktree, unless another session holds the checkout, in which case
`git worktree add ~/Dev/ambit-contact -b feat/contact main`).

**Goal:** Ambit has a public contact address, **`ambit.app@proton.me`** (a Proton mailbox Ben
created 10-09-26). Today the app's only "Get in touch" opens a mailto to Ben's personal Gmail,
and three other places already say "tell us" / "ask someone" with no way to. After this plan the
address is one constant, and every surface that invites contact names it:

| Surface | Who it serves | Today | After |
| --- | --- | --- | --- |
| Settings → Other → **Get in touch** | a signed-in reader with feedback | mailto to Ben's Gmail, address hidden | mailto to the address, the address shown as the row's value |
| Settings → **About Ambit** sheet | a blog owner who wants something removed | "tell us and we'll remove it" | "write to _address_ and we'll remove it", as a link |
| `/` → **What is Ambit?** dialog (`?open=about`) | a stranger without an invite | "If someone sent you an invite, sign up with that email address." | …plus "No invite yet? Write to _address_ and say what you're curious about." |
| the **uninvited sign-up** error | a stranger who tried anyway | "Ask someone who's already in for an invite." | "…or write to _address_." |

**Not a page.** Ben's 10-09-26 ruling: no `/contact` or `/about` route. The app has no footer or
nav to hang one from, and `https://ambit.benreilly.io/?open=about` already opens the signed-out
dialog, so that URL _is_ the shareable about/contact link once the dialog carries the address.

**Architecture:** a new no-import leaf `src/config/contact.ts` exports the address and a
`contactMailto(subject)` helper; the four surfaces import it. The server's invite gate
(`src/lib/auth.ts`) imports the same leaf — it has no imports of its own, so it is safe on both
sides of the bundle boundary, like `config/explore.ts`. No schema, no env, no tRPC, no new
dependency, no new route.

**Tech stack:** Next.js 16.2 App Router, React 19, Tailwind v4.3, Vitest 4 (+ jsdom), Playwright
1.62, Bun 1.4.

## Decisions (made with Ben, 10-09-26)

1. **A constant, not an env var.** The address is public and the same on every host; an env var
   would be one more thing to set on Coolify for nothing. `.env.example` is untouched. `OPS_EMAIL`
   (Ben's own, error mail only) and `MAIL_FROM` (the Resend no-reply sender) are unrelated and
   unchanged — never point a reader at either.
2. **mailto, not a form.** A contact form is a server route a stranger can post to (spam, a mail
   send on Ambit's behalf, rate limiting, a reply address to validate). Proton's inbox is the
   inbox. A `mailto` link costs nothing and works signed out.
3. **The address is shown in the clear**, not only behind a link label. A reader on a device
   without a mail client (a desktop with no handler, a kiosk) can still read it and type it. Ben
   accepts the scraping exposure; it is a dedicated mailbox.
4. **Subjects prefill**, so Proton's inbox sorts itself: `Ambit` from Settings, `Removal request`
   from the About sheet, `Invite request` from the about dialog and the sign-up error. One helper
   builds them (`encodeURIComponent` on the subject).
5. **Copy stays where the repo keeps copy**: `EXPLORE_ABOUT` in `config/explore.ts` is "Ben
   edits" territory, so the dialog's new sentence lives there, split in two halves around the
   link — the one place a config string cannot carry a link itself.
6. **The item page's join block is untouched.** Its "Get an invite" goes to `/`, where the dialog
   is one tap away. The same for the sign-in sheet's copy, rewritten this morning.

## Task 0 — branch

- [ ] `git checkout main && git pull && git checkout -b feat/contact` (or the worktree form above).
- [ ] `bun run test src/components/settings src/components/explore src/components/landing` is
      green before you touch anything (it is at `f77fd47`).

## Task 1 — the leaf: `src/config/contact.ts`

- [ ] Create `src/config/contact.ts`:

```ts
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
```

- [ ] Create `src/config/contact.test.ts` pinning three things: the address is exactly
      `ambit.app@proton.me`; `contactMailto()` is `mailto:ambit.app@proton.me?subject=Ambit`;
      `contactMailto("Removal request")` encodes the space (`Removal%20request`). Add one
      guard: the address does not contain `gmail` or `benreilly` (the two addresses it must
      never regress to).
- [ ] `bun run test src/config/contact.test.ts` green.

## Task 2 — Settings → "Get in touch"

File: `src/components/settings/settings-screen.tsx`.

- [ ] Delete the local constant at line 44 (`const CONTACT_EMAIL = "benjamin.reilly@gmail.com";`)
      and import `{ CONTACT_EMAIL, contactMailto }` from `~/config/contact`.
- [ ] The row (around line 204) becomes:

```tsx
<SettingsRow
  label="Get in touch"
  value={CONTACT_EMAIL}
  onClick={() => {
    window.location.href = contactMailto("Ambit");
  }}
/>
```

  `SettingsRow` already takes `value` (see the Notifications row). Check it renders a 19-character
  value without wrapping on the phone width — if `settings-row.tsx` truncates values, the
  address must not be truncated; widen or drop the truncation for this row rather than hide it.

- [ ] `src/components/settings/settings-screen.test.tsx`: the "renders every designed row" list
      still passes (the label is unchanged). Add one test: the row shows the address, and
      tapping it sets `window.location.href` to `contactMailto("Ambit")` — the file already has
      a pattern for the stub rows' taps; follow it. If `window.location.href` assignment is not
      mockable in the file's jsdom setup, assert on the address being visible and leave the
      href to the e2e below.
- [ ] `e2e/settings.spec.ts`: beside the existing About sheet assertions (around line 317), add
      one `expect(page.getByText("ambit.app@proton.me")).toBeVisible()` on the Settings tab.

## Task 3 — the About sheet's removal line

File: `src/components/settings/about-sheet.tsx`, the last `<p>` (lines ~46–50).

- [ ] Replace "Anything credited to a blog links back to the original — tell us and we'll remove
      it." with:

```tsx
<p className="text-ink/34 mt-[14px] text-center text-[11.5px] leading-[1.6]">
  Each item keeps its own attribution and licence, shown on its page.
  Anything credited to a blog links back to the original — write to{" "}
  <a href={contactMailto("Removal request")} className={cn(TEXT_LINK, "text-ink/60")}>
    {CONTACT_EMAIL}
  </a>{" "}
  and we&apos;ll remove it.
</p>
```

  `TEXT_LINK` is exported from `~/components/ui/text-link` (the class string; the `TextLink`
  component is not used here because its `external` mode opens a new tab and appends `↗`, which
  is wrong for a mailto, and its internal mode is Next's `Link`). Match the surrounding tone:
  the paragraph is `text-ink/34`; the link a step brighter so it reads as one.

- [ ] A unit test for the sheet: `src/components/settings/about-sheet.test.tsx` does not exist;
      create it with one test — rendered open, the link named `ambit.app@proton.me` has an
      `href` of `contactMailto("Removal request")`.
- [ ] **Do not** touch the "With material from" list in the same sheet. It is stale (it predates
      LoC, NASA, Smithsonian, the Public Domain Review and the blogs) and that is its own small
      task; note it in the log's Open / next if it is not already there.

## Task 4 — the signed-out "What is Ambit?" dialog

Files: `src/config/explore.ts` (copy), `src/components/explore/explore-screen.tsx` (render).

- [ ] In `config/explore.ts`, extend `EXPLORE_ABOUT` — leave the four `paragraphs` exactly as
      they are (tests pin `paragraphs[0]`) and add:

```ts
  /** The last line, around a mailto link the component draws: `${lead} <address> ${tail}`. */
  contact: {
    lead: "No invite yet? Write to",
    tail: "and say what you’re curious about.",
  },
```

  (Inside the existing `as const` object; keep the comment style of the file.)

- [ ] In `explore-screen.tsx`, after the `paragraphs.map(...)` (line ~257) and before the
      `mt-5 flex gap-2` button row, render one more paragraph in the same classes:

```tsx
<p className="text-ink/70 mt-3 text-[14.5px] leading-[1.6]">
  {EXPLORE_ABOUT.contact.lead}{" "}
  <a href={contactMailto("Invite request")} className={TEXT_LINK}>
    {CONTACT_EMAIL}
  </a>{" "}
  {EXPLORE_ABOUT.contact.tail}
</p>
```

- [ ] `src/components/explore/explore-screen.test.tsx`: in the test that opens the dialog from
      the "what is this?" block (line ~136), add: within the dialog, the link named
      `ambit.app@proton.me` has `href` `contactMailto("Invite request")`.
- [ ] Check `?open=about` on `/` by eye in the dev server: the dialog is a `BottomSheet` with a
      fixed height budget on the phone — five paragraphs plus two buttons must still fit at
      402 × 874 without the buttons leaving the screen. If they don't, the sheet scrolls (it
      should already); confirm rather than assume.

## Task 5 — the uninvited sign-up message

File: `src/lib/auth.ts`, the `APIError` at lines ~81–84.

- [ ] Import `{ CONTACT_EMAIL }` from `~/config/contact` (check the file's existing import style
      — `~/` alias or relative — and match it; this file runs on the server under Bun, and the
      alias resolves there as it does everywhere else in `src/`).
- [ ] The message becomes:

```ts
message: `Ambit is invite-only right now. Ask someone who's already in for an invite, or write to ${CONTACT_EMAIL}.`,
```

  It is rendered as text in the card's `role="alert"` — no link; a reader can select it. Do not
  teach `auth-card.tsx` to linkify error strings.

- [ ] `src/components/landing/auth-card.test.tsx` lines ~146 and ~165 mock and assert the old
      sentence verbatim; update both to the new one (import `CONTACT_EMAIL` and build the string
      rather than paste the address, so the test fails if the address and the message drift).
- [ ] `e2e/auth.spec.ts:94` asserts `toContainText("invite-only")` — unchanged, still passes.
      Run it anyway under `e2e:prod` (Task 7); it is the only test that exercises the server's
      actual string.

## Task 6 — docs

- [ ] SPEC §3.1 (auth / invite-only): one sentence — the public contact address is
      `ambit.app@proton.me`, held in `src/config/contact.ts`, surfaced in the four places above,
      and the uninvited sign-up message names it.
- [ ] SPEC §13's env table: a one-line note under `OPS_EMAIL` that the _reader-facing_ address is
      not an env var (so nobody adds one later).
- [ ] `CLAUDE.md`: no new bullet — the address is in SPEC and in the session memory; CLAUDE.md
      stays about things that span files.

## Task 7 — verify, log, finish

- [ ] `bun run check` green (lint, types, the whole Vitest suite).
- [ ] `bun run e2e:prod` — at least `e2e/settings.spec.ts` and `e2e/auth.spec.ts` green on both
      projects; run the whole suite if time allows.
- [ ] By eye in the dev server (`bun run dev`, then `lsof -ti:3000` first if 3000 is taken): the
      Settings row shows the address; the About sheet's link and the `/?open=about` dialog's link
      open the mail client with the subject prefilled (on the Mac, Mail or whatever handles
      `mailto:`); an uninvited sign-up on `/` shows the new sentence.
- [ ] `log.md`: extend the day's entry (or add one) — shipped, the six decisions in short form,
      the stale source list as Open / next if it is not already listed. Spend line per CLAUDE.md.
- [ ] Commit on `feat/contact`, push the branch, and tell Ben it is ready to merge. **A push of
      `main` deploys**, so merging is his call; nothing in this plan needs a container command
      afterwards (no migration, no backfill, no env).

## Not in this plan

- A `/contact` or `/about` route (ruled out — see "Not a page").
- Linkifying the auth card's error text.
- The About sheet's stale "With material from" list.
- Any mention of the address in outgoing mail (`MAIL_FROM` templates, reset-password mail): worth
  a `Reply-To` one day, not now.
