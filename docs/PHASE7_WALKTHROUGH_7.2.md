# Phase 7.2 walkthrough — the security pass, verified by things that run

**Executed 08-28-26** against `docs/PHASE7_PLAN_7.2.md` (decisions D1–D8 live in the plan), on
branch `feat/7.2-security`, unattended under `docs/PHASE7_OVERNIGHT.md`.

**Status: complete.** Every task landed; **no fallback was taken** — D1's enforced CSP with a
per-request nonce held on the first `e2e:prod` run, so D2's retreat to `'unsafe-inline'` was never
needed. `bun run check` is 75 files / 797 tests (was 72 / 774); `bun run e2e:prod` is 46 (was 42);
`bun run e2e` is 45 (was 41).

The phase's premise was that SPEC §11 had become a list of things somebody had *read* rather than
things that *run*. Seven tasks later every line of it ends in a test name — and, as it happens, two
of those tests found something on their first run.

---

## What the pass found

### 1. Stored markup in the corpus — 41 rows, reader-visible today

The new DB invariant (`source-invariants.test.ts`, T5.3) asks whether any stored `title`, `summary`
or `body` contains an HTML tag. It does. Four adapters pass their source's italics straight
through:

| source | field | rows |
|---|---|---|
| `smithsonian` | `title` | 35 |
| `met` | `title` | 2 |
| `wellcome` | `title` | 2 |
| `wellcome` | `summary` | 1 |
| `nasa-images` | `summary` | 1 |
| **total** | | **41** |

This is **not** a security bug — nothing in the app renders stored text as HTML, which is exactly
what T5.2's source scan now guarantees. It is a *cosmetic* one, and it is on screen right now:

```
Sword Guard (<i>Tsuba</i>) With the Motif of Sunrise Over the Ocean (日の出に波濤図鐔)
Forked blade (<em>zhang</em> 璋)
M0016994EA: <i>Journal of proceedings of the Linnean Society. Zoology</i>: table of contents
Figure 1 from Head <i>et al</i>., <i>Science</i>, …
```

The fix is one `htmlToText()` call in `normalize.ts` plus a re-normalise of the existing rows —
an adapter change, and adapters are a cross-service agreement (CLAUDE.md), so D7 says record it and
move on rather than rewrite them overnight. **Left for Ben.**

The full `(source, id, field)` list, in the order the query returns it:

```
met          1l4cI7pX8EbREmK0Q7ERe  title
met          u0MkMp2MEQgA0GFFTil9W  title
nasa-images  WVGdE0aCICbjM2knCiTD9  summary
smithsonian  -14mzwBOOuLFKluz04eF9  title
smithsonian  0BvUXMvAKgZ7MBdlH_C1k  title
smithsonian  1OYfH3qifYsfcS-Y-d20K  title
smithsonian  44XS0pOpMalM8eUBUVxwD  title
smithsonian  4yffc5Dhbiasov9lWPsFq  title
smithsonian  6jiNBlp0IzmnJ-SIAbn1Y  title
smithsonian  CBPP4dMXslbd8uNs3cbP2  title
smithsonian  DqTrYALaQdwe39Lw2iZ5K  title
smithsonian  HisdXm0vaInoxatYfQefK  title
smithsonian  I-6Ck-iQddsvn4j874C8M  title
smithsonian  IL2R3umEu0XP7Rt7fjnIH  title
smithsonian  ITc1eUoAFeNT43HqM-BO4  title
smithsonian  JXV8_2tgDgfYjZQB_rdMG  title
smithsonian  OaQYro7uKpVEmbacvfGjy  title
smithsonian  OkfJkV5JKhSaq0zvie1TG  title
smithsonian  PhV_pzg0chxQJSxUDWhsJ  title
smithsonian  QT6oC9lf28rN2GPfRIZyo  title
smithsonian  TiX7Vq53xIr6yj2_aP8r8  title
smithsonian  VqtdLyt_wqNsnofUkwEgp  title
smithsonian  WHUy18ICn6kAZwzflr_Mk  title
smithsonian  WKnON5grW7RHJyT9SzHUp  title
smithsonian  WmF8W1n3H2H8Id2QYFZ6c  title
smithsonian  YCg3Rz2OkOgqRyeLqsu7m  title
smithsonian  _g3pFgRldYch4RzDHPT31  title
smithsonian  dc97qO49l3V1GSDD25VF-  title
smithsonian  ejg5pT9Wbfg6aqf48sxT-  title
smithsonian  iA9y22JJMoQ6D_Zq8ckZH  title
smithsonian  kLz0S71lZGnVFWE_8MlhA  title
smithsonian  kyD32w4TPmoVs9WW8EBmH  title
smithsonian  pNsFhtzZdyG24o5DEAqDx  title
smithsonian  r2bEeDfvQ8Nw8NYycVNzJ  title
smithsonian  ub_3dmZZBRLai9T2Tsjgx  title
smithsonian  vmVJcHohaI6qtlsBsmsvr  title
smithsonian  y4q07-qu6AKQ33H8SXqIy  title
smithsonian  yFzoRCBVreVoMnnYhQvD7  title
wellcome     G1DxewLPlln6HYB02yLQt  summary
wellcome     3tw4aHHfjNSD4cdTwlskU  title
wellcome     gHKBWmc7Uka2gVLkSXR8y  title
```

**And 14 rows that are not a finding at all.** The same query flagged 14 `wikipedia` bodies. They
are articles *about* markup — the prose contains `<section>`, `<ref>`, `<b>`, `<ul>` as its subject:

```
"…defined by International Standard ISO 2145.\n\n\n== In HTML ==\nThe <section> tag may be used…"
"…in HTML, <b> begins a section of bold text and </b> closes it. In XHTML,…"
"…MediaWiki, for example, has had to introduce its own <ref></ref> tag for citing references…"
```

A regex cannot tell an article about a tag from a tag. The invariant excludes `wikipedia`'s `body`
and the four sources above, with both reasons written into the test — so it still fails for `aic`,
`cma`, `loc`, the blogs, and anything a later phase adds.

### 2. A CSP-shaped bug in the dev server, found by the specs that already existed

After T3 landed, `bun run e2e:prod` was green — and `bun run e2e` (dev) came back with four
failures, all of them "renders without console errors" specs. The console error:

```
A tree hydrated but some attributes of the server rendered HTML didn't match the client properties.
  <script
+   nonce="MzczMzlkNmUtODgwYS00NWNiLWFjOGUtOWM4ZjhhYWFiYTI2"
-   nonce=""
    dangerouslySetInnerHTML={{__html:"try{var a=…"}}
```

The browser blanks a `<script nonce>` **content attribute** once the element is parsed — that is
the CSP spec, and the reason is that a script on the page must never be able to read a nonce back
out of the DOM and forge one. React's dev-only hydration check does not know that, so it sees the
server's value against an empty attribute and logs a mismatch on every page load. Nothing is
actually wrong: the IDL property still holds the value, and the script has already run.

Fixed with a `suppressHydrationWarning` scoped to that one `<script>`, with the whole explanation in
`layout.tsx`. Production builds never logged it — which is precisely the shape of thing that would
have shipped unnoticed.

---

## The headers, as served

Under `bun run start` (`BETTER_AUTH_URL=http://localhost:3000`, so no HSTS — decision D5):

```
$ curl -sI http://localhost:3000/
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-OWE3NjRkMzctMzY4OC00OTQ0LWE1YjAtODIzZDg1ZDY2ZTcx' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
```

And Next stamps the same nonce onto its own inline scripts:

```
$ curl -s http://localhost:3000/ | grep -o 'nonce="[^"]*"' | head -5
nonce="OTU2NzExMzgtNTYzOS00NWFkLTljMTYtNTU3ZmVjZGE5Mjkx"   (×5, all identical within one response)
```

**The negative control the plan asked for:** deleting the `response.headers.set("Content-Security-
Policy", csp)` line from `proxy.ts` makes `security.spec.ts` fail immediately with
`Error: no CSP on /`. Restored straight after.

## The route table after T3

Reading the nonce with `headers()` in the **root** layout makes every route under it render on
demand — which is required, because a nonce baked into static HTML at build time is the same nonce
for every visitor. Three routes that were `○` before are `ƒ` after, and no `await connection()` was
needed anywhere:

| route | before T3 | after T3 |
|---|---|---|
| `/`, `/feed`, `/i/[itemId]`, `/g/[itemId]`, `/onboarding`, `/profile`, `/profile/edit`, `/reset-password`, `/saved`, `/settings` | `ƒ` | `ƒ` |
| `/_not-found` | `○` | `ƒ` |
| `/~offline` | `○` | `ƒ` |
| `/dev/tokens` | `○` | `ƒ` |
| `/manifest.webmanifest` | `○` | `○` — static JSON, no scripts, excluded from the matcher |
| `/serwist/[path]` | `●` | `●` — the compiled SW, a classic worker script, excluded from the matcher |
| `/api/*` | `ƒ` | `ƒ` |

## User-scoped queries: where each one filters by `userId`

SPEC §11's "all user-scoped queries filter by `userId`", read module by module. Every one takes the
id as its first parameter and puts it in the `WHERE`; nothing derives it from client input.

| module | function | the line that scopes it |
|---|---|---|
| `db/saves.ts` | `saveItemToCollection`, `unsaveItem`, `isItemSaved`, `getSavedItems`, `countSavedItems` | `eq(savedItem.userId, userId)` |
| `db/collections.ts` | `getCollections`, `createCollection`, `collectionBelongsTo` | `eq(collection.userId, userId)` |
| `db/topics.ts` | `getUserTopicIds`, `setUserTopics`, `getUserTopicWeights`, `bumpTopicWeight`, `getTasteKeywords` | `eq(userTopic.userId, userId)` |
| `db/users.ts` | `getUserProfile`, `updateUserProfile` | `eq(user.id, userId)` |
| `db/feed.ts` | `getTopicPools` (seen-exclusion), `markSeen` | `eq(seenItem.userId, userId)` |

Proven, not just read: **T5.1's `describe("7.2 — user isolation")`** in
`routers.integration.test.ts` gives two real users a real Postgres and asserts A's save is absent
from B's list/count/`forItem`, that B's `unsave` on A's item is a no-op that leaves A's save
standing, that A's `topics.setMine` never adds a topic to B, that `user.me` answers with the
caller's own row, and — the one that would hurt most if it were wrong — that A's `seen_item` rows do
not exclude anything from **B's** pools.

## The public surface, audited

| surface | inputs | returns | user-derived data |
|---|---|---|---|
| `items.byId` | `{ id: string }` | the whole `item` row: id, source, sourceId, type, title, summary, body, imageUrl, sourceUrl, attribution, license, tags, topicId, curationScore, aestheticTags, fetchedAt | none — the table has no user column |
| `items.wanderNext` | `{ itemId: string }` | `{ id, title, reason }[]` | none; **there is no `userId` parameter to pass**. The walk is over checked-in topic-graph config |
| `items.galleryRail` | `{ itemId, count ≤ 16, exclude ≤ 200 ids, knobs? }` | public item fields only (id, title, attribution, imageUrl, summary, source, sourceUrl, license, topicId) | none, same construction. Writes no `seen_item` rows, ever (the 08-20-26 corpus-burn rule) |
| `/i/[itemId]` | path id + `?from=` | the item page, plus `generateMetadata` built **purely from the item row** | `?from=` only, rendered as a React text node, `null` unless a single string ≤ 40 chars (`sharedByName`). By design (5.8), not a leak |
| `/g/[itemId]` | path id | the immersive gallery over `galleryRail` | none |
| `/api/img/[itemId]` | path id **only** | the upstream image bytes | none. **Never accepts a URL** — that is the route's security boundary, and 7.3 keeps it |

`generateMetadata` on `/i/` was re-read: it takes `params` only, never `searchParams`, so a shared
link's preview card cannot carry the sharer's name. Confirmed.

**The tRPC error formatter does not leak stack traces in production.** It adds only `zodError`;
tRPC itself omits `stack` outside development. Live, against `next start`:

```
$ curl -s 'http://localhost:3000/api/trpc/items.byId?input={"json":{"id":"definitely-not-real"}}'
{"error":{"json":{"message":"No item with id definitely-not-real","code":-32004,
 "data":{"code":"NOT_FOUND","httpStatus":404,"path":"items.byId","zodError":null}}}}
```

## Sessions and cookies

Database-backed sessions (Better Auth's Drizzle adapter over the `session` table), and
`revokeSessionsOnPasswordReset: true` — a reset after a suspected compromise kills whatever session
an attacker already holds rather than letting it coexist with the new password.

Cookie flags, read off a real sign-up against the production build rather than off the docs:

```
$ curl -si -X POST http://localhost:3000/api/auth/sign-up/email …
set-cookie: better-auth.session_token=…; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax
```

`HttpOnly` and `SameSite=Lax` are there; `Secure` is **absent, correctly** — `baseURL` is
`http://localhost:3000` and Better Auth gates `Secure` (and the `__Secure-` cookie prefix) on an
https base URL, the same shape of gate D5 applies to HSTS. **8.1 action:** confirm on the deployed
https origin that the cookie comes back `Secure` and prefixed.

## IP trust (decision D4) — why 7.2 adds no proxy code

Recorded in full in `src/lib/auth.ts`, above `rateLimit`. In short: Better Auth reads the client IP
from `x-forwarded-for`, and **since 1.6.21 refuses to trust a comma-separated chain** — a single
valued header is used, a multi-hop one is treated as untrusted unless `trustedProxies` names the
hops. Coolify's Traefik strips inbound `X-Forwarded-*` from untrusted peers and sets its own, so
production sees the single-valued form. Ambit's own `trustedClientIp()` takes the *last* hop for the
same reason, so both limiters agree on who a caller is. Installed version confirmed 1.6.25.

**8.1 action:** behind the deployed proxy, make one real request to `/sign-in/email` from two
clients and confirm the limit applies per client, not per proxy. If the header arrives multi-valued,
set `advanced.ipAddress.trustedProxies` to the proxy's address — that is the whole fix.

## What the plan got wrong

Three things, all small:

1. **T5.1 assumed the second user was a blank slate.** The plan says "B's `saves.count` is 0" and
   "A's `topics.setMine` leaves B's `topics.mine` empty". Neither is true by the time the new
   describe runs: the 6.1 "a save teaches the feed" block above it *drives* B, so B legitimately
   arrives with one save and one topic. The tests now capture B's state before A acts and assert it
   is unchanged, which is the stronger question anyway.
2. **D7's "narrow to `source not in (…)`" needed splitting per field.** Applied literally it would
   have excluded `wikipedia` wholesale for a false positive in `body` while leaving `smithsonian`'s
   real markup in `title` uncovered by any exclusion at all. The test now narrows per field, with
   the two different reasons written down.
3. **T3.6's fallback wasn't needed, but T3.5's list of typical causes didn't include the real one.**
   The dev failure wasn't a missing nonce, a static route, or a blocked SW — it was React's
   hydration check disagreeing with the CSP spec about what a `nonce` attribute reads as.

## What to remember

- **A nonce makes every route dynamic.** Reading `headers()` in the root layout is not incidental —
  it is what makes the nonce per-request, and it is why three previously static routes now render on
  demand. If a future phase wants a genuinely static route back, it has to leave the root layout.
- **`style-src` keeps `'unsafe-inline'` on purpose** (D1). Fifteen components set `style={{…}}` for
  real per-item values; blocking inline styles buys nothing against script injection.
- **`Permissions-Policy` locks only what the app never uses.** Web Share, the clipboard and
  notifications are *features* here — a well-meaning "lock everything" edit would break Save-image
  on a phone without failing a single other test, which is why `security-headers.test.ts` asserts
  their absence from the policy.
- **The 41 stored-markup rows are still there.** They are a reader-visible defect with a known
  one-line fix in the wrong file for this phase.
