# Phase 5.7 walkthrough — item pages

**Executed 08-20-26** against `docs/PHASE5_PLAN_5.7.md`, on branch `feat/phase-5.7-item-pages`.
Nine tasks, all landed, each its own commit with `bun run check` green. The plan was written to be
executed cold and largely was; four places argued back — one of them the plan contradicting its own
fixture, and one of them big enough to reverse a decision (AIC).

**Status: code complete, one item outstanding — the iOS device pass** (see the end).

---

## What shipped

**The page.** `/i/[itemId]`'s 5.6 stub is gone. In its place, the app's one public surface, built
properly: an image variant and a reader variant keyed on `item.type`, a `from: <source>` credit line
under both titles, a "where Ambit would wander next" teaser, and — for signed-out visitors only — an
invitation. Signed-in readers additionally get the floating pill, the save and share sheets, and a
Save-image row that reaches the iOS camera roll. Both get a horizontal swipe-back that follows the
thumb.

Riding along, by prior decision: the **image proxy** — which works, but did *not* lift the AIC
suspension (see below) — and the move of **seen-marking from render-time to receipt**.

**New files**

| File | What it is |
|---|---|
| `src/lib/reader-blocks.ts` | The article-body parser: plain text with `== markers ==` → heading / subheading / paragraph. |
| `src/app/api/img/[itemId]/route.ts` | The image proxy. Item id in, bytes out, no `Referer` upstream. |
| `scripts/backfill-wikipedia-bodies.ts` | One-off body refresh for rows ingested before the adapter flip. |
| `src/server/services/wander.ts` | The teaser's brain — the feed's own drift logic, run once, in miniature. |
| `src/components/item/item-shell.tsx` | The client layer: swipe, pill, sheets, toast. Authed-only, except the swipe. |
| `src/components/item/image-item-body.tsx` | Hero, title, maker, credit, caption. |
| `src/components/item/reader-item-body.tsx` | Eyebrow, headline, credit, lede, typeset body, link-out. |
| `src/components/item/credit-line.tsx` | `from: <source>` — every source, not just blogs. |
| `src/components/item/shared-by-row.tsx` | `?from=Mara` → "Mara shared this with you", and the rules for when not to. |
| `src/components/item/wander-next.tsx` | Three real links out of here. |
| `src/components/item/join-cta.tsx` | The invitation, in two weights. |
| `src/hooks/use-leave-to-feed.ts` | **The** way off an item page: pop when you came from the feed, push when you didn't. |
| `src/hooks/use-swipe-back.ts` | Pointer-event swipe with a 0.35× rubber-band follow. |
| `e2e/item.spec.ts` | The item suite — mostly signed out, because that's what the page is for. |

**Deleted:** `src/components/item/back-to-feed.tsx` and its test. Its pop-vs-push rule survives as
`useLeaveToFeed`, now shared by the gesture *and* the pill's Feed button, so the two can't drift.

**Changed:** `feed.page` no longer writes `seen_item` (the new `feed.markSeen` mutation does, on the
client's ack); `drawFromTopic` gained the suspended-source filter `getTopicPools` already had;
`SUSPENDED_SOURCES` still holds `aic`, for a new reason; the Wikipedia adapter asks for `exsectionformat=wiki`;
`ShareSheet`'s long-reserved `imageContext` prop finally does something; `image-tile.tsx` loads
through the proxy; a `Download` icon joined the set.

---

## The four places reality argued with the plan

**1. The plan's own OG fixture couldn't satisfy its own assertion.** T8 said to seed the image item
with a `data:` URI pixel *and* to assert `og:image` ends in `/api/img/{imageId}`. Those are mutually
exclusive by design: `generateMetadata` deliberately omits `og:image` for a `data:` URL, because
there is nothing behind the proxy for a scraper to fetch and a broken preview image is worse than
none. Resolved by seeding a **fourth** item with an `http` image URL that exists only for that
assertion — nothing ever loads it, only the meta tag is read.

**2. `renderHook` can't test a hook whose whole job is an effect on a ref'd node.** The first cut of
`use-swipe-back.test.ts` mounted the hook, then assigned `result.current.current = el` and
re-rendered — but the effect has `[]` deps and had already run (and bailed) against a null ref.
Rewritten as `use-swipe-back.test.tsx` with a two-line component that attaches the ref in JSX, which
is what a real consumer does and the only ordering the effect is written for.

**3. AIC did not come back, and the plan's Decision 2 half-reverses.**
The proxy was supposed to lift the suspension by removing the referer AIC's Cloudflare rules were
judging, and it does remove it. But the manual dev pass — the first time anyone pointed the finished
proxy at a real AIC row — got a `502`. Direct measurement found `www.artic.edu` returning `403` with
`cf-mitigated: challenge` and a "Just a moment..." body to *everything* from this network: the IIIF
URLs, §2.2's own control URL that returned 200 that morning, a desktop-Chrome user-agent, and the
plain homepage. That is a Cloudflare **interactive JS challenge**, and no server-side fetch can ever
pass one — there is no header to send, only a script to run. `api.artic.edu` is unaffected (200), so
ingestion would have gone on adding rows nobody could see.

So `aic` went back onto `SUSPENDED_SOURCES`, which is the state the list exists for. The proxy is
not wasted and not wrong — Met, CMA and Wellcome all verified streaming through it — it just turned
out to be aimed at a mitigation AIC had already moved past. Whether the escalation is permanent or
this IP earning a challenge after 08-20's 48-concurrent probe is undistinguished; the cheap test is
to retry in a day, or from another network. `HANDOFF_aic-images.md` §8 carries the commands.

**4. The e2e pill click needed a hydration wait, and the failure looked like a flake.** The authed
test clicked "Save to collection" and timed out waiting for a sheet that never opened — twice in
seven runs. The pill is server-rendered before React attaches to it, so an early click lands on
inert markup and vanishes. This is precisely the trap `e2e/support.ts`'s `waitForHydration` was
written for on the landing form; the fix was to point it at the toolbar (`nav[aria-label='Ambit
toolbar']`). Six consecutive green full runs since.

---

## Findings worth keeping

**The reader's structure had to be bought at ingest, not at render.** The corpus stored Wikipedia
bodies with `exsectionformat=plain`, which strips section markers — so a 50 000-character article
had no headings to typeset and would have rendered as one undivided slab. The fix is two-part and
neither part is optional: flip the adapter (going forward) *and* backfill (the 2 200 rows already
there). The parser degrades to all-paragraphs on a marker-less body, which is what let T1 ship and
be tested days before the backfill ran.

**The image proxy is the right shape even though it didn't fix AIC.** Every client-side attempt was
doomed, because the thing Cloudflare objected to — a `localhost` referer — is not something a
browser lets you unset. Moving the fetch to the server doesn't *work around* the rule; it removes
the input the rule reads. That reasoning holds; AIC simply stopped using that rule. What the route
did buy, immediately and permanently: one origin for every image (which is what makes the
Save-image row possible at all), a place to put resizing and caching in 7.3, and immunity to the
*next* source that decides it doesn't like our referer.

**And a lesson about diagnosis, cheaply learned.** §2.2 was measured carefully — 20/20, both
directions — and was still the wrong thing to build against by the time the build finished, because
nobody re-ran the control. The dev pass caught it in one `curl`. Re-measure the premise before
declaring the fix, especially when the premise is somebody else's live infrastructure.

**The security property to protect there is "item id in, never a URL."** An image proxy that
dereferences caller-supplied URLs is an SSRF gadget pointed at whatever the app server can reach.
The route resolves the URL from our own table and nothing else, and says so in a comment, because
the "helpful" `?url=` escape hatch is exactly the kind of thing a later change adds without noticing.

**`wanderNext` is safe by construction, not by care.** The teaser renders for strangers, so it can't
be personalized — and it *can't be* rather than *isn't*: the procedure takes no user id, walks only
checked-in config, and returns `{id, title, reason}`. There is no parameter through which user data
could arrive, which is a much stronger guarantee than remembering not to pass one.

**The receipt move's correctness rests on one non-obvious fact.** Acks now land *after* the cursor
anchor of the page they belong to, where they used to land exactly on it. The reason a refetch still
reproduces its page is that the exclusion filter is `served_at < anchor(N)` and page N's own acks
are later than `anchor(N)` — so the page cannot exclude itself. That argument is written into
`services/feed.ts`'s cursor design note and SPEC §7, and `feed.integration.test.ts`'s
fetch → ack → refetch test is the thing that would catch it breaking.

**A `data:` bypass beats teaching the proxy to handle `data:`.** The e2e corpus seeds inline base64
pixels as `imageUrl`. Branching in the client (`startsWith("data:")`) is two lines; the alternative
is a proxy that dereferences a URL scheme, which is the opposite direction from the SSRF boundary
above.

**Unrelated log noise, recorded rather than chased.** The dev server emits a handful of
`unhandledRejection: Error: aborted` / `ECONNRESET` lines during an e2e run when the browser
abandons in-flight requests mid-navigation. It predates this phase (it reproduces with 5.7's
working-tree changes stashed) and no test is affected. The proxy now joins `req.signal` into its
upstream fetch, which is correct on its own merits — stop pulling bytes for a reader who left — but
it did not change the count, so the noise is not coming from there.

---

## Deviations from the plan, all deliberate

- **T6 kept `BackToFeed` mounted** (as the plan instructed) so the e2e suite stayed green mid-phase;
  T7 deleted it and rewrote the one e2e test in the same commit.
- **The `?from=` validation lives in an exported `sharedByName`**, not inline in the page — same
  rules, but testable on their own and impossible to half-apply at a second call site.
- **`feed.integration.test.ts` grew an `ack()` helper** rather than inlining `markSeen` calls: the
  helper *is* the statement that these tests now play the client's part, and a future test that
  forgets it will simply be served the same items again, which is correct behavior rather than a bug.
- **`db/feed.integration.test.ts` was widened to cover `drawFromTopic` too** and renamed accordingly.
  With `SUSPENDED_SOURCES` empty its loops assert nothing today — that's the point: the day a source
  is switched off again, it fails if either draw path forgot to filter.
- **The e2e OG fixture is a fourth item** (see above).

---

## Verification

- `bun run check` green before every commit; 42 files / 395 tests at the end of T8.
- `bun run e2e` — **six consecutive green full runs** after the hydration fix, against the repo's
  three-run flake bar. 22 tests (14 feed/auth/home, 8 item).
- Backfill: `--limit 5 --dry-run` first (which correctly skipped a leftover `test-feed-*` fixture row
  with a non-numeric `source_id`), then the full 2 200-row run against the dev DB.
- Manual dev pass: both variants render signed-out with credit line, teaser and CTA; the proxy
  streams real bytes for Met / CMA / Wellcome rows; AIC 502s, which is what re-opened the
  suspension.

## Still open

- **The iOS device pass**, which the Done bar names explicitly. Four things to judge on the phone:
  the swipe-back's rubber-band follow and commit; that back from a feed-tapped item restores the
  exact feed (pop, not push); that Save image lands in the camera roll through the share sheet; and
  whether AIC images load on the phone — though the laptop measurement above has largely pre-empted
  that one (`HANDOFF_aic-images.md` §8.2: a host-wide challenge explains both the phone's 08-18
  behaviour and today's, with one mechanism).
- **OG preview against a real scraper.** The meta tags are asserted in e2e, but nobody has pasted a
  `/i/{id}` URL into a preview debugger — and `og:image` resolves against `BETTER_AUTH_URL`, so this
  can only really be checked once there's a deployed origin (`HANDOFF_aic-images.md` Q3, same
  dependency).
- **AIC.** Retry `curl -sI https://www.artic.edu/` in a day or two, and from a different network
  sooner — that distinguishes "they escalated" from "this IP is in the doghouse". Un-suspending is
  one line.
- **The 60 items stuck on `topic_id = test-feed-topic-*`** — noted in log 08-20, still a separate
  cleanup. The backfill's dry run bumped into one of them.

## Not in this phase, on purpose

- Blog link-card extras — the blurb and the heavier link-out treatment — are **6.3**. The credit line
  generalizes now; the blog-specific framing does not.
- Gallery entry from the hero tap, and the `sheet-gallery` animation, are **5.8**. The hero
  deliberately has no tap handler until then: an affordance that invites a tap and does nothing is
  worse than no affordance.
- Image resizing, IIIF sizing, and a CDN cache layer in front of the proxy are **7.3**.
