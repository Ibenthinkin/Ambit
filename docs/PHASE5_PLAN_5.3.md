# Phase 5.3 — Onboarding: detailed execution plan

> Companion to [`BUILD_PLAN.md`](BUILD_PLAN.md) Phase 5 (step 5.3), same format as
> [`PHASE5_PLAN_5.2.md`](PHASE5_PLAN_5.2.md). Written 08-12-26. Check the BUILD_PLAN box when the
> *Done =* line is met.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or
> superpowers:subagent-driven-development) to implement this plan step-by-step.
>
> **Workflow note (Ben's plan-then-execute-cheaper):** written in a planning session with docs
> verification done (findings inlined below); the executing session works cold from this file.
> When live docs contradict this plan, re-verify against docs before trusting either.
>
> **Assumes:** Phases 1–4 and Phase 5.1–5.2 complete and merged to `main` (`b2de133`) — tokens, the
> accent knob, 11 icons, 11 primitives in `src/components/ui/` (including `Chip` and `Button`'s
> disabled→ghost-ladder behavior, both built in 5.1 anticipating this screen), the real `/` and
> `/reset-password` auth flow, and a throwaway `/feed` placeholder. Read
> [`PHASE5_WALKTHROUGH_5.2.md`](PHASE5_WALKTHROUGH_5.2.md) before starting; this plan assumes that
> vocabulary (the alpha ladder, the `aria-busy`-not-`disabled` submitting pattern) without
> re-explaining it.

**Goal:** `/onboarding` per handoff §2 — the topic-chip grid a newly-signed-up user lands on before
ever seeing a feed. Sixteen chips (not the handoff's 32 — a documented v1 divergence, see below),
a sticky bottom CTA that reads "Pick N more" until `minPicks` (3) are selected then flips to "Start
exploring", persisted via the already-built `topics.setMine` mutation, plus the redirect-until-
onboarded logic that sends a fresh signup here and bounces a not-yet-onboarded user away from
`/feed`.

*Done =* visual language matches `docs/design_handoff_ambit_pwa/screenshots/02-onboarding.png`; a
freshly invited sign-up lands here (not `/feed`), picking chips and submitting actually persists to
`user_topic`, and arrives at a feed seeded from them.

**The core framing:** unlike 5.2 (which replaced the prototype's whole auth *flow*, keeping only the
look), 5.3 is much closer to a straight port — the interaction model (tap chips, sticky CTA gates on
a minimum count) carries over unchanged. The two real differences from the prototype: **sixteen
chips, not thirty-two** (the v1 topic-drift graph only covers sixteen topics — see
`src/server/config/topics.ts`'s header comment, and the README's own divergence note on §2), and
**persistence is a real mutation** (`topics.setMine`, already built in Phase 4.2) instead of
`localStorage`.

---

## Decisions settled during planning

1. **Chip data comes from `src/server/config/topics.ts`'s `TOPICS` array, not a `topics.list`
   network round-trip.** That config *is* the seed source for the DB `topic` table — a contract
   test (`src/server/config/topics.test.ts`) already enforces they can't drift apart — and its own
   header comment says exactly this: *"This is not the onboarding chip order — that's Phase 5.3's
   call, and it reads from this array rather than from the DB."* A static 16-item import also means
   the grid renders instantly with zero network dependency, which matters more here than almost
   anywhere else in the app (first screen after signup, possibly on a slow connection).
   *Rejected:* `api.topics.list.prefetch()` + `HydrateClient` — the RSC-prefetch plumbing
   `src/trpc/server.ts` sets up and that a prior planning note speculated 5.3 would be its first
   consumer. That speculation doesn't hold up against the config file's own explicit instruction;
   leave that plumbing for 5.4's Feed, which actually needs `useInfiniteQuery` reactivity.
2. **Persist once, on submit — not per-toggle.** The prototype writes to `localStorage` on every tap
   only because it has nothing else to persist to. The real screen holds selection in local
   component state and calls `topics.setMine` exactly once, when "Start exploring" is pressed. This
   is the app's **first client-side consumer of the tRPC React client**
   (`api.topics.setMine.useMutation()` from `~/trpc/react`) — every client component built so far
   (`AuthCard`, `ResetPasswordCard`, `SignOutButton`) has talked to Better Auth's client directly,
   never tRPC. Worth flagging in component tests the same way 5.2 flagged its own first (mocking a
   module) — this is the first test file mocking `~/trpc/react`.
3. **New repo helper: `hasCompletedOnboarding(userId): Promise<boolean>`** in
   `src/server/db/topics.ts`, next to the existing `getUserTopicWeights`. A cheap existence check
   (`EXISTS`-shaped, not a full row fetch), used by **both** `/onboarding` (skip the picker,
   redirect to `/feed`, if already onboarded) and `/feed`'s placeholder (bounce to `/onboarding` if
   not). Centralizing it avoids two pages independently deciding what "onboarded" means.
4. **`/onboarding` is a Server Component**, same shape as `/` and the `/feed` placeholder: resolve
   the session (`redirect("/")` if none — defense in depth behind `proxy.ts`, whose matcher already
   covers `/onboarding/:path*`), check `hasCompletedOnboarding` and `redirect("/feed")` if already
   true, otherwise render the client `<OnboardingScreen topics={TOPICS} minPicks={3} />`.
   **No `<LandingShell>` reuse** — onboarding has its own chrome (no drifting orbs, no brand mark;
   an eyebrow + serif header block instead), so it gets a small dedicated server wrapper, not a
   shared one.
5. **The `/feed` placeholder gains the inverse guard.** After its existing session check, add:
   `if (!(await hasCompletedOnboarding(session.user.id))) redirect("/onboarding")`. This is not
   wasted throwaway work — Phase 5.4's real feed page needs the exact same guard; this is where it's
   first proven out, and it carries forward (relocated, not rewritten) when 5.4 replaces the
   placeholder.
6. **No `<form>` wrapper on the CTA.** Unlike `AuthCard` (real text inputs, benefits from
   Enter-to-submit and autofill), the chip grid has no inputs to submit — a plain `onClick` on the
   `Button` is simpler and a `<form>` buys nothing here.
7. **Submitting state reuses 5.2's `aria-busy` + `pointer-events-none opacity-80` pattern, not
   `disabled`.** Same reason 5.2 documented: `Button`'s `disabled` branch swaps to the ghost ladder
   — correct for the *inactive* "Pick N more" state (count below `minPicks`), wrong once the CTA is
   accent-filled and mid-mutation (it would visually "turn off" instead of showing it's working).
8. **Mutation error gets an inline slot**, `role="alert"`, same shape as `AuthCard`'s error slot.
   The prototype has no failure path (a static `localStorage` write can't fail); the real mutation
   can, and silently doing nothing on failure would strand the user on a working CTA that never
   navigates.
9. **`docs/BUILD_PLAN.md`'s 5.3 line gets corrected from "32-chip" to "16-chip"** when the box is
   ticked — it predates the v1 topic-graph divergence and was never updated.

---

## Docs findings (verified 08-12-26 — do not re-derive)

- **The backend is already fully built and tested.** `topics.list` / `topics.setMine`
  (`src/server/api/routers/topics.ts`) and their repo functions
  (`listTopics`/`setUserTopics`/`getUserTopicWeights` in `src/server/db/topics.ts`) landed in Phase
  4.2. `setUserTopics` already handles re-pick correctly — a topic kept across a re-selection
  retains its learned `weight` rather than resetting to 1.0 (covered by
  `routers.integration.test.ts`'s "set, re-set with overlap" case). Nothing here needs touching
  except the one new `hasCompletedOnboarding` helper.
- **`Chip` and `Button` were built in 5.1 anticipating this exact screen.** `Chip`
  (`src/components/ui/chip.tsx`) already implements the selected/unselected fill+border+text swap
  and plays `animate-chip-pop` on select — its own header comment cites this prototype file by line
  range. `Button`'s disabled state already resolves to the ghost ladder stops the "Pick N more" CTA
  needs, and its own comment literally says "(Onboarding's 'Pick N more' CTA)". No new primitive
  work required.
- **`hasCompletedOnboarding` is genuinely new** — nothing in the codebase currently answers "has
  this user picked any topics" as a boolean. `getUserTopicWeights` returns the full weight map and
  could be reused (`.size > 0`), but a dedicated existence-check function is cheaper (no need to
  pull every row) and gives both call sites the same clearly-named question to ask.
- **Sixteen topics, in this exact order** (from `src/server/config/topics.ts`'s `TOPICS` array —
  alphabetical by id, which is also the intended chip-grid order per Decision 1): Ancient history,
  Architecture, Astronomy, Botany, Maps, Ceramics, Geology, Machines, Music, Mythology, Poetry,
  Portraiture, Textiles, The ocean, Typography, Zoology. ("Maps" is the chip label for the
  `cartography` id — the slug stays a graph key, only the label differs, per that file's own
  comment.)

---

## Architecture

```
src/app/onboarding/page.tsx                     (server)  session check, onboarded check + redirect, renders screen
src/components/onboarding/onboarding-screen.tsx (client)  chip grid + sticky CTA + submit mutation
src/components/onboarding/onboarding-screen.test.tsx
src/server/db/topics.ts                         (edit)    add hasCompletedOnboarding()
src/server/db/topics.test.ts or routers.integration.test.ts (edit) — cover the new helper
src/app/feed/page.tsx                           (edit)    add the inverse redirect guard, comment as carrying into 5.4
e2e/auth.spec.ts                                (edit)    sign-up now lands on /onboarding; complete the picker there to reach /feed
```

`src/proxy.ts` needs **no changes** — its matcher already covers `/onboarding/:path*`.

### A structural note, same shape as 5.2's

**Both `/onboarding` and `/feed` must stay dynamic** — they read `headers()` (the session) already,
so this phase adds no new prerendering risk. Confirm at the end with `bun run build` regardless
(cheap, and it's exactly what caught the equivalent issue never actually going wrong in 5.2).

---

## The onboarding screen

`OnboardingScreen` is a client component taking `topics: { id: string; label: string }[]` (the
`TOPICS` config array, mapped down to just what the grid needs) and `minPicks: number` (3). State:
a `Set<string>` of selected topic ids (starts empty — a user who reaches this screen at all has, by
construction via Decision 4's redirect, no existing selection to prefill), plus `submitting: boolean`
and `error: string`.

**Interaction, unchanged from the prototype:** tap a chip to toggle it; the count label and CTA
label/enabled-state derive from `selected.size` vs `minPicks` on every render — no separate
"canStart" state variable needed, just a comparison.

**Submit:** `api.topics.setMine.useMutation()`, called once, with `{ topicIds: [...selected] }`, only
reachable once `selected.size >= minPicks` (guard in the handler, not just visually via `disabled`
— the same "don't trust disabled alone" caution `AuthCard`'s validation already models). On success,
`router.push("/feed")`. On error, set the error slot and leave `submitting` false so the user can
retry.

### Copy — final, do not invent alternatives

| Slot | Text |
|---|---|
| Eyebrow | "Ambit · Setup" |
| Title | "What pulls your attention?" |
| Subhead | "Choose as many as you like. Ambit starts here — then wanders sideways into things you'd never think to search for." |
| Count, zero | "Nothing picked yet" |
| Count, N picked | "{N} interest chosen" (singular) / "{N} interests chosen" (plural) |
| CTA, below minPicks | "Pick {minPicks − N} more" |
| CTA, at/above minPicks | "Start exploring" |
| Mutation error | "Something went wrong saving your picks — try again." |

### Visual spec (prototype → 5.1 tokens)

Everything below already exists as a 5.1 token or primitive except the one-off eyebrow style. Where
a value below contradicts `docs/design_handoff_ambit_pwa/README.md`, the README wins (same rule 5.2
used) — these are read off the prototype's inline styles and normalized to the ladder.

- **Page**: `bg-bg` (the same "every screen except gallery" token landing uses), `min-h-dvh`. Plain
  scrollable column — no orbs, no brand mark, no `<LandingShell>`.
- **Header block**: padding `pt-16 px-6 pb-2` (64/24/8px). Eyebrow "Ambit · Setup" —
  `font-sans text-[11px] font-semibold uppercase tracking-[1.8px] text-accent`. **This is
  intentionally distinct from the generic muted `text-ink/40` "eyebrow" convention `dev/tokens`
  documents elsewhere** — the README states this one is accent-colored, explicitly, and it's a
  single call site, not worth generalizing into a shared primitive yet. Title —
  `font-serif text-[34px] leading-[1.14] tracking-[0.2px] text-ink mt-[14px]`. Subhead —
  `font-serif text-[16.5px] leading-[1.5] text-ink/62 mt-3`.
- **Chip grid**: `flex flex-wrap gap-[10px]`, padding `22px 24px 180px` — the large bottom padding
  reserves room for the sticky CTA bar so the last row of chips is never hidden behind it. Render
  one `<Chip selected={...} onClick={...}>{label}</Chip>` per topic, in `TOPICS` config order.
- **Sticky CTA bar**: `fixed inset-x-0 bottom-0 z-20`, gradient-fade background
  `bg-gradient-to-t from-bg from-[62%] to-transparent`, padding `20px 24px 40px`.
  `flex items-center gap-[14px]`. Left, flexible: count label,
  `font-sans text-[12.5px] text-ink/55` (the prototype's `0.5` alpha — not a ladder stop, snapped to
  `/55` per 5.2's own precedent for the same value). Right: `<Button shape="pill" size="md">`.
- **Error slot** (mutation failure only, prototype has no equivalent): `font-sans text-[12.5px]
  text-error mt-[11px] text-center`, `role="alert"`, rendered above the sticky bar.

### Accessibility

Each chip is a real `<button aria-pressed>` (already how `Chip` is built — nothing to add). CTA gets
`aria-busy` while submitting. Error slot `role="alert"`. No `<form>`, so no label/autoComplete
concerns here.

---

## Steps

1. **`hasCompletedOnboarding`** — add to `src/server/db/topics.ts` next to `getUserTopicWeights`,
   with a test covering both states (no rows → `false`; one row → `true`) alongside the existing
   `topics.list`/`setMine` integration test.
2. **`OnboardingScreen`** — chip grid, selection state, count/CTA label logic, submit handler. Fully
   checkable by hand at a temporary route or via Storybook-less manual mount before wiring the real
   page around it (mirrors 5.2 Step 3's "no network calls yet, fully checkable" staging).
3. **`/onboarding/page.tsx`** — session redirect, `hasCompletedOnboarding` redirect-to-`/feed`,
   render the screen with topics mapped from `TOPICS`.
4. **`/feed/page.tsx`** — add the inverse guard. Comment explicitly that this line survives into
   5.4's rewrite rather than being deleted with the rest of the placeholder.
5. **Component tests** (`// @vitest-environment jsdom`, mocking `~/trpc/react`'s `api` — the first
   test file to do so, same footnote-worthy "first" as 5.2's module-mocking tests). Cover at
   minimum:
   - renders all sixteen chips, in `TOPICS` config order
   - toggling a chip updates the count label and the CTA's label/enabled state
   - the count/CTA boundary is exact at `minPicks` (2 selected → "Pick 1 more", disabled; 3 selected
     → "Start exploring", enabled)
   - the CTA below `minPicks` does not call `setMine` even if clicked (defense-in-depth, same
     posture as `AuthCard`'s "validation failure must not fire a network call" tests)
   - a successful submit calls `setMine` with exactly the selected topic ids (order-independent
     comparison) and navigates to `/feed`
   - a mutation error renders in the error slot and does **not** navigate
6. **`e2e/auth.spec.ts`** — update the "invited sign-up succeeds" test:
   - after sign-up, assert `page.waitForURL("/onboarding")` (not `/feed`)
   - select `minPicks` (3) chips by label, click "Start exploring"
   - *then* assert `page.waitForURL("/feed")` and the existing "Signed in as {EMAIL}" text
   No other test in the `describe.serial` block needs to change: the sign-out test and the
   password-reset round-trip test both sign in *after* this user is already onboarded, so `/feed`
   stays directly reachable for them — the new guard only fires for a user with zero `user_topic`
   rows.
7. **Docs** — write `docs/PHASE5_WALKTHROUGH_5.3.md`; tick the BUILD_PLAN 5.3 box (fixing "32-chip"
   → "16-chip" in the same edit) with its retrospective paragraph; update `SPEC.md` §8.2 (the
   component is `OnboardingScreen.tsx`, not the `TopicChips.tsx` name that section currently
   guesses — update to match, or keep both names if the component gets split further) and §8.1 if
   the redirect-until-onboarded behavior needs its own sentence there; append a `log.md` entry.

> **Log-and-merge hazard, verbatim from 5.2's plan** (see `log.md` 08-10-26 and 08-12-26): the
> executing session writes its own `log.md` entry, and whoever lands the PR checks for an unwritten
> entry *before* merging — a log commit pushed after a squash-merge lands on a deleted branch.

---

## Verification

- `bun run check` (typecheck + lint + format + full test suite) and `bun run build` under CI's
  placeholder env — confirms `/onboarding` doesn't accidentally prerender (it reads the session,
  same reasoning as 5.2's three routes).
- `bun run dev` + Chrome DevTools MCP at **402×874**, against
  `docs/design_handoff_ambit_pwa/screenshots/02-onboarding.png`: header sizing/leading, chip grid
  wrap and gap, `chip-pop` on tap, sticky bar gradient fade, CTA state flip exactly at 3 picks. Then
  cycle all four accents via `data-accent` and confirm the eyebrow, selected chips, and CTA fill all
  recolor with no rebuild.
- **The real loop, by hand:** sign up a fresh invited user → lands on `/onboarding`, not `/feed` →
  picking fewer than 3 shows "Pick N more" and the CTA does not submit on click → picking 3+ flips
  the CTA to "Start exploring" → submit → lands on `/feed` → confirm `user_topic` rows exist for
  that user in the DB. Then: visit `/onboarding` directly while already onboarded → bounced to
  `/feed`. Separately, get a signed-in-but-not-yet-onboarded user (a second invited signup, stopped
  before submitting) to visit `/feed` directly → bounced to `/onboarding`.
- `bun run e2e` locally, green (updated `auth.spec.ts`).

## Risks

- **The `hasCompletedOnboarding` redirect pair is the most likely thing to get a ping-pong wrong** —
  double-check `/onboarding`'s "already onboarded → `/feed`" and `/feed`'s "not onboarded →
  `/onboarding`" can't both fire on the same request (they can't, by construction, since they're
  mutually exclusive on the same boolean — but verify by hand per the loop above, not just by
  reading the code).
- **The chip grid's bottom padding (180px) is a guess ported from the prototype's fixed device
  frame** — verify against the real sticky bar's actual rendered height at 402px width; adjust if
  the last row of chips sits behind the bar on real content (16 chips may wrap differently than the
  prototype's 32).
- **The e2e chip-selection step is new interaction surface** — if `getByText(label).click()` on a
  `Chip` (a styled `<button>`, not a native checkbox) is flaky, prefer `getByRole("button", { name: label, pressed: false })` to disambiguate against the prototype's `aria-pressed` state.
