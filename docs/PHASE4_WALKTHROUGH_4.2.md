# Phase 4.2 walkthrough — tRPC surface

> Companion to `PHASE4_PLAN/task-2-brief.md`. Executed 08-08-26 on branch `phase-4.2-trpc-surface`,
> picked up straight after Phase 4.1 (`getFeedPage` et al.) landed on `main`. TDD throughout: the
> rate limiter's tests were written and run before the class; the router tests exercise every
> procedure through `createCaller` with a hand-built mock context.

## What shipped

- `src/server/api/trpc.ts` — the session-aware context and procedure plumbing:
  - `createTRPCContext` now calls `auth.api.getSession({ headers: opts.headers })` (dynamic
    `import("~/lib/auth")` — the same CI-has-no-env-vars reason every `db/*.ts` repo in this
    codebase dynamically imports `"./client"`: `~/lib/auth` statically imports `db/client.ts`,
    which reads `~/env`'s Zod schema at module scope, and CI's `bun run test` step sets no env
    vars at all) and spreads `{ session, user }` (both `null` together when there's no valid
    session) into the context.
  - `protectedProcedure = publicProcedure.use(...)` throws `UNAUTHORIZED` on a null session and
    re-narrows `ctx.session`/`ctx.user` to non-null for every downstream resolver via
    `next({ ctx: { session, user } })`.
  - `rateLimitMiddleware` wraps *every* procedure (`publicProcedure` included — `items.byId` is
    the one deliberately unauthenticated surface, and exactly the kind of thing a scraper hits
    hardest), keyed on `ctx.user?.id ?? trustedClientIp(ctx.headers) ?? "unknown"`.
- `src/server/services/rate-limit.ts` — new:
  - `RateLimiter` — a pure, in-memory sliding-window limiter with an injected clock (same seam
    idea as `services/random.ts`'s `rng`), single-instance by construction (Coolify deploys one
    app process; a multi-instance deploy would need shared state instead).
  - `trustedClientIp(headers)` — takes the **last** comma-separated `X-Forwarded-For` hop, not the
    first. A mid-build security review caught that keying on the raw header (or its first entry)
    is trivially spoofable: a client can send an arbitrary first value on every request and mint a
    fresh rate-limit bucket each time, defeating the limiter exactly on `items.byId`. Only the
    last hop — the one segment Ambit's single trusted reverse proxy (Coolify) actually appends —
    is safe to trust; earlier hops are attacker-controlled input. See the function's own comment
    for the full reasoning, and rate-limit.test.ts's `trustedClientIp` suite (6 cases, including a
    spoofed-first-hop scenario) for the regression coverage.
- `src/server/db/topics.ts` — `listTopics`/`setUserTopics` are real:
  - `setUserTopics` is transactional: deletes `user_topic` rows for topics no longer selected,
    then inserts newly-selected ones at weight 1 with `onConflictDoNothing` — a topic the user
    keeps across a re-pick retains whatever weight the feed has since learned for it (SPEC §9),
    rather than being reset.
- `src/server/db/saves.ts` — `saveItem`/`unsaveItem`/`getSavedItems` are real, plus a new
  `isItemSaved` (not in the original stub list) that `saves.toggle` needs to decide which
  direction to toggle without an extra round trip through `getSavedItems`.
- Four routers (`src/server/api/routers/{topics,feed,items,saves}.ts`) wired per SPEC §7:
  - `topics.list` / `topics.setMine` (validates every id against the real topic catalog before
    touching the DB — an unknown id is a clean `BAD_REQUEST`, not a foreign-key violation surfaced
    as a 500).
  - `feed.page` pre-validates the cursor via `decodeCursor` (pure, so calling it once here and
    letting `getFeedPage` decode it again internally is harmless) and maps a decode failure to
    `BAD_REQUEST` instead of a generic 500. Its `knobs` input is zod-bounded per field but the
    router does no gating of its own — `getFeedPage` (Phase 4.1) already owns the `FEED_DEBUG`
    check, so the router's only job is validating shape and forwarding.
  - `items.byId` stays on `publicProcedure` — the one deliberately unauthenticated procedure.
  - `saves.toggle` (insert-or-delete, `NOT_FOUND` only on the save-it path since unsaving never
    needs to touch `item` at all) / `saves.list` (most-recently-saved first).
- `src/server/api/root.ts` — wires the four routers; the t3 starter's `post` demo router is gone.
- `src/app/page.tsx` — **deviation from the brief**: the brief's context said "the homepage demo
  was trimmed in 1.2," but `grep api.post` found it was still calling `api.post.hello` to prove
  tRPC was wired up. Deleting `post.ts` without touching this would have broken the build, so the
  call (and its now-pointless `hello`/loading-state paragraph) was removed in favor of a static
  placeholder string — this whole page is due for a real replacement in Phase 5.2 regardless.
- Tests: `rate-limit.test.ts` (12: 6 `RateLimiter` sliding-window cases + 6 `trustedClientIp`
  cases), `routers/routers.test.ts` (13, `createCaller` + hand-built mock context, no DB — see
  "Testing notes" below for how the DB-touching cases in the brief's list were kept DB-free),
  `routers/routers.integration.test.ts` (9, real Postgres, `describe.skipIf(!process.env.
  DATABASE_URL)`, throwaway rows cleaned up in `afterAll`) — 34 new, **164 total**, all green.

## Testing notes — two deliberate deviations from the brief's literal test list

**"`items.byId` resolves without a session"** (routers.test.ts): calling a real `getItemById`
against Postgres from a DB-free unit test file isn't possible without either requiring a DB for
that one test or accepting a hard crash in CI (no `DATABASE_URL` there at all). The test instead
asserts the thing that's actually specific to this file's job — the *auth boundary* — by calling
`items.byId` with a nonexistent id and asserting whatever comes back is never an `UNAUTHORIZED`
`TRPCError`. It resolves to a real `NOT_FOUND` locally (Postgres is up) and would resolve to some
other non-auth error in a DB-less CI run either way; the assertion is written to hold in both
environments. The genuine "does the DB give back the right item" case is covered for real in
routers.integration.test.ts.

**"knobs ignored when `FEED_DEBUG` off"** (routers.test.ts): this behavior is entirely
`getFeedPage`'s own responsibility (Phase 4.1), not the router's — the router's only job is to
zod-validate `knobs`' shape and forward it unconditionally, which is what
`feed.page forwards knobs to getFeedPage unconditionally` tests, via a `vi.mock` of
`services/feed.ts` that keeps `decodeCursor` real and replaces only `getFeedPage` with a spy. This
proves the router doesn't do its own redundant (and potentially conflicting) gating; the actual
`FEED_DEBUG` on/off behavior lives in, and should be tested against, `services/feed.ts` itself —
worth flagging as a real gap for a follow-up: neither `feed.test.ts` nor
`feed.integration.test.ts` (Phase 4.1) currently exercises the `FEED_DEBUG` branch of
`getFeedPage` at all.

## Live verification — manual curl against `bun run dev`

Ran the full sequence the brief asked for, against the populated dev DB (real ingested items,
real 16-topic graph):

```
$ bun run invite trpc-verify-08-08-26@example.com
Invited trpc-verify-08-08-26@example.com.

$ bun run dev   # backgrounded

# 1. items.byId, no cookie, nonexistent id — public, never UNAUTHORIZED
$ curl 'http://localhost:3000/api/trpc/items.byId?input=%7B%22json%22%3A%7B%22id%22%3A%22nonexistent-item-xyz%22%7D%7D'
→ HTTP 404, {"error":{"json":{"code":-32004,"data":{"code":"NOT_FOUND", ...

# 2. feed.page, no cookie
$ curl 'http://localhost:3000/api/trpc/feed.page?input=%7B%22json%22%3A%7B%7D%7D'
→ HTTP 401, {"error":{"json":{"code":-32001,"data":{"code":"UNAUTHORIZED", ...

# 3. sign up the invited user (2.2 flow) — captures the session cookie
$ curl -c cookies.txt -X POST http://localhost:3000/api/auth/sign-up/email \
    -H "Content-Type: application/json" \
    -d '{"email":"trpc-verify-08-08-26@example.com","password":"...","name":"tRPC Verify"}'
→ HTTP 200, {"token":"...","user":{...}}

# 4. feed.page, with the session cookie
$ curl -b cookies.txt 'http://localhost:3000/api/trpc/feed.page?input=%7B%22json%22%3A%7B%7D%7D'
→ HTTP 200, 12 cards, tiers {CORE, DRIFT, JUMP} all present, nextCursor present
   first card: "Hat Badge: Woman Choosing Between Youth and Old Age" (met, JUMP, textiles→mythology)

# 5. items.byId, no cookie, a real id pulled from step 4's response
$ curl 'http://localhost:3000/api/trpc/items.byId?input=%7B%22json%22%3A%7B%22id%22%3A%22to-_Bw-jxhHQ72pZZbA6o%22%7D%7D'
→ HTTP 200, {"result":{"data":{"json":{"id":"to-_Bw-jxhHQ72pZZbA6o","title":"Hand Mirror", ...
```

All five checks match the brief's expectations exactly: `feed.page` is 401 without a session and
200-with-cards with one; `items.byId` never requires a session, whether the id resolves (200, real
data) or doesn't (404, not 401). The test user, its invite, and its `seen_item` rows were deleted
from the dev DB afterward (a throwaway script, run once and discarded — not part of the committed
surface, matching Phase 3.3's precedent for one-off verification scripts).

## Findings for later tasks

- ~~**`getFeedPage`'s `FEED_DEBUG` gating has no direct test coverage yet**~~ **— resolved in
  `b841bc7`**, the review-fix commit that landed after this doc was written. `services/feed.test.ts`
  now has a `getFeedPage - FEED_DEBUG knob gating` block: 4 cases covering explicit off/on plus the
  `NODE_ENV=development` fallback in both directions, mocking `~/env` and the two db modules via
  `vi.hoisted` to keep the file's "no DB, no network" spirit. *(This doc predates the review pass —
  it describes the pre-review tree.)*
- **Rate limiting is unauthenticated-friendly by construction, but untested under real concurrent
  load** — `RateLimiter`'s sliding-window correctness is unit-tested with an injected clock, and
  `trustedClientIp`'s IP-spoofing resistance is unit-tested directly, but nothing yet exercises
  the middleware's behavior at the actual 120 req/min threshold end-to-end. Not a blocker for
  Phase 4.2 (this is explicitly abuse cover, not a hardened rate limiter), but worth keeping in
  mind if Phase 7's ops work wants a real load test.
- **Phase 4 is now complete.** Per the plan: "first shippable moment arrives with 5.4" — the next
  work is Phase 5's UI build-out, starting with 5.1 (design system foundation).

## Next

Phase 5.1 — design system foundation (`docs/BUILD_PLAN.md`): Tailwind theme from the handoff
tokens, the 4-accent system, Newsreader font, shared primitives (pill button/chip, card, toast,
bottom sheet).
