# Phase 5.2 walkthrough — landing / sign-in

> Companion to `PHASE5_PLAN_5.2.md`. Executed 08-12-26 on branch `phase-5.2-landing-signin`,
> picked up straight after Phase 5.1 (design system foundation) landed on `main`. The plan was
> written in a Fable planning session with docs verification already done; this session executed
> it cold, per Ben's plan-then-execute-cheaper workflow, following the plan's own 9 numbered
> steps.

## What shipped

- **`src/app/page.tsx`** — the t3-starter homepage replaced outright. A Server Component: checks
  `auth.api.getSession({ headers: await headers() })` and `redirect("/feed")` for an already
  signed-in visitor; otherwise renders `<LandingShell>` with the hero and `<AuthCard />`. Reading
  `headers()` opts the route out of prerendering (confirmed in the build output below — `ƒ`, not
  `○`). `HydrateClient` is gone with it; `src/trpc/server.ts`'s RSC prefetch plumbing has no
  consumer until 5.3.
- **`src/components/landing/landing-shell.tsx`** — the shared chrome for `/` and
  `/reset-password`: the two drifting blurred accent orbs and the brand mark, both server-rendered
  (no interactivity needed). `/` passes hero + `AuthCard` as children; `/reset-password` skips the
  hero.
- **`src/components/landing/auth-card.tsx`** — the real state machine: `signin` / `signup` /
  `forgot` / `forgot-sent`, wired to `authClient.signIn.email`, `.signUp.email`, and
  `.requestPasswordReset`. Client-side zod email validation + an 8-char password floor block the
  network call before it fires (covered by component tests below). One `error` slot, centered
  under the CTA, exactly per the plan's state-machine table — no per-field error rows.
- **`src/lib/auth.ts`** — added `revokeSessionsOnPasswordReset: true` (Decision 5): a reset after
  a suspected compromise now kills any other live session instead of coexisting with it.
- **`src/app/reset-password/page.tsx` + `reset-password-card.tsx`** — reads `?token=…` /
  `?error=INVALID_TOKEN` (Next 16: `searchParams` is a Promise, awaited). Valid token renders the
  new-password + confirm form; anything else renders an expired-link state linking back to `/`.
  `resetPassword` doesn't sign the user in (confirmed against a real reset below), so success
  shows an inline "Password updated." confirmation with a `Sign in` link, not a faked session.
- **`src/app/feed/page.tsx` + `sign-out-button.tsx`** — the throwaway placeholder (both files
  commented `DELETE IN 5.4`): signed-in email + a sign-out button, server-side `getSession` →
  `redirect("/")` as defense in depth behind `proxy.ts`'s optimistic cookie check.
- **Tests** — `input.test.tsx` (2 cases), `auth-card.test.tsx` (9 cases, the project's first
  component tests that mock a module — `vi.mock("~/lib/auth-client")` + `vi.mock("next/navigation")`
  via `vi.hoisted()`), `reset-password-card.test.tsx` (3 cases). `e2e/auth.spec.ts` (local-only,
  6 serial tests) drives the real loop against a running dev server + Postgres + Mailpit: uninvited
  sign-up refused → `bun run invite` (via `execFileSync`, not a shell string) → sign-up succeeds →
  `/feed` placeholder → sign out → `/feed` bounces unauthenticated → wrong password errors →
  forgot-password → the real Mailpit-scraped reset link → new password works, old one doesn't.
  Split into several `test.describe.serial` tests rather than one long chain, per the plan's own
  risk note about the Mailpit step being the most likely thing to flake.

## Two real bugs found by the plan's own checkpoints

The plan's Step 3/Verification split (build the card, then actually click through it before
wiring the network) and its explicit warning not to trust `$ERROR_CODES` without checking a live
server both caught real defects — worth recording since neither would have shown up from reading
the code alone.

1. **Sign-in/sign-up succeeded but the page never navigated anywhere.** `AuthCard`'s submit
   handler cleared `submitting` and returned on success without calling `router.push`. `/`'s own
   server-side redirect only fires on a fresh page load, so a client-side sign-in left the user
   staring at their own sign-in form with a valid session cookie already set — invisible from
   reading the component, only caught by actually signing in through Chrome DevTools MCP and
   watching nothing happen. Fixed: both success paths now `router.push("/feed")`.
2. **`authClient.$ERROR_CODES` is `{}` at runtime in this app.** The plan flagged this exact risk
   ("do not trust a hardcoded code list — trigger each failure against a running dev server").
   Better Auth's client resolves `$ERROR_CODES` via a lazy `GET /api/auth/error-codes/to-json`
   request that 404s under this app's config, leaving the object empty — confirmed via a temporary
   `console.log` mid-session. `signInError.code === authClient.$ERROR_CODES.INVALID_EMAIL_OR_PASSWORD`
   silently evaluated `false` every time, so the wrong-password case fell through to the raw
   server message instead of the friendly mapped one. Fixed by hardcoding the two verified string
   codes (`INVALID_EMAIL_OR_PASSWORD`, `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`) read directly off
   curl responses against the real dev server, with a comment explaining why the "proper" API
   path doesn't work here.

## A third bug, found in passing: `border-hairline` was being silently dropped app-wide

Not part of the plan's step list — surfaced by Step 1's own `Input` test (`toHaveClass
("border-hairline")` failed) and worth a full callout since it isn't scoped to this phase's new
files.

`cn()` (`src/lib/utils.ts`) runs every className through plain `twMerge`, which doesn't know
about `.border-hairline` (globals.css's custom `border-width: 0.5px` utility, `@layer utilities`).
Unrecognized, `twMerge` fell back to bucketing `border-hairline` as if it were a **border-color**
utility — the same group as `border-ink/NN` — so it silently lost the "last one wins" conflict
resolution to whichever `border-ink/NN` class followed it, which is *every single call site*
(`border-hairline border-ink/12` is the design system's own documented idiom, globals.css's own
comment). Verified with `getComputedStyle`: `Input`/`Button` computed `border-top-width: 1px`,
not the specced `0.5px`, with `border-hairline` entirely absent from the rendered class list.

Root-cause fix, one place: `extendTailwindMerge({ extend: { classGroups: { "border-w":
["border-hairline"] } } })` in `src/lib/utils.ts`, registering it in the correct group so it
conflicts with *other width* utilities (as it should) and stops colliding with border-color.
That alone repairs `card.tsx` and `bottom-sheet.tsx` (which never had a redundant plain `border`
class). Six other primitives (`input.tsx`, `button.tsx`, `chip.tsx`, `icon-button.tsx`,
`segmented.tsx`, `toast.tsx`) additionally had a **redundant literal `border` class** sitting
right next to `border-hairline` — once the classification was fixed, `border-hairline` correctly
started *losing* to that redundant `border` instead (same-group conflict, last one wins, and
`border` came second in every one of those six). Removed the redundant word from all six.

One caveat, checked and set aside: on a 1×-DPR display, `border-width: 0.5px` computes to `1px`
regardless of any of this — confirmed with a bare test `<div>`, nothing to do with `cn()`. That's
a known characteristic of the naive sub-pixel hairline technique (as opposed to a
`transform: scaleY(0.5)` trick), equally true for every other component already on `main`, and
out of scope to redesign here.

## Verification

- `bun run check` — green (207 tests, up from 5.1's 193; the new landing/reset-password/input
  tests plus no regressions elsewhere).
- `bun run build` under CI's exact placeholder env (`DATABASE_URL`/`BETTER_AUTH_SECRET`/
  `BETTER_AUTH_URL` set to the same values `.github/workflows/ci.yml` uses) — clean, and the
  route table confirms the actual gate: `/`, `/feed`, `/reset-password` all show `ƒ` (Dynamic),
  none prerendered.
- `bun run dev` + Chrome DevTools MCP at 402×874 against
  `docs/design_handoff_ambit_pwa/screenshots/01-landing.png`: hero size/leading, orb placement,
  card spacing, and the sign-up/forgot/forgot-sent mode transitions all matched. Cycled all four
  accents via `data-accent` on `<html>` in the live console — orbs, focus border, CTA fill, and
  the sent-stage email color all recolored with no rebuild.
- **The real loop, by hand, through the actual dev server + Mailpit** (not just the e2e spec):
  uninvited sign-up refused with the invite-only copy → invited via `bun run invite` → sign-up
  succeeds and lands on `/feed` → sign out → `/feed` bounces to `/` → wrong password shows the
  mapped error → duplicate-email signup shows the mapped error → forgot password → real Mailpit
  message → followed the emailed link → landed on `/reset-password?token=…` exactly as documented
  → set a new password → old password now rejected (`401 INVALID_EMAIL_OR_PASSWORD`), new one
  signs in. This is the pass that caught both bugs above.
- `bun run e2e` (`e2e/home.spec.ts` + the new `e2e/auth.spec.ts`, 7 tests total) — green, local
  only (same CI gap as 5.1/2.2: no Postgres in the workflow until Phase 7.1).

## Divergences from the plan

- **Steps 3 and 4 were implemented together** rather than as two separate edits. The plan
  separated them so a human could visually check the card before wiring the network; since this
  was an unattended execution session, the equivalent checkpoint happened afterward, in one
  combined Chrome DevTools MCP pass through every mode and both success/error paths (see
  Verification above) — which is what actually caught bug #1.
- **The `border-hairline` fix (above) touches Phase 5.1 files** (`button.tsx`, `chip.tsx`,
  `icon-button.tsx`, `segmented.tsx`, `toast.tsx`, `utils.ts`) that shipped and merged before this
  phase started. Included here rather than deferred because it directly affects this phase's own
  "Done = visual language matches the screenshot" gate — `Input` and `Button` are the two
  primitives the entire auth card is built from.
- **Two lint errors surfaced only at `bun run check` time**: `no-html-link-for-pages` on the two
  raw `<a href="/">` in `reset-password-card.tsx` and `reset-password/page.tsx`. Swapped for
  `next/link`'s `<Link>` — same rendered `<a>`, same accessible name, so `e2e/auth.spec.ts`'s
  `getByRole("link", { name: "Sign in" })` needed no change.

## Findings for later tasks

- **The design handoff has no sign-out affordance on any screen** (Decision 3) — a genuine gap for
  Phase 9's settings work, not an oversight in this phase. `/feed`'s throwaway placeholder is
  where sign-out temporarily lives; it needs a real home before 5.4 deletes this file.
- **`data-testid="auth-error"` was added to both error slots** (`AuthCard`, `ResetPasswordCard`)
  specifically because Next.js's own `#__next-route-announcer__` also carries `role="alert"`,
  making `getByRole("alert")` ambiguous in real-browser e2e tests (not an issue in jsdom component
  tests, which don't render Next's chrome). Worth reusing this pattern rather than `role="alert"`
  alone in any future e2e spec that needs to assert on an inline error.
- **`authClient.$ERROR_CODES` cannot be trusted in this app as currently configured** (see above)
  — any future error-code mapping should read real codes off a running server, not the client's
  advertised constant.

## Next

Plan Phase 5.3 — Onboarding (`docs/BUILD_PLAN.md`): `/onboarding`, the topic-chip grid, built
against the now-real sign-up flow this phase lands users at the front of.
