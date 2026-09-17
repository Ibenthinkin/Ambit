# Handoff — CI's `e2e` job has been red on `main` since 09-07-26

_Written 09-17-26 for a cold Fable session. Purpose: find why, fix it, and get `main` green, so
PR #20 (8.2 T1+T2, `feat/8.2-ops`) can merge on a green check as the 8.2 plan requires. Ben's
call: investigate before merging, in a separate session._

> **Resolved 09-17-26** on `fix/e2e-fixture-corpus`: three fixture causes (no memberships in
> `item.spec.ts`, one shared fixture source under `sourceCap`, seed counts sized for three-tile
> pages). The write-up is `log.md` 09-17-26. Kept as history.

## The state you inherit

- **`main`** — `a8b273b` + this doc. Local checkout clean. CI red on every push since 09-07.
- **PR #20 / `feat/8.2-ops`** — pushed, **not merged**. `check` job green; `e2e` fails the same
  two tests `main` fails, nothing more (46 passed, 2 failed). Do not merge it until this is done,
  and do not rebase it; merge `main` into it once `main` is green and let CI re-run.
- **Nothing is deployed** from either. Production (`https://ambit.benreilly.io`) is unaffected —
  this is a test/CI problem until proven otherwise.
- `bun run check` locally is green (1,323 tests; the documented cursor-stability flake fails ~1 in
  3 runs here — CLAUDE.md explains it, it is not this).

## The two failures today (CI run 35248408387, identical on `main`'s 35246698237)

Both fail all three attempts (Playwright retries 2), so they are deterministic in CI.

1. **`e2e/item.spec.ts:455`** `[chromium]` — *from the feed: tile → item → swipe → Escape returns
   to the intact feed, drawing nothing*. After `signIn`, line 469
   `await expect(page.locator("[data-feed-id]").first()).toBeVisible()` → **element(s) not found**
   (5 s). The feed rendered **no tiles at all**.
2. **`e2e/desktop.spec.ts:61`** `[desktop]` — *sign-up card is centered, the feed packs four
   centered columns*. Sign-up + `completeOnboarding(["Astronomy","Botany","Music"])` works, the
   first tile is visible, four column divs exist, but line 93
   `expect(Math.min(...perColumn)).toBeGreaterThan(0)` → **received 0**: at least one of the
   four columns is empty. The page has **fewer than four tiles**.

Common shape: **a CI feed page composes with too few items** (zero in one case, < 4 in the other).

## History — when it went red

`gh run list --branch main` — last green `49299a0` (09-05 21:36); first red `2e1afe6` (09-07
23:21), a single push carrying **54 commits** (`git log --oneline 49299a0..2e1afe6`). The failing
set has changed as the specs changed, but it has always been "the feed has no/few tiles":

| Run | Commit | Failed |
|---|---|---|
| 34169746502 | `2e1afe6` 09-07 | `feed.spec.ts:98` a new user … lands on a **populated** feed |
| 34304717210 | `4c6c6bf` 09-09 | that + `gallery.spec.ts:169` (tile → gallery) + `saved.spec.ts:271` + `desktop.spec.ts:59` four columns |
| 34523961522 | `8461f72` 09-10 | same four |
| today | `a8b273b` | `item.spec.ts:455` (the gallery test's successor) + `desktop.spec.ts:61` |

Why nobody saw it: **local `bun run e2e:prod` was green** (49/49 on 09-08, 56 on 09-12), and
branch pushes run no CI. Local e2e runs against the **dev database, which holds the real
~170k-item, many-source corpus**; CI runs against a fresh Postgres holding `db:seed` topics plus
the e2e fixtures only. Anything that makes the feed depend on *corpus variety* passes locally and
starves in CI. (Worth confirming first — `playwright.config.ts` / `e2e/support.ts:80-92` for which
DB each uses.)

## The lead (a hypothesis — verify it, don't assume it)

**`sourceCap`** — `b088393 feat(feed): sourceCap — no source gets more than three cards a page`,
one of the 54 commits. `DEFAULT_KNOBS.sourceCap = 3` (`services/feed-knobs.ts:78`), enforced as a
**hard filter across every tier** (`services/feed.ts:465`, `:580-592`). And every e2e fixture item
is **`source: "e2e"`** (`e2e/support.ts:214` `seedFeedCorpus`). So a CI page can hold at most
**three** fixture cards:

- three tiles over four columns → one empty column → `desktop.spec.ts:61` exactly;
- `feed.spec.ts:98` "populated" plausibly asserts more than three.

What it does **not** yet explain: `item.spec.ts:455` sees **zero** tiles, not three. Candidates
to check against that one (all also in the 54): the seen-item exclusion (an earlier test in the
same file, same user, may already have been served the few drawable fixtures), `sourceCap`
combined with "no adjacent same-source" (`lastSource`), the **WILD tier** (`97735ba`), the
membership join (fixtures must write `item_topic` — `writeMemberships` exists, 09-11), or
`SUSPENDED_SOURCES` / feed-time source filtering. Read `onFeed` in `feed.spec.ts` and whatever
user/seed `item.spec.ts` uses before guessing.

## How to work it

1. **Reproduce CI's shape locally, not the dev DB's.** A throwaway Postgres (a second compose
   service or `docker run -p 5433:5432 postgres:17-alpine`), `db:migrate` + `db:seed` against it,
   then `DATABASE_URL=… bun run e2e:prod` for just the two specs
   (`--project chromium e2e/item.spec.ts`, `--project desktop e2e/desktop.spec.ts:61`). **Red
   locally in that shape is the first milestone**; don't fix anything before it. Mirror the env
   `.github/workflows/ci.yml:90-120` sets.
2. **`superpowers:systematic-debugging`** — root cause before a fix. `FEED_DEBUG` / `FeedPage.debug`
   says why a page composed short.
3. **The fix probably belongs in the fixtures, not the engine.** `sourceCap` is a deliberate
   product rule (CLAUDE.md, "first big walk's three lessons"). If it is the cause, the honest
   repair is a fixture corpus that looks like a corpus — several `source` values — not a knob
   override in tests or a weakened assertion. **No test is weakened to pass** (8.2 Global
   Constraints; SPEC §12). If the engine turns out to be wrong for a thin corpus (a real reader on
   a young deploy could hit the same wall), that is a finding for Ben, not a quiet change.
4. `bun run check` + `bun run e2e:prod` (dev DB) + the CI-shaped run all green → commit on a plain
   branch off `main` (not a worktree), PR, **CI green**, merge. Then `git checkout feat/8.2-ops &&
   git merge main && git push` so PR #20 re-runs; merge it on green.
5. `log.md` — extend the day's entry (format and the spend line in CLAUDE.md). And **add a
   one-line CLAUDE.md local-dev note** on the lesson: local e2e runs against the real corpus, CI
   against fixtures; a branch push runs no CI.

## After PR #20 merges — unchanged, Ben's hands

Set `OPS_EMAIL` in Coolify, deploy in daytime once `img-warm-round4` has finished
(`ssh ben@192.168.1.202 'cat ~/img-warm-round4.log'`), read `/api/health` (`"ingest":"never"` until
the next nightly). Details: `docs/PHASE8_WALKTHROUGH_8.2.md` → "Next — Ben's hands".
