# Phase 5.2 — Landing / sign-in: detailed execution plan

> Companion to [`BUILD_PLAN.md`](BUILD_PLAN.md) Phase 5 (step 5.2), same format as
> [`PHASE5_PLAN.md`](PHASE5_PLAN.md) (which covers 5.1 only). Written 08-11-26. Check the
> BUILD_PLAN box when the *Done =* line is met.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or
> superpowers:subagent-driven-development) to implement this plan step-by-step.
>
> **Workflow note (Ben's plan-then-execute-cheaper):** written in a planning session with docs
> verification done (findings inlined below); the executing session works cold from this file.
> When live docs contradict this plan, re-verify against docs before trusting either.
>
> **Assumes:** Phases 1–4 complete and Phase 5.1 on `main` (`3d39e9d`) — tokens, the accent knob,
> 11 icons, 11 primitives in `src/components/ui/`, and the jsdom component-test layer all exist.
> Read [`PHASE5_WALKTHROUGH_5.1.md`](PHASE5_WALKTHROUGH_5.1.md) and SPEC §10 before starting; this
> plan assumes that vocabulary (the alpha ladder, `data-accent`, `@theme inline`) without
> re-explaining it.

**Goal:** `/` per handoff §1 — hero, drifting blurred accent orbs, and an auth card wired to the
**real** Better Auth flows Phase 2.2 stood up but never gave a UI: sign-in, invite-gated sign-up,
and the full forgot-password round trip. Plus the `/reset-password` page the reset email actually
lands on, and a throwaway `/feed` placeholder so the loop is walkable end-to-end.

*Done =* visual language matches `docs/design_handoff_ambit_pwa/screenshots/01-landing.png`; real
sign-up, sign-in, and password reset all work through it.

**The core framing:** the handoff's landing prototype still shows the **old magic-link flow**. The
product moved to email + password (SPEC §3.1), and the README carries an explicit divergence note
(§1) saying to keep the visual language and replace the flow. **This is a port of a *look*, not of
a *screen*.** Do not reproduce the prototype's email-only form, its simulated `setTimeout` send, or
its "no password, no algorithm" caption.

---

## Decisions settled during planning

1. **Mode-toggle auth card, not email-first.** Email + password are always visible; a link under
   the CTA swaps the card between `signin` and `signup`. *Rejected:* a two-step "enter email →
   does it have an account? → reveal the right second step" flow, which reads closer to the
   prototype's single-field card but requires an endpoint that tells anyone who asks which emails
   are registered. Invite-gating already narrows that space; don't also hand out an oracle.
2. **A display-name field, on the sign-up mode only.** Better Auth's `signUp.email` requires
   `name`, and `user.name` is `NOT NULL` (`src/server/db/schema.ts:35`). Handoff §6's public item
   page renders "{name} shared this with you", so it's real product data, not a formality — one
   field seen once beats deriving `ben.traverse` from an email and having 5.7 render that.
3. **A throwaway `/feed` placeholder ships here and is deleted in 5.4.** `/feed` (5.4) and
   `/onboarding` (5.3) don't exist yet, so a successful sign-in has nowhere to land. ~20 lines
   showing the signed-in email plus a sign-out button makes the loop walkable now and gives the
   e2e specs a real assertion target.
   - Side effect worth naming: **the design handoff contains no sign-out affordance on any
     screen.** That's a genuine product gap for Phase 9's settings work, not an oversight in this
     phase. The placeholder is where sign-out temporarily lives.
4. **Playwright specs land now, local-only.** SPEC §12 names these exact flows. CI can't run them
   until Phase 7.1 adds Postgres to the workflow — same local-only status as the existing
   `e2e/home.spec.ts`.
5. **`revokeSessionsOnPasswordReset: true`** gets added to `src/lib/auth.ts`. One line; a reset
   after a suspected compromise should kill live sessions. Add a sentence to SPEC §11.
6. **New caption copy.** README §1 explicitly retires "Invite-only · no password, no algorithm".
   Replacement: **"Invite-only · no ads, no algorithm"** — same rhythm, same lock icon, drops the
   claim that is now false.

---

## Docs findings (verified 08-11-26 against Better Auth v1.6.23 — do not re-derive)

- **The client returns `{ data, error }`; it does not throw.**
  `const { data, error } = await authClient.signIn.email({ email, password })`. There is also an
  options object with `onRequest` / `onSuccess` / `onError` callbacks, but the destructured form is
  simpler for a component that already owns `submitting` state.
- **`signUp.email` requires `name`** alongside `email` and `password`. Default minimum password
  length is **8**.
- **`requestPasswordReset({ email, redirectTo })` always reports success**, even for an unknown
  address — deliberate anti-enumeration behavior on Better Auth's side. This is *why* the
  "Check your inbox" stage can be shown unconditionally, with no branch.
- **The emailed link points at Better Auth's own endpoint, not at our page:**
  `{BETTER_AUTH_URL}/api/auth/reset-password/{token}?callbackURL=%2Freset-password`. That GET
  endpoint validates the token, then redirects to **`/reset-password?token=<token>`** on success or
  **`/reset-password?error=INVALID_TOKEN`** on an expired or bad one. Our page must handle both
  query shapes. Token lifetime is **1 hour**.
- **`resetPassword({ newPassword, token })` does not sign the user in.** It sets the password and
  returns. Don't fake a session by chaining `signIn.email` behind it.

---

## Architecture

`/` is a **Server Component** that calls `auth.api.getSession({ headers: await headers() })` and
`redirect("/feed")` when a session exists; otherwise it renders the static chrome (orbs, brand
mark, hero) itself and mounts exactly one client component, `<AuthCard />`. Keeping the hero
server-rendered means the landing page ships almost no JS beyond the form.

```
src/app/page.tsx                                (server)  session redirect + hero — replaces the t3 boilerplate
src/app/reset-password/page.tsx                 (server)  reads ?token / ?error, renders the card
src/app/feed/page.tsx                           (server)  THROWAWAY placeholder — DELETE IN 5.4
src/app/feed/sign-out-button.tsx                (client)  THROWAWAY — colocated so it dies with the page
src/components/landing/landing-shell.tsx        (server)  orbs + brand mark + children (shared by / and /reset-password)
src/components/landing/auth-card.tsx            (client)  the four-mode state machine
src/components/landing/reset-password-card.tsx  (client)  new password + confirm
src/components/landing/auth-card.test.tsx
src/components/landing/reset-password-card.test.tsx
src/components/ui/input.test.tsx                (new — Input gains a placeholder color, see Step 1)
e2e/auth.spec.ts                                (local-only)
```

### Two structural constraints — read before writing any of it

**1. The signed-in redirect must NOT go in `src/proxy.ts`.** The proxy's check is
cookie-shape-only; it cannot hit the database (see the comment at the top of that file). If it
bounced `/` → `/feed` on a *stale but well-formed* cookie, `/feed`'s real `getSession` would fail
and send the user back to `/`, and the two would ping-pong forever. The redirect belongs only where
a real session check happens — i.e. in the page. **`proxy.ts` needs no changes in this phase**: its
matcher already covers `/feed`, and `/reset-password` must stay ungated (someone resetting a
password is by definition signed out).

**2. All three new routes must stay dynamic.** `/` and `/feed` read `headers()`; `/reset-password`
reads `searchParams`. Each of those opts the route out of prerendering, which is what keeps a
`getSession`/DB call from executing at build time — and therefore what keeps `bun run build` green
under CI's placeholder env. This is the specific thing to check at the end (see Verification).

A note on imports: `src/server/api/trpc.ts` uses a *dynamic* `import("~/lib/auth")` because a test
file transitively imports that module and CI's test step sets no env vars. That constraint does
**not** apply to App Router pages — no Vitest file imports `src/app/**` — so a plain static
`import { auth } from "~/lib/auth"` is correct here. If a page-level unit test is ever added, it
will need the dynamic-import treatment.

---

## The auth card state machine

`mode: "signin" | "signup" | "forgot" | "forgot-sent"`, plus `submitting: boolean` and a single
`error: string`. **One error slot**, centered under the CTA, exactly as the prototype has it — no
per-field error rows.

| Mode | Fields | CTA | Below the CTA |
|---|---|---|---|
| `signin` | email, password | "Sign in" | "Forgot your password?" · lock caption · "First time? Create your account" |
| `signup` | name, email, password | "Create account" | lock caption · "Already have an account? Sign in" |
| `forgot` | email | "Send reset link" | "Back to sign in" |
| `forgot-sent` | — | — | the prototype's envelope / "Check your inbox" stage |

**`forgot-sent` is the prototype's magic-link "sent" stage, reused.** It's the best-looking thing
on the screen and the flow change would otherwise have thrown it away. Port it structurally intact:
a 56px circle (`bg-ink/5 border-hairline border-ink/12`), `<Envelope size={26} className="text-accent" />`,
"Check your inbox" in `font-serif text-[23px] text-ink`, a serif body naming the email in
`text-accent`, and a "Use a different email" link back to `forgot`. Only the body copy changes.

Use a real `<form onSubmit>`, **not** the prototype's `onKeyDown` Enter handler — a form buys Enter
submission, browser autofill, and password-manager behavior for free.

> ⚠️ **Gotcha:** the `Button` primitive hardcodes `type="button"`
> (`src/components/ui/button.tsx`), so the CTA must be passed `type="submit"` explicitly or the
> form will never submit.

### Copy — final, do not invent alternatives

| Slot | Text |
|---|---|
| Hero | `A quieter way` / `to be curious.` (explicit `<br />`) |
| Subhead | "No feeds engineered to keep you. Ambit hands you one interesting thing at a time — art, ideas, the odd corner of the world — then quietly steps back." |
| Caption | "Invite-only · no ads, no algorithm" |
| Name placeholder | "What should we call you?" |
| Email placeholder | "you@example.com" |
| Password placeholder | "Password" (signin) / "Password (8+ characters)" (signup) |
| Toggle → signup | "First time? Create your account" |
| Toggle → signin | "Already have an account? Sign in" |
| Forgot link | "Forgot your password?" |
| Back link | "Back to sign in" |
| Sent heading | "Check your inbox" |
| Sent body | "We sent a password reset link to {email}. It expires in an hour." |
| Sent reset link | "Use a different email" |
| Invalid email | "That email doesn't look quite right." *(the prototype's, verbatim)* |
| Short password | "Passwords need at least 8 characters." |
| Missing name | "Tell us what to call you." |

### Client-side validation

Email via `z.string().email()` — zod 3.25 is already a dependency; don't hand-roll the prototype's
regex. Password `length >= 8` (Better Auth's default minimum). Name non-empty after `trim()`.
A validation failure sets `error` and **must not fire a network call** — the component tests
assert exactly this.

### Error mapping

```ts
const { error } = await authClient.signIn.email({ email: email.trim(), password });
if (error) { setError(humanize(error)); return; }
```

Map on `error.code` for the two cases worth rewording — invalid credentials → "That email and
password don't match."; already-registered → "There's already an account with that email — sign in
instead." — and **always fall back to `error.message`**.

The uninvited-signup case deliberately falls through to that fallback: `src/lib/auth.ts`'s
`databaseHooks.user.create.before` already throws a hand-written, human message ("Ambit is
invite-only right now. Ask someone who's already in for an invite."), and re-writing it in the UI
would put the same sentence in two places.

> ⚠️ **Do not trust a hardcoded code list — this is the least-pinned part of the whole phase.**
> Trigger each failure against a running dev server and read the actual `error.code` back before
> writing the map. Check whether `authClient.$ERROR_CODES` exposes them as constants and prefer
> that if it does.

---

## `/reset-password`

`src/app/reset-password/page.tsx` is a Server Component. **In Next 16 `searchParams` is a
Promise** and must be awaited. No session check.

- `?token=…` → render `<ResetPasswordCard token={token} />`.
- `?error=INVALID_TOKEN` (or neither param) → render an expired-link state: "This link has
  expired." plus a link back to `/` to request a new one.

`ResetPasswordCard` is a client component: new password + confirm password, client-validated
(`>= 8`, and the two must match), then `authClient.resetPassword({ newPassword, token })`. On
success it shows an inline confirmation with a "Sign in" button to `/` — per the docs finding
above, the user is **not** signed in by this call.

Both states render inside the same `<LandingShell>` as `/` (orbs + brand mark, no hero), so the
reset page doesn't look like it belongs to a different product.

---

## Visual spec (prototype → 5.1 tokens)

Everything below already exists as a 5.1 token or primitive. Nothing here needs a new one. Where a
value below contradicts `docs/design_handoff_ambit_pwa/README.md`, **the README wins** — it's the
stated source of truth; these are read off the prototype's inline styles.

- **Page**: `bg-bg relative overflow-hidden px-[30px] pb-10`. Use **`min-h-dvh`, not
  `min-h-screen`** — mobile browser chrome makes `100vh` wrong on the 402×874 target.
- **Orbs**: two absolutely-positioned `rounded-full bg-accent` divs, `aria-hidden`.
  - Orb 1: `top-[-60px] right-[-40px] size-[220px] opacity-10 blur-[40px] animate-drift`
  - Orb 2: `bottom-[120px] left-[-70px] size-[200px] opacity-[0.07] blur-[46px] animate-drift`
    **plus an inline `{ animationDuration: "22s", animationDirection: "reverse" }`** — the
    `--animate-drift` token bakes in 18s forward, and this is the one place that differs.
- **Content column**: `relative z-[2] flex min-h-dvh flex-col`.
- **Brand** (`<Rise>`): `pt-24`, `flex items-center gap-2.5`,
  `<Logo size={26} className="text-accent" />`, wordmark
  `font-serif italic font-medium text-[26px] text-ink`.
- **Hero** (`<Rise delayMs={80}>`): `flex-1 flex flex-col justify-center`; headline
  `font-serif text-[42px] leading-[1.08] tracking-[0.2px] text-ink`; subhead
  `font-serif text-[18px] leading-[1.5] text-ink/62 mt-5 max-w-[300px]`.
- **Card** (`<Rise delayMs={160}>`): inputs stacked `space-y-2.5` (the prototype's 10px gap).
- **CTA**: `<Button shape="rounded" size="lg" type="submit" className="w-full">` — resolves to the
  14px radius and 16px/15.5px padding the prototype specifies.
- **Error**: `font-sans text-[12.5px] text-error mt-[11px] text-center`, `role="alert"`.
- **Caption**: `mt-4 flex items-center justify-center gap-[7px]`; `<Lock size={12} />` and the text
  both `text-ink/40`, text at `text-[11.5px] tracking-[0.2px]`.
- **Links** (forgot / toggle / "use a different email"): `font-sans text-[13px] font-medium
  text-ink/55`.

**Alpha-ladder normalization** (SPEC §10 — use ladder stops, not values eyeballed off the
prototype): the links' `0.5` is not a ladder stop → **`/55`**. The sent-stage circle's `0.06` fill
→ **`bg-ink/5`**. The subhead's `0.6` → **`text-ink/62`**. The hero's `#F5F1E7` and the wordmark's
`#EFEBE0` are the same role → both plain **`text-ink`**.

### Two primitive frictions — resolve them, don't paper over them

- **`Input` has no placeholder color.** The prototype specifies `rgba(239,235,224,0.32)`. Add
  `placeholder:text-ink/32` to `src/components/ui/input.tsx` — a real improvement to the primitive
  that 5.3+ inherits, not a local override at the call site.
- **The submitting button must not use `disabled`.** `Button`'s disabled branch swaps an accent
  button onto the *ghost* fill/border ladder — correct for Onboarding's "Pick N more" CTA, wrong
  for a button mid-submit, and it will look like the CTA "turns grey while loading". Use
  `aria-busy` + `pointer-events-none opacity-80` (the prototype's own 0.8) and guard re-entry in
  the handler instead. The in-button spinner also needs
  `<Spinner size={14} className="border-on-accent/35 border-t-on-accent" />` — the default
  `border-ink/20 border-t-accent` is invisible on an accent fill. **Verify tailwind-merge actually
  lets those two classes override the base ones** rather than losing to them.

### Accessibility

`sr-only` `<label htmlFor>` on every input (not a bare `aria-label`); `role="alert"` on the error
slot; `aria-busy` on a submitting CTA; `autoComplete` set to `name` / `email` /
`current-password` / `new-password` as appropriate.

---

## Steps

1. **`Input` placeholder color** — add `placeholder:text-ink/32`; add
   `src/components/ui/input.test.tsx` (2 cases: renders with the shared chrome; forwards arbitrary
   props like `type`/`placeholder`).
2. **`LandingShell` + `/`** — orbs and brand mark as a shared server component; replace the t3
   boilerplate in `src/app/page.tsx` with the session redirect and the hero. `HydrateClient` goes
   away with it — note in the walkthrough that `src/trpc/server.ts`'s RSC prefetch plumbing then
   has no consumer until 5.3. (`redirect()` from `next/navigation` throws a control-flow error by
   design — never wrap it in a `try`/`catch`.)
3. **`AuthCard`** — all four modes, validation, copy, and the visual spec above. No network calls
   yet; this step should be fully checkable at `/` by hand.
4. **Auth wiring** — `signIn.email`, `signUp.email`, `requestPasswordReset`, and the error map;
   plus `revokeSessionsOnPasswordReset: true` in `src/lib/auth.ts`.
5. **`/reset-password`** — the page (both query states) and `ResetPasswordCard`.
6. **`/feed` placeholder** + colocated sign-out button, both clearly commented `DELETE IN 5.4`.
   Server-side `getSession` → `redirect("/")` as defense in depth behind the optimistic proxy.
7. **Component tests** — `// @vitest-environment jsdom` per 5.1's precedent. These are the
   project's **first component tests that mock a module**
   (`vi.mock("~/lib/auth-client", …)`). Cover at minimum:
   - renders `signin` by default; the toggle switches to `signup` and reveals the name field
   - an invalid email blocks the network call; a short password blocks the network call
   - a successful sign-in calls `signIn.email` with a **trimmed** email
   - a mapped error renders in the error slot; the uninvited-signup message surfaces verbatim
   - `signup` passes name + email + password
   - "Forgot your password?" → `forgot`; submitting calls `requestPasswordReset` with
     `redirectTo: "/reset-password"`
   - the `forgot-sent` stage names the submitted email; "Use a different email" returns to `forgot`
   - `ResetPasswordCard`: mismatched confirm blocks the call; short password blocks the call;
     success calls `resetPassword` with the token and renders the confirmation
8. **`e2e/auth.spec.ts`** (local-only) — uninvited sign-up refused → `bun run invite` → sign-up
   succeeds → placeholder → sign out → `/feed` bounces to `/` → sign in → wrong password errors →
   full reset round trip through Mailpit. Use a unique `ambit-e2e-${Date.now()}@example.com` per
   run and shell out to the real `bun run invite` admin path via `execSync`. Read the reset link
   from Mailpit's HTTP API at `http://localhost:8025` — `docs/PHASE2_WALKTHROUGH_2.2.md` already
   documents that call. Note in the spec's header comment that it leaves real users in the dev DB
   by design.
9. **Docs** — write `docs/PHASE5_WALKTHROUGH_5.2.md`; tick the BUILD_PLAN 5.2 box with its
   retrospective paragraph; update SPEC §8.1 (drop the "prototype still shows magic-link" caveat
   now that it's built, add `/reset-password` to the route list), §3.1 / §11 (session revocation on
   reset), and §12 if the e2e list shifts; append a `log.md` entry.

> **Log-and-merge hazard, twice-burned** (see `log.md` 08-10-26): the executing session writes its
> own `log.md` entry, and whoever lands the PR checks for an unwritten entry *before* merging. A
> log commit pushed after a squash-merge lands on a deleted branch.

---

## Verification

- `bun run check` (typecheck + lint + format + full test suite) and `bun run build` under CI's
  placeholder env. **The build is the specific gate for "no route accidentally prerenders a DB
  call"** — if `/`, `/feed`, or `/reset-password` show up as static in the build output, something
  opted back into prerendering.
- `bun run dev` + Chrome DevTools MCP at **402×874**, against
  `docs/design_handoff_ambit_pwa/screenshots/01-landing.png`: hero size and leading, orb placement
  and drift, card spacing, and the rise-in stagger (0 / 80 / 160 ms). Then cycle all four accents
  by setting `data-accent` on `<html>` and confirm the orbs, the input focus border, the CTA fill,
  and the sent-stage email all recolor with no rebuild.
- **The real loop, by hand, with Mailpit at `http://localhost:8025`:** uninvited sign-up refused
  with our invite copy → `bun run invite you@example.com` → sign-up succeeds and lands on the
  placeholder → sign out → `/feed` bounces to `/` → sign in → wrong password errors → forgot
  password → click the Mailpit link → set a new password → the old password is rejected, the new
  one works, and (per Decision 5) any other live session is gone.
- `bun run e2e` locally, green.

## Risks

- **The error-code map is the most likely thing to be wrong** — it's the one part of the auth
  wiring not pinned by verified docs. Read the real codes off a running server during Step 4.
- **The `Button` disabled-vs-submitting collision** is the most likely visual bug, and it's subtle
  enough to ship unnoticed: it presents as the CTA turning grey mid-submit.
- The Mailpit-scraping e2e step is the most likely flaky test. If it fights back, assert the
  reset-request and reset-completion halves separately rather than retrying the whole chain.
