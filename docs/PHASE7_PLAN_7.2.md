# Phase 7.2 — Security pass: detailed execution plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Companion to `docs/BUILD_PLAN.md` Phase 7.2 — same format as `PHASE7_PLAN_7.1.md`. **This plan is written to run unattended** (see `docs/PHASE7_OVERNIGHT.md`): every task has a done-bar a script can check, every risky step has a fallback written down, and nothing asks a human anything.

**Goal:** walk SPEC §11's checklist and leave each line *verified by something that runs* — a test, a header a spec asserts on, a query — rather than by reading. The app gains the security headers it has never had (CSP with a per-request nonce, HSTS, nosniff, frame-ancestors, referrer and permissions policies), a two-user authorization test, a guard that no source text is ever rendered as HTML, and a written audit of the public surface. Nothing about how the app *behaves* for a reader changes; if it does, that is a bug this plan found.

**Architecture:** one pure module, `src/config/security-headers.js`, builds every header value (unit-tested, no Next imports) and is consumed twice — by `next.config.js`'s `headers()` for the static headers, and by `src/proxy.ts`, which mints a nonce per request, sets `Content-Security-Policy` on the response and `x-nonce` on the request so Next stamps the nonce onto its own inline scripts. The root layout reads the nonce with `headers()` for the one hand-written inline script (the pre-paint accent restore). A new `e2e/security.spec.ts` asserts the headers and zero CSP violations across the real routes under a production build.

**Tech Stack:** Next.js 16.2 (`proxy.ts`, App Router) / Bun 1.3 / TypeScript strict / Better Auth 1.6.25 / Drizzle over Postgres 17 / Vitest 4 / Playwright 1.62.

**Status: ready to execute cold.** Written 08-27-26 by a session that read every file named below, ran the production build to read the route table, and verified the library claims (§ "Verified facts") against current docs that day. No design doc; the decisions were settled in chat with Ben and are locked below.

## Global Constraints

- **Do not make the tests weaker to make the gates green.** No new `test.skip`, no widened timeouts, no `retries` above the existing config, no `expect.soft`. If a test goes red after a header lands, the header broke something real — find out what. The one sanctioned retreat is D2's fallback rule, and taking it must be recorded (STATUS, walkthrough, SPEC §11).
- **No behaviour change for readers.** This phase adds headers and tests. If a task needs to change how a screen works to satisfy a header, stop that task, take its fallback, and record it.
- **Repo conventions:** comment generously — Ben is a returning webdev and the codebase teaches (CLAUDE.md). Every task ends green on `bun run check` (run `bun run format:write` first — the code blocks here are not guaranteed prettier-exact); commit per task with a conventional-commit subject. Plain branch `feat/7.2-security` off `main`, merged back with `--no-ff` at the end (no worktrees).
- **Local dev:** Ambit must own port 3000 (`lsof -ti:3000 | xargs kill` if something else has it). `docker compose up -d` for Postgres + Mailpit. A red Postgres-touching test on a busy machine is usually load, not code (CLAUDE.md). A red `gallery.spec:193` alone is the known local accumulation flake: run `bun run e2e:clean --confirm` (it only deletes `ambit-%@example.com` users) and re-run once before believing it.
- **Never commit `.env`.** Nothing in this plan needs a new secret.
- **Do not** use the Agent tool, workflows, or deep-research unless Ben asks.

---

## Before you start

```bash
cd ~/Dev/ambit && git checkout main && git pull && git checkout -b feat/7.2-security
lsof -ti:3000 || echo "port 3000 free"
docker compose up -d
git push --dry-run origin main      # proves the SSH key works non-interactively; if it prompts, stop and record it in STATUS
bun run check                        # must be green before the first edit — if not, stop and report
bun run e2e:prod                     # must be green too (42 passed) — this is the gate every task below re-runs
grep '"version"' node_modules/better-auth/package.json   # expect 1.6.25 (≥ 1.6.21 is what D4 relies on)
```

**Decisions locked (do not relitigate — settled with Ben 08-27-26):**

- **D1 — CSP is enforced, not report-only, and uses a per-request nonce with `'strict-dynamic'`.** Next's documented mechanism (proxy sets `x-nonce` on the request; Next applies it to its own inline scripts). `style-src` keeps `'unsafe-inline'`: fifteen components set `style={{…}}` and blocking inline *styles* buys nothing against the threat CSP is here for.
- **D2 — Fallback rule for D1, because this run is unattended.** If, after T3 lands, `bun run e2e:prod` cannot be made green within **two** honest fix attempts (an attempt = a diagnosed cause and a targeted change, not a re-run), replace `script-src 'self' 'nonce-…' 'strict-dynamic'` with `script-src 'self' 'unsafe-inline'`, drop the nonce plumbing from `layout.tsx` (keep it in `proxy.ts`, unused, with a comment), keep *every other* directive and header, make T4's spec assert the weaker shape, and record the retreat in `OVERNIGHT_STATUS.md`, the walkthrough, and SPEC §11 as an open item for Ben. The rest of the phase proceeds.
- **D3 — Headers come from one pure module** (`src/config/security-headers.js`, JSDoc-typed like `dev-origins.js`) so `next.config.js` (plain ESM, no TS) and `proxy.ts` build from the same source and Vitest can test the values without booting Next.
- **D4 — No new IP-trust code.** Better Auth ≥ 1.6.21 already refuses multi-hop `X-Forwarded-For` chains (the 7.1 concern) and accepts a single-valued header, which is what Coolify's Traefik sends (it strips inbound `X-Forwarded-*` from untrusted peers and sets its own). Ambit's own `trustedClientIp` takes the *last* hop, so both limiters agree. `advanced.ipAddress.trustedProxies` stays unset until 8.1 can read the real proxy address; 7.2 records the fact and the 8.1 action.
- **D5 — HSTS only when the app is served over https** — gated on `BETTER_AUTH_URL` starting with `https://`, never on `NODE_ENV`. CI's `next start` is production *and* plain http; browsers ignore HSTS over http, but the gate keeps the header honest.
- **D6 — `Permissions-Policy` locks only what the app never uses** (camera, microphone, geolocation, payment, usb). Web Share, clipboard and notifications are features (`use-notification-permission.ts`, `share-sheet.tsx`) and are *not* restricted.
- **D7 — The "no source HTML is rendered" line becomes two tests**, not a lint plugin: a source-scan unit test that fails on any `dangerouslySetInnerHTML` outside the one constant in `layout.tsx`, and a DB invariant (skipped without `DATABASE_URL`, like `source-invariants.test.ts`) that no stored `title`/`summary`/`body` contains an HTML tag. If the DB invariant finds rows on the local corpus, that is a *finding*: list the `(source, id, field)` rows in the walkthrough and STATUS, do **not** rewrite adapters overnight.
- **D8 — Authorization is proven by a two-user integration test**, added to `routers.integration.test.ts` beside the existing cross-user collection case, not by a static grep of the DB modules.

**Verified facts (08-27-26) the plan is built on:**

| Fact | Where verified | Consequence |
|---|---|---|
| Better Auth's rate limiter is enabled in production, disabled in dev; IP comes from `advanced.ipAddress.ipAddressHeaders` (default `x-forwarded-for`); **since 1.6.21 a comma-separated chain is not trusted** — single-value headers work, `trustedProxies` walks the chain right-to-left. Installed: 1.6.25. | better-auth docs *concepts/rate-limit*, `packages/core/CHANGELOG.md` (#10203), `node_modules/better-auth/package.json` | D4. No code; T1 records it in `auth.ts` and SPEC §11. |
| Next 16 CSP recipe: `proxy.ts` mints `nonce = Buffer.from(crypto.randomUUID()).toString('base64')`, sets `x-nonce` and `Content-Security-Policy` on the *request* headers passed to `NextResponse.next({ request: { headers } })` **and** the CSP on the response; layouts read `(await headers()).get('x-nonce')`; dev needs `'unsafe-eval'`; nonces require dynamic rendering. | Next.js docs *guides/content-security-policy* | T3's exact shape. |
| `headers()` in the **root layout** is a dynamic API — every route under it renders on demand. Today's build has three static HTML routes (`/~offline`, `/_not-found`, `/dev/tokens`) that would otherwise carry un-nonced inline scripts. | `bun run build` route table, 08-27-26 | T3.4 re-reads the table after the change; any route still `○` gets `await connection()` (from `next/server`). |
| The only `dangerouslySetInnerHTML` in `src/` is the constant accent script in `src/app/layout.tsx` (nothing interpolated). Source text reaches the screen only as React text nodes: `reader-item-body.tsx` renders `parseReaderBlocks()` output, and blogs pass through `htmlToText()` at ingest. | `grep -rn dangerouslySetInnerHTML src`, `src/lib/reader-blocks.ts`, `src/server/services/sources/normalize.ts:82` | D7's scan test has exactly one allowed match. |
| Rate limits today: tRPC 120/min keyed on user id → trusted IP → `"unknown"`; `/api/img` 600/min per trusted IP; Better Auth `customRules` 20/10s on `/sign-in/email` and `/sign-up/email`. `RateLimiter` and `trustedClientIp` are unit-tested in `rate-limit.test.ts`. | `src/server/api/trpc.ts:162`, `src/app/api/img/[itemId]/route.ts`, `src/lib/auth.ts` | T1 checks whether the tRPC middleware's 429 path has a test and adds one if not. |
| `devTrustedOrigins()` returns `[]` outside development, so no tailnet host reaches a production trusted-origin set. | `src/config/dev-origins.js` | Nothing to do; record in the audit. |
| The public surface is `items.byId`, `items.wanderNext`, `items.galleryRail`, `/i/[itemId]`, `/g/[itemId]`, `/api/img/[itemId]`; none takes a user id; `/i/?from=` renders a caller-supplied first name as a text node, capped at 40 chars by `sharedByName()`. | SPEC §11, `src/components/item/shared-by-row.tsx`, `src/app/i/[itemId]/page.tsx:101` | T6 audits and records; the `from` param is by design (5.8), not a leak. |
| Images load from `/api/img/*` (same origin), `data:` (e2e corpus), and `/landing/*.jpg` + `/icon-*.png` (public dir); fonts are self-hosted by `next/font/google`; tRPC and auth are same-origin fetches; the service worker is `/serwist/sw.js`. | `image-tile.tsx:87`, `landing-slides.ts`, `src/lib/fonts.ts`, `src/app/sw.ts` | The CSP allowlist in T2 is exactly `'self' data: blob:` for images, `'self'` for everything else. |
| Three specs already assert "no console errors" (`feed`, `item`, `settings` — pattern at `e2e/feed.spec.ts:136`). A CSP violation logs a console error, so the existing suite is a CSP safety net even before T4. | `e2e/*.spec.ts` | Run `e2e:prod` after T3 before writing T4. |
| The proxy's matcher today covers only the five authed prefixes and redirects on a missing session cookie. | `src/proxy.ts` | T3 widens the matcher for CSP and keeps the redirect scoped to those prefixes. |

---

## Tasks

### T1 — Rate limits: verify, test the gap, record the IP-trust facts

- [x] **1.1** Read `src/server/api/routers/routers.test.ts`. If it has no test that the rate-limit middleware throws `TOO_MANY_REQUESTS` on the 121st call from one key, add one using the file's existing caller/context pattern (the limiter is process-wide: construct 120 allowed calls on a fresh key, assert the 121st throws with `code: "TOO_MANY_REQUESTS"`). If the test already exists, note that in the walkthrough and move on.
- [x] **1.2** In `src/lib/auth.ts`, above `rateLimit:`, add a comment block recording D4 in full: the 1.6.21 change, why a single-valued `X-Forwarded-For` from Coolify's proxy is what production will see, that `trustedClientIp()` (rate-limit.ts) takes the last hop for the same reason, and the 8.1 action — *confirm with one real request behind the deployed proxy that `/sign-in/email` rate-limits per client, not per proxy; if the header arrives multi-valued, set `advanced.ipAddress.trustedProxies` to the proxy's address.* No code change unless the installed version is < 1.6.21 (then `bun update better-auth` within `^1.6` and re-run `check`).
- [x] **1.3** `bun run check` green. Commit: `test(api): rate-limit middleware 429 path; record Better Auth IP-trust facts`.

*Done = a test exercises the tRPC 429 path; `auth.ts` says why no proxy code is needed and what 8.1 must confirm.*

### T2 — `src/config/security-headers.js`: every header value, pure and tested

- [x] **2.1** Create `src/config/security-headers.js` (plain ESM + JSDoc, like `dev-origins.js`, so `next.config.js` can import it). Export:

```js
/** The static headers every response carries. `https` gates HSTS (decision D5). */
export function staticSecurityHeaders({ https }) {
  const headers = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  ];
  if (https) {
    headers.push({ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" });
  }
  return headers;
}

/** The CSP for one request. `nonce` is minted per request by proxy.ts; `dev` loosens what `next dev` needs. */
export function buildCsp({ nonce, dev }) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
```

  Comment each directive with *why that value* in this app (what loads from where — see the Verified facts row). Explain in the file header why this is `.js` (next.config.js is plain ESM) and why both consumers must build from here.
- [x] **2.2** `src/config/security-headers.test.ts`: HSTS present iff `https`; every static key present; `buildCsp` contains the nonce, `'strict-dynamic'`, `frame-ancestors 'none'`; `'unsafe-eval'` and `ws:` appear only with `dev: true`; no directive allows a third-party origin (assert the string contains no `http` substring).
- [x] **2.3** `next.config.js`: add

```js
async headers() {
  return [
    {
      source: "/(.*)",
      headers: staticSecurityHeaders({ https: env.BETTER_AUTH_URL.startsWith("https://") }),
    },
  ];
},
```

  importing `env` from `./src/env.js` (already imported for its side effect — bind the name) and the helper from `./src/config/security-headers.js`. Comment: CSP is *not* here because it needs a per-request nonce — that lives in `proxy.ts`.
- [x] **2.4** `bun run check` green; `bun run e2e:prod` green (headers alone should break nothing). `curl -sI http://localhost:3000/ | grep -i -E "x-content-type|x-frame|referrer|permissions"` against `bun run start` shows all four; no HSTS (http).
- [x] **2.5** Commit: `feat(security): static security headers from one pure module`.

*Done = `security-headers.test.ts` green; the four static headers on every route under `next start`; HSTS absent over http.*

### T3 — CSP with a per-request nonce in `proxy.ts`; the nonce reaches the accent script

- [x] **3.1** Rewrite `src/proxy.ts`:
  - Keep the header comment's explanation of the optimistic cookie check; add a second paragraph: the proxy now also runs on *every* HTML and API route to mint the CSP nonce (Next's documented mechanism — see Verified facts), and the auth redirect stays scoped to the five prefixes via an explicit list, not the matcher.
  - `const AUTHED_PREFIXES = ["/feed", "/saved", "/onboarding", "/profile", "/settings"];` — redirect only when `AUTHED_PREFIXES.some(p => pathname === p || pathname.startsWith(p + "/"))` and there is no session cookie.
  - Mint `nonce`, build `csp = buildCsp({ nonce, dev: process.env.NODE_ENV === "development" })`, set `x-nonce` and `Content-Security-Policy` on a cloned request-headers object, create the response with `NextResponse.next({ request: { headers } })` (or the redirect), and set `Content-Security-Policy` on the response too. Both settings are required — the request copy is what Next reads to nonce its own scripts.
  - Matcher: `"/((?!_next/static|_next/image|favicon.ico|icon-|apple-icon|landing/|manifest.webmanifest|serwist/).*)"` — static assets and the SW script need no nonce; comment each exclusion.
- [x] **3.2** `src/app/layout.tsx`: make `RootLayout` `async`, read `const nonce = (await headers()).get("x-nonce") ?? undefined;` (`import { headers } from "next/headers"`), and pass `nonce={nonce}` to the inline `<script>`. Extend the existing comment: the script is still a constant; the nonce is what lets `'strict-dynamic'` run it, and reading `headers()` here is also what makes every route dynamic (the CSP nonce requires that).
- [x] **3.3** `src/proxy.test.ts` (Vitest, `environment: node`): construct a `NextRequest` for `/`, `/feed` without a cookie, `/feed` with a `better-auth.session_token` cookie (any value — `getSessionCookie` checks presence), `/api/trpc/x`; assert the response's `Content-Security-Policy` contains `nonce-` and that the same nonce appears in the forwarded request header `x-nonce` (read it from `response.headers.get("x-middleware-request-x-nonce")` — Next encodes overridden request headers that way — or, if that proves brittle, assert only the response header and the redirect behaviour); `/feed` without cookie → 307 to `/`; `/` never redirects. Two nonces from two requests differ.
- [x] **3.4** `bun run build` and read the route table: every HTML route must be `ƒ`. If `/~offline`, `/_not-found`, or `/dev/tokens` is still `○`, add `await connection()` (`import { connection } from "next/server"`) at the top of that page component (for `_not-found`, create `src/app/not-found.tsx` with the same minimal styling as `~offline/page.tsx`) and rebuild. Record the final table in the walkthrough.
- [x] **3.5** `bun run check` green. `bun run e2e:prod` green — **this is D1's gate.** If red: read the trace (`.playwright/test-results/`), find the console error, fix the cause. Typical causes and their fixes: an inline script without the nonce (pass it); a route still static (3.4); the SW script blocked (`worker-src` / matcher exclusion); a dev-only origin (must not appear under `next start`). After **two** diagnosed attempts, apply **D2** exactly as written and continue.
- [x] **3.6** `bun run e2e` (dev server) green too — dev CSP has `'unsafe-eval'` and `ws:`; if Turbopack HMR still violates, switch the **dev** branch of `buildCsp` to be emitted as `Content-Security-Policy-Report-Only` (a `reportOnly` flag on the proxy's dev path), keep production enforced, and note it.
- [x] **3.7** Commit: `feat(security): Content-Security-Policy with a per-request nonce` (or, under D2, `feat(security): Content-Security-Policy (unsafe-inline scripts; nonce deferred — see SPEC §11)`).

*Done = production build serves a CSP with `'strict-dynamic'` + nonce on every HTML route, the accent script still runs (`e2e/settings.spec.ts`'s accent reload test is the proof), and both e2e runs are green — or D2 is applied and recorded.*

### T4 — `e2e/security.spec.ts`: the headers and zero CSP violations, on the real routes

- [x] **4.1** New spec, `test.describe("security headers")`, seeding a small corpus with `seedFeedCorpus(conn, "ambit-security-e2e-", 12, topics)` and one invited user `ambit-security-e2e-<stamp>@example.com` (see `e2e/feed.spec.ts` for the invite + sign-in shape; clean up children-first, scoped to the prefix, like every other spec).
- [x] **4.2** Before each navigation, `page.addInitScript(() => { window.__csp = []; document.addEventListener("securitypolicyviolation", e => window.__csp.push(e.violatedDirective + " " + e.blockedURI)); })`, plus the `page.on("console")` collector from `feed.spec.ts:136` (keep its image-load exclusion).
- [x] **4.3** For each of `/`, `/i/<seeded id>`, `/feed` (signed in), `/settings`, `/saved`: `const res = await page.goto(...)`; assert `res.headers()` has `content-security-policy` containing `frame-ancestors 'none'` and (unless D2 applied) `'strict-dynamic'` and `nonce-`; `x-content-type-options: nosniff`; `referrer-policy`; `permissions-policy`; `x-frame-options: DENY`. `waitForHydration` where the page has a form; then assert `await page.evaluate(() => window.__csp)` is `[]` and the console collector is `[]`.
- [x] **4.4** Two API responses carry `nosniff` too: `request.get("/api/img/<seeded id with a same-origin http imageUrl>")` (seed one row with `imageUrl: "http://localhost:3000/icon-192.png"` as `pwa.prod.spec.ts` does) and a tRPC GET (`/api/trpc/items.byId?input=…` — copy the encoding from any existing spec or from the browser's own request in a trace).
- [x] **4.5** Assert HSTS is **absent** (http) — a deliberate assertion that D5's gate works.
- [x] **4.6** `bun run e2e:prod` green with the new spec included (count becomes 42 + N). `bun run e2e` green.
- [x] **4.7** Commit: `test(e2e): security headers and zero CSP violations across the real routes`.

*Done = the spec passes under both servers; deleting the CSP line from `proxy.ts` makes it fail (try it once, then restore — record that you did).*

### T5 — Authorization: the two-user test, and the no-HTML guard

- [x] **5.1** In `src/server/api/routers/routers.integration.test.ts`, add `describe("7.2 — user isolation")` with two users created the way the file already creates one. Assert: A saves item X → B's `saves.list` does not contain X and B's `saves.count` (or the equivalent) is 0; B calling `saves.unsave` on X is a no-op or NOT_FOUND (whichever the router does today — assert the *existing* behaviour, and assert A's save still exists afterwards); A's `topics.setMine` leaves B's `topics.mine` empty; `user.me` for B never returns A's handle/name; `feed.page` for B never returns a card whose id is in A's `seen_item` set *because of A* (seed A's seen rows directly, then page B and assert those ids can still appear — i.e. seen-ness is per user; if the corpus is too small to make this deterministic, assert instead that `getTopicPools` with B's id ignores A's seen rows).
- [x] **5.2** `src/no-dangerous-html.test.ts` (unit, no DB): walk `src/**/*.tsx` with `fs`/`path` (no glob dependency — a small recursive reader), collect files containing `dangerouslySetInnerHTML`, assert the list equals exactly `["src/app/layout.tsx"]` and that in that file the string appears on a line whose `__html:` value is a template literal containing no `${` (the constant). Comment: this is SPEC §11's "never raw `dangerouslySetInnerHTML` on source data", made executable.
- [x] **5.3** In `src/server/services/sources/source-invariants.test.ts`, beside the existing DB-backed `describe.skipIf(!process.env.DATABASE_URL)` block, add: `no stored text field contains an HTML tag` — `select source, id, 'title' as field from item where title ~ '<[a-zA-Z/][^>]*>' union all … summary … union all … body …` (Drizzle `sql` template), assert zero rows. **If rows come back on the local corpus:** print them, keep the assertion (it is the invariant), and write the `(source, id, field)` list into `OVERNIGHT_STATUS.md` under *Findings for Ben* and into the walkthrough; then, and only then, narrow the test to `source not in (<the offending sources>)` with a comment naming the finding, so the phase can proceed (D7). Do not touch adapters.
- [x] **5.4** `bun run check` green (the DB suites run locally because `.env` has `DATABASE_URL`). Commit: `test: two-user authorization isolation; no source HTML rendered or stored`.

*Done = three new tests green; the walkthrough lists every user-scoped DB function with the line that filters `userId` (a table — `saves.ts`, `collections.ts`, `topics.ts`, `users.ts`, `feed.ts`).*

### T6 — Public-surface audit, written down

- [x] **6.1** For each public surface — `items.byId`, `items.wanderNext`, `items.galleryRail`, `/i/[itemId]` (incl. `generateMetadata`), `/g/[itemId]`, `/api/img/[itemId]` — read the code and write one row in the walkthrough: *inputs it accepts · what it returns · which fields · any user-derived data (expected: none beyond `?from=`, rendered as text)*. Confirm `generateMetadata` on `/i/` never echoes `from`. Confirm the tRPC error formatter does not leak stack traces in production (`src/server/api/trpc.ts` — record what it does).
- [x] **6.2** Sessions and cookies: from `auth.ts` and Better Auth's defaults, record cookie flags in production (`Secure` when `baseURL` is https, `HttpOnly`, `SameSite=Lax`), `revokeSessionsOnPasswordReset: true`, database-backed sessions. One curl under `bun run start` after a sign-in through the UI is enough evidence for the flags; if that is awkward unattended, cite the Better Auth docs section and mark it *to confirm on the deployed origin in 8.1*.
- [x] **6.3** No commit needed unless a finding is fixed (a finding that is a one-line fix — e.g. a field that should not be in a public return shape — may be fixed and committed as `fix(security): …`; anything larger goes to STATUS as a finding).

*Done = the walkthrough's audit section has one row per surface with evidence.*

### T7 — Docs, walkthrough, log, merge

- [x] **7.1** SPEC §11: rewrite the section so each bullet ends with *how it is verified* (the test or spec name), add a **Headers** bullet (the list, HSTS gate, CSP shape, where they are built), add an **IP trust** bullet (D4 + the 8.1 action), and — if D2 was applied — an explicit *open* line. SPEC §12: add `security.spec.ts` to the e2e list.
- [x] **7.2** `docs/BUILD_PLAN.md`: tick 7.2, write its `*Done =*` paragraph in the style of 7.1's (decisions D1–D8, what was found), link this plan and the walkthrough. Update the "Next" pointer in BUILD_PLAN's Phase 5 status paragraph and in `CLAUDE.md`'s *Repository status* to 7.3 (or, if 7.3 runs in the same night, leave that to 7.3's T6).
- [x] **7.3** Write `docs/PHASE7_WALKTHROUGH_7.2.md` in the shape of `PHASE7_WALKTHROUGH_7.1.md`: executed-against header, the route table after T3, the header dump (`curl -sI`), the audit tables from T5/T6, findings, and *What the plan got wrong* (even if one line).
- [x] **7.4** `log.md`: extend today's entry (one heading per day, newest on top), **Shipped / Decisions / Open-next**, ending with the spend line from `python3 ~/.claude/scripts/session-spend.py --session <your-session-uuid>` (the second-to-last component of your scratchpad path); omit the line if the script exits non-zero.
- [x] **7.5** Gates: `bun run check` green; `bun run e2e:prod` green; `bun run e2e` green. Then `git checkout main && git merge --no-ff feat/7.2-security && git push`. Record the push in `OVERNIGHT_STATUS.md`.

---

## Verification (the done-bar, end to end)

1. `bun run check` green, including `security-headers.test.ts`, `proxy.test.ts`, `no-dangerous-html.test.ts`, the new integration cases, and the DB invariant.
2. `bun run e2e:prod`: green, with `security.spec.ts` in the count.
3. `curl -sI http://localhost:3000/i/<any id>` under `bun run start` shows CSP (nonce + `strict-dynamic` unless D2), nosniff, DENY, referrer, permissions; no HSTS.
4. The build's route table shows no `○` HTML route.
5. SPEC §11 reads as a verified checklist, not a wish list.

## Out of scope (resist)

- Image caching, resizing, feed latency, Lighthouse — **7.3**.
- Rewriting any adapter because the DB invariant found stored markup — record it (D7).
- A report-to endpoint for CSP violations, `Cross-Origin-Opener-Policy`, `Cross-Origin-Embedder-Policy`, Subresource Integrity — none is needed by this app today; note them as 8.2 candidates if you like.
- Replacing the in-memory rate limiter with a shared store — single instance is the 8.1 deploy shape (SPEC §13).
- Setting `trustedProxies` before the proxy's address is known (D4).
