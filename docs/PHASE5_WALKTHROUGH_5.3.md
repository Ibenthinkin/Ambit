# Phase 5.3 walkthrough — onboarding

> Companion to `PHASE5_PLAN_5.3.md`. Executed 08-12-26 on branch `phase-5.3-onboarding`, picked up
> straight after Phase 5.2 (landing / sign-in) landed on `main`. The plan was written in a Fable
> planning session with docs verification already done; this session executed it cold, per Ben's
> plan-then-execute-cheaper workflow, following the plan's own 7 numbered steps.

## What shipped

- **`src/server/db/topics.ts`** — new `hasCompletedOnboarding(userId): Promise<boolean>`, next to
  the existing `getUserTopicWeights`. A `.limit(1)`-shaped existence check (not a full row fetch),
  following the file's own dynamic-`import("./client")` convention. Backs both directions of the
  redirect guard from one place, so the two routes below can't independently drift on what
  "onboarded" means.
- **`src/components/onboarding/onboarding-screen.tsx`** — the chip grid + sticky CTA, a client
  component taking `topics: {id,label}[]` and `minPicks: number`. Selection lives in a
  `Set<string>`; count label and CTA label/enabled-state derive from `selected.size` vs `minPicks`
  on every render. Submits once, on "Start exploring", via
  `api.topics.setMine.useMutation().mutateAsync({ topicIds: [...selected] })` — **the app's first
  client-side consumer of the tRPC React client** (every earlier client component talked to Better
  Auth's client directly). Success navigates with `router.replace("/feed")` (not `push` — pushing
  would leave `/onboarding` in history, and backing into it just bounces forward to `/feed` again
  via the guard below). Failure renders an inline `role="alert"` error slot and clears `submitting`
  so the user can retry. `submitting` is local state (not the mutation's `isPending`), mirroring
  `AuthCard`'s `aria-busy` + `pointer-events-none opacity-80` pattern exactly. Chip grid wrapped in
  `role="group" aria-label="Topics"`; the count label is `aria-live="polite"`.
- **`src/app/onboarding/page.tsx`** — a Server Component: session check (`redirect("/")` if none),
  `hasCompletedOnboarding` check (`redirect("/feed")` if already true), otherwise renders
  `OnboardingScreen` with `TOPICS` (`src/server/config/topics.ts`) mapped to `{id,label}`. No
  `<LandingShell>` reuse — its own eyebrow + serif header block instead, no orbs, no brand mark.
- **`src/app/feed/page.tsx`** — gained the inverse guard: after the existing session check,
  `if (!(await hasCompletedOnboarding(session.user.id))) redirect("/onboarding")`. Commented as
  surviving into 5.4's real feed page rather than being deleted with the rest of the placeholder.
- **Tests** — `onboarding-screen.test.tsx` (8 cases, jsdom, mocking `~/trpc/react` via
  `vi.hoisted` — this project's first test mocking a *hook returning an object*
  (`useMutation() → { mutateAsync }`) rather than a plain function): config-order rendering against
  the real `TOPICS` array, count/CTA label + enabled-state at every boundary, toggle-off
  decrementing the count, the disabled CTA refusing to fire `setMine` even when clicked directly, a
  successful submit's exact topic-id payload + navigation, and a mutation error's inline render
  without navigating. `routers.integration.test.ts` gained two `hasCompletedOnboarding` cases
  (false before any pick, true after `setMine`) inside the existing DB-backed, self-skipping
  `topics` describe block. `e2e/auth.spec.ts`'s sign-up test now asserts `/onboarding` (not
  `/feed`) after sign-up, picks three stable-labeled chips (Astronomy, Botany, Music — not
  positional `.nth()`), and *then* asserts `/feed`.

## No bugs found this time — the plan's own verification caught nothing new

Unlike 5.2 (which found two real bugs — a missing post-sign-in redirect, and Better Auth's
`$ERROR_CODES` resolving to `{}`), this phase's Chrome DevTools MCP walkthrough matched the plan on
every checkpoint: the CTA flipped exactly at 3 picks, the sticky bar's `bg-linear-to-t` gradient
rendered correctly (confirmed via `getComputedStyle` — `linear-gradient(to top, rgb(22,20,17) 62%,
... 0%)`, no washed grey band), all four accents recolored the eyebrow/chips/CTA live via
`data-accent`, and both redirect directions worked cleanly with no ping-pong (`/onboarding` while
already onboarded → `/feed`; `/feed` while not yet onboarded → `/onboarding`). The
`router.replace("/feed")` → guard interaction the plan's Risks section specifically flagged as the
likeliest subtle failure (a stale client Router Cache entry bouncing back to `/onboarding`) did not
reproduce — the real submit-to-feed transition landed cleanly both through the manual walkthrough
and the e2e run.

One thing worth recording precisely because it *didn't* look like a bug: cycling all four accents
via a single synchronous script (four `setAttribute` calls with no yield between them) initially
appeared to leave chip/CTA fill colors stuck on the first value, while the eyebrow's `text-accent`
recolored correctly in the same script. Re-running the check with a moment between reads (and
scoping the selector to `main` rather than the whole document) showed all three recoloring
correctly — the earlier result was an artifact of reading `getComputedStyle` mid-CSS-transition
across four back-to-back synchronous attribute writes, not a real app bug. Noted here so a future
session doesn't waste time re-diagnosing the same non-issue.

## Divergences from the plan

- **The error slot got a `data-testid="onboarding-error"`**, which the plan's visual spec didn't
  call for. 5.2's own walkthrough flagged this exact pattern as worth reusing ("Next.js's own
  `#__next-route-announcer__` also carries `role="alert"`, making `getByRole("alert")` ambiguous in
  real-browser e2e tests") — added preemptively so a future e2e case that needs to assert on this
  error doesn't hit the same ambiguity `AuthCard`'s error slot was given `data-testid="auth-error"`
  for. No current test depends on it; the component test still asserts via `getByRole("alert")`,
  which is unambiguous in jsdom (Next's chrome doesn't render there).
- **Steps 1–4 were executed and individually verified in sequence** (helper → screen → route →
  guard, each checked before moving on) rather than batched into one end-of-phase pass — the plan
  left this open ("build it complete rather than trying to stage a visual check first" for the
  component itself, since it has nowhere to render until the route exists), and the two-checkpoint
  split (screen shape confirmed by its own test suite, then wired into the route for the real
  visual gate) worked cleanly with no rework needed at the seam.

## Verification

- `bun run check` — green. 217 tests, up from 5.2's 207 (10 new: 8 `onboarding-screen.test.tsx`,
  2 `hasCompletedOnboarding` cases in `routers.integration.test.ts`).
- `bun run build` under CI's exact placeholder env (`DATABASE_URL`/`BETTER_AUTH_SECRET`/
  `BETTER_AUTH_URL` set to the same values `.github/workflows/ci.yml` uses) — clean; the route
  table confirms `/onboarding` and `/feed` both show `ƒ` (Dynamic), neither prerendered.
- `bun run dev` + Chrome DevTools MCP at 402×874 against
  `docs/design_handoff_ambit_pwa/screenshots/02-onboarding.png`: header sizing/leading, chip grid
  wrap and gap, `chip-pop` on tap, rise-in on load (both `<Rise>` blocks present, staggered
  0/80ms), and the CTA state flip exactly at 3 picks all matched. Confirmed via `getComputedStyle`
  that the sticky bar's gradient actually renders (not silently blank) and that all four accents
  (`data-accent="gold"|"sage"|"slate"|"terracotta"`) recolor the eyebrow, selected chips, and CTA
  fill live, no rebuild.
- **The real loop, by hand, through the actual dev server + Postgres**: signed up a fresh invited
  user → landed on `/onboarding`, not `/feed` → picking fewer than 3 showed "Pick N more" with the
  CTA disabled → picking a 3rd flipped it to "Start exploring" → submit → landed on `/feed` →
  confirmed the exact three `user_topic` rows (`astronomy`, `botany`, `music`, weight 1) exist for
  that user in the DB. Then: visited `/onboarding` directly while already onboarded → bounced to
  `/feed`. Separately, signed up a second invited user and stopped before submitting the picker →
  visited `/feed` directly → bounced to `/onboarding`.
- `bun run e2e` (`e2e/home.spec.ts` + the updated `e2e/auth.spec.ts`, 7 tests total) — green, local
  only (same CI gap as every phase since 2.2: no Postgres in the workflow until Phase 7.1).

## Findings for later tasks

- **There is no re-pick UI in v1, by design** (plan Decision 10) — `setUserTopics` already handles
  re-picking correctly (a retained topic keeps its learned weight, covered by
  `routers.integration.test.ts`'s "set, re-set with overlap" case), but `/onboarding`'s own
  redirect means an already-onboarded user can never reach this screen again. Changing topics is
  Phase 9's settings work; the capability exists in the repo layer today and is simply unreachable
  from the UI.
- **`docs/PHASE5_WALKTHROUGH_5.2.md`'s `data-testid="auth-error"` pattern is now used twice** — the
  next inline-error slot this app adds should default to including one rather than relying on
  `role="alert"` alone, given Next's route-announcer collision is app-wide, not screen-specific.

## Next

Plan Phase 5.4 — Feed screen (`docs/BUILD_PLAN.md`): the real `/feed`, replacing the placeholder
this phase's guard now points at — `useInfiniteQuery` on `feed.page`, ImageCard/ArticleCard,
serendipity connective rows, and the first real consumer of `src/trpc/server.ts`'s RSC-prefetch
plumbing.
