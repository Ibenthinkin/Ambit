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
9. **Navigate with `router.replace("/feed")`, not `push`.** 5.2 used `push` after sign-in, and that
   was right there (`/` → `/feed` leaves a sensible back entry). Here it isn't: pushing leaves
   `/onboarding` in history, and backing into it just bounces forward to `/feed` again (Decision 4's
   redirect) — a dead entry that makes the back button look broken. `replace` retires the screen the
   moment it's done, which is what "first-run setup" means.
10. **There is no re-pick UI in v1, and that's deliberate.** `setUserTopics` already supports
    re-picking (it preserves learned weights on retained topics — Phase 4.2 built and tested that),
    but Decision 4's redirect means an already-onboarded user can never reach this screen again.
    Changing your topics is Phase 9's settings work. Don't build a re-pick affordance here; do note
    the capability exists and is currently unreachable, so it isn't rediscovered as a "bug" later.
11. **`docs/BUILD_PLAN.md`'s 5.3 line gets corrected from "32-chip" to "16-chip"** when the box is
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
- **Tailwind v4 gradient syntax (verified against Tailwind docs, this repo is on v4.3.3).** The
  sticky bar's gradient uses **`bg-linear-to-t`**, not v3's `bg-gradient-to-t`, and stop positions
  are bare percentages — **`from-62%`**, not `from-[62%]`. (`bg-gradient-to-*` survives as a
  deprecated alias — `src/app/~offline/page.tsx` still has one from the t3 boilerplate — but new
  code uses the v4 name.)
- **The gradient's far stop must be `to-bg/0`, not `to-transparent`.** The prototype specifies
  `rgba(22,20,17,0)` — the background color at zero alpha, not the `transparent` keyword. They are
  not interchangeable: `transparent` is transparent *black*, and interpolating toward it can put a
  visible dark/grey haze in the middle of the fade. Same color, zero alpha, is what the prototype
  actually asks for.
- **Rise-in on load applies here, even though the onboarding prototype doesn't implement it.** It's
  in the README's **shared** Motion section (`translateY(8–10px)→0`, opacity 0→1, `.5–.7s ease`,
  staggered ~0.05–0.16s per section) — a global token, not a landing-only flourish, and the README
  states motion timings are final and should be recreated. The prototype files are inconsistent
  about applying it; the spec is the source of truth. See the visual spec for where.
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
src/server/api/routers/routers.integration.test.ts (edit) cover the new helper (DB-backed; self-skips without DATABASE_URL)
src/app/feed/page.tsx                           (edit)    add the inverse redirect guard, comment as carrying into 5.4
e2e/auth.spec.ts                                (edit)    sign-up now lands on /onboarding; complete the picker there to reach /feed
```

`src/proxy.ts` needs **no changes** — its matcher already covers `/onboarding/:path*`.

### A structural note, same shape as 5.2's

**Both `/onboarding` and `/feed` must stay dynamic** — they read `headers()` (the session) already,
so this phase adds no new prerendering risk. Confirm at the end with `bun run build` regardless:
it's cheap, and it's the specific gate 5.2 used to prove no route had quietly opted back into
prerendering a DB call.

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

**Submit:** `api.topics.setMine.useMutation()`, called once via `mutateAsync` with
`{ topicIds: [...selected] }`, only reachable once `selected.size >= minPicks` (guard in the
handler, not just visually via `disabled` — the same "don't trust disabled alone" caution
`AuthCard`'s validation already models). On success, `router.replace("/feed")` (Decision 9). On
error, set the error slot and clear `submitting` so the user can retry.

**Track pending with local `submitting` state, not the mutation's `isPending`.** It mirrors
`AuthCard` exactly (same `aria-busy` + `pointer-events-none opacity-80` treatment), and it keeps the
test's `useMutation` mock down to a single `mutateAsync` field instead of having to model the
mutation-result object's reactive flags.

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
- **Header block** (wrap in `<Rise>`): padding `pt-16 px-6 pb-2` (64/24/8px). Eyebrow "Ambit · Setup" —
  `font-sans text-[11px] font-semibold uppercase tracking-[1.8px] text-accent`. **This is
  intentionally distinct from the generic muted `text-ink/40` "eyebrow" convention `dev/tokens`
  documents elsewhere** — the README states this one is accent-colored, explicitly, and it's a
  single call site, not worth generalizing into a shared primitive yet. Title —
  `font-serif text-[34px] leading-[1.14] tracking-[0.2px] text-ink mt-[14px]`. Subhead —
  `font-serif text-[16.5px] leading-[1.5] text-ink/62 mt-3`.
- **Chip grid** (wrap in `<Rise delayMs={80}>` — the *grid as one unit*, matching landing's 0/80/160
  stagger; **not** a per-chip stagger, which would turn a 16-chip grid into a slow cascade the
  handoff never asks for): `flex flex-wrap gap-[10px]`, padding `22px 24px 180px` — the large bottom
  padding reserves room for the sticky CTA bar so the last row of chips is never hidden behind it.
  Render one `<Chip selected={...} onClick={...}>{label}</Chip>` per topic, in `TOPICS` config order.
- **Sticky CTA bar**: `fixed inset-x-0 bottom-0 z-20`, gradient-fade background
  `bg-linear-to-t from-bg from-62% to-bg/0` (v4 syntax + same-color-zero-alpha far stop — see the
  two docs findings above; `bg-gradient-to-t` and `to-transparent` are both wrong here), padding
  `20px 24px 40px`. `flex items-center gap-[14px]`. Left, flexible: count label,
  `font-sans text-[12.5px] text-ink/55` (the prototype's `0.5` alpha — not a ladder stop, snapped to
  `/55` per 5.2's own precedent for the same value). Right: `<Button shape="pill" size="md">`.
  The bar is **not** wrapped in `<Rise>` — it's fixed chrome, and a rise on a `fixed` element fights
  its own positioning.
- **Error slot** (mutation failure only, prototype has no equivalent): `font-sans text-[12.5px]
  text-error mt-[11px] text-center`, `role="alert"`, rendered above the sticky bar.

### Accessibility

Each chip is a real `<button aria-pressed>` (already how `Chip` is built — nothing to add). CTA gets
`aria-busy` while submitting. Error slot `role="alert"`. No `<form>`, so no label/autoComplete
concerns here. Two additions the prototype has no equivalent for:

- **Wrap the grid in `role="group"` with an `aria-label`** (e.g. "Topics") so sixteen loose toggle
  buttons announce as one labelled set rather than sixteen unrelated controls.
- **Make the count label `aria-live="polite"`.** It is the only feedback that a tap registered and
  the only running indication of progress toward `minPicks`; without a live region a screen-reader
  user gets `aria-pressed` per chip but never hears "2 interests chosen" or how many remain.

---

## Steps

1. **`hasCompletedOnboarding`** — add to `src/server/db/topics.ts` next to `getUserTopicWeights`.
   Two conventions that file already enforces and this must follow: the **dynamic
   `await import("./client")`** every function in it uses (a static import crashes `bun run test` in
   CI, which has no env vars — the file's own comments explain this at length), and a
   `.limit(1)`-shaped existence check rather than fetching every row just to ask "any?".
   Test it in `src/server/api/routers/routers.integration.test.ts` (it's DB-backed and that file
   already self-skips without `DATABASE_URL`, alongside the existing `topics.list`/`setMine`
   round-trip): no rows → `false`; after a `setMine` → `true`.
2. **`OnboardingScreen`** — chip grid, selection state, count/CTA label logic, submit handler,
   mutation call. **Unlike 5.2's `AuthCard` (which could be eyeballed on the already-existing `/`
   before its network wiring landed), this component has nowhere to render until Step 3 creates its
   route** — so build it complete rather than trying to stage a visual check first. The visual gate
   happens after Step 3.
3. **`/onboarding/page.tsx`** — session redirect, `hasCompletedOnboarding` redirect-to-`/feed`,
   render the screen with topics mapped from `TOPICS`. (`redirect()` throws by design as its
   control flow — never wrap it in `try`/`catch`, same note as 5.2.) **Visual check the screen here.**
4. **`/feed/page.tsx`** — add the inverse guard. Comment explicitly that this line survives into
   5.4's rewrite rather than being deleted with the rest of the placeholder.
5. **Component tests** (`// @vitest-environment jsdom`, mocking `~/trpc/react`'s `api` — the first
   test file to do so, same footnote-worthy "first" as 5.2's module-mocking tests).

   **This mock is meaningfully harder than 5.2's `authClient` one** — `authClient.signIn.email` is a
   plain function, whereas `api.topics.setMine.useMutation()` is a *hook returning an object*, so
   the mock has to model that shape. Follow `auth-card.test.tsx`'s `vi.hoisted` pattern (its comment
   explains why hoisting is required) and shape it like:

   ```ts
   const { mutateAsyncMock, replaceMock } = vi.hoisted(() => ({
     mutateAsyncMock: vi.fn(),
     replaceMock: vi.fn(),
   }));

   vi.mock("~/trpc/react", () => ({
     api: {
       topics: {
         setMine: { useMutation: () => ({ mutateAsync: mutateAsyncMock }) },
       },
     },
   }));

   vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: replaceMock }) }));
   ```

   Because the component takes `topics` as a prop, most cases can pass a small fixture array rather
   than the real sixteen — but keep **one** case that renders the actual `TOPICS` config, so a
   future edit to that file (Phase 6 grows the grid toward 32) can't silently break the grid.

   Cover at minimum:
   - renders a chip per topic, in `TOPICS` config order (the one real-config case)
   - toggling a chip updates the count label and the CTA's label/enabled state
   - the count/CTA boundary is exact at `minPicks` (2 selected → "Pick 1 more", disabled; 3 selected
     → "Start exploring", enabled)
   - the CTA below `minPicks` does not call `setMine` even if clicked (defense-in-depth, same
     posture as `AuthCard`'s "validation failure must not fire a network call" tests)
   - toggling a chip **off** decrements the count and can drop the CTA back below the threshold
     (the selection `Set` has to delete, not just add — an easy thing to get half-right)
   - a successful submit calls `setMine` with exactly the selected topic ids (order-independent
     comparison) and calls `router.replace("/feed")`
   - a mutation error renders in the error slot and does **not** navigate
6. **`e2e/auth.spec.ts`** — update the "invited sign-up succeeds" test:
   - after sign-up, assert `page.waitForURL("/onboarding")` (not `/feed`)
   - select three chips, then click "Start exploring". Prefer
     `page.getByRole("button", { name: label, pressed: false })` over `getByText(label)` — `Chip`
     renders `aria-pressed`, so the role+pressed selector both disambiguates from any other text on
     the page and asserts the pre-click state. Use three **stable** labels ("Astronomy", "Botany",
     "Music") rather than positional `.nth()` picks, so a future reorder of `TOPICS` doesn't quietly
     change what this test selects.
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
  wrap and gap, `chip-pop` on tap, rise-in on load, CTA state flip exactly at 3 picks. Then
  cycle all four accents via `data-accent` and confirm the eyebrow, selected chips, and CTA fill all
  recolor with no rebuild.
- **Two specific things to look at rather than assume**, both easy to ship broken:
  - **The sticky bar's gradient fade.** Confirm it actually renders as a gradient (a v3 class name
    would silently produce *no* background at all, leaving chips visibly scrolling under the CTA)
    and that there's no grey/washed band mid-fade (the `to-transparent` failure mode).
  - **The last row of chips clears the sticky bar.** The 180px bottom padding is ported from the
    prototype's 32-chip layout inside a fixed device frame; sixteen chips wrap differently. Scroll
    to the very bottom and check nothing is trapped behind the bar.
- **The real loop, by hand:** sign up a fresh invited user → lands on `/onboarding`, not `/feed` →
  picking fewer than 3 shows "Pick N more" and the CTA does not submit on click → picking 3+ flips
  the CTA to "Start exploring" → submit → lands on `/feed` → confirm `user_topic` rows exist for
  that user in the DB. Then: visit `/onboarding` directly while already onboarded → bounced to
  `/feed`. Separately, get a signed-in-but-not-yet-onboarded user (a second invited signup, stopped
  before submitting) to visit `/feed` directly → bounced to `/onboarding`.
- `bun run e2e` locally, green (updated `auth.spec.ts`).

## Risks

- **A stale client-side Router Cache entry for `/feed` is the subtlest thing that can go wrong, and
  it looks exactly like a bug in the guard.** The user hits `/feed` → gets bounced to `/onboarding`
  → completes it → `router.replace("/feed")` → and if Next serves the *cached* RSC payload from that
  first bounced visit, they land back on `/onboarding` in an apparent loop. Next's defaults should
  prevent this (dynamic routes carry a 0s client stale time, and `/feed` reads `headers()`), so
  **this plan does not preemptively add a workaround** — but verify this exact transition by hand
  first, before believing the guard logic is wrong. If it does reproduce, `router.refresh()` before
  the `replace` is the fix. This is the same *class* of failure as 5.2's "sign-in succeeded but
  never navigated": invisible from reading the code, obvious the moment you walk the real flow.
- **The `hasCompletedOnboarding` redirect pair is the most likely thing to get a ping-pong wrong** —
  double-check `/onboarding`'s "already onboarded → `/feed`" and `/feed`'s "not onboarded →
  `/onboarding`" can't both fire on the same request (they can't, by construction, since they're
  mutually exclusive on the same boolean — but verify by hand per the loop above, not just by
  reading the code).
- **The chip grid's 180px bottom padding is a ported guess**, not a measured value — see the
  Verification bullet. Adjust it to whatever the real sticky bar measures at 402px width rather than
  treating the prototype's number as spec.
- **This phase changes an existing green e2e test rather than only adding new ones.** The sign-up
  spec asserts a flow that this phase deliberately makes false (`/feed` is no longer where a fresh
  signup lands). If it fails after the change, confirm you're looking at the *updated* assertion
  before hunting for a bug in the app — and re-run the whole `describe.serial` block, not just that
  one test, since they share a single user whose onboarded state is now part of the fixture.
