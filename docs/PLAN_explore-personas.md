# Plan — a persona for every signed-out visit

Step 0 of execution: copy this file to `docs/PLAN_explore-personas.md` (Ben's convention: plans
live in `docs/`, self-contained, runnable cold by a cheaper session) and commit it.

## Context

`/` is the explore feed, and `feed.explore` composes it for "nobody": `getFeedPage(null, …)` falls
to `coldStartWeights()`, uniform weight over the sixteen original topics. Every page is an even
smear of everything, so the first thing a stranger sees has no centre of gravity. Ben: "the generic
feed is just boring".

The fix: each signed-out visit is dealt one of the twenty hand-written personas
(`src/server/config/personas.ts`) and the page composes from that persona's picks. Ben's added
requirement: the personas must keep up as the topic vocabulary grows and changes. Two decisions
he made for that:

1. **Personas name umbrella groups** (`config/topic-groups.ts`) plus optional single topics, so a
   topic promoted and filed into a group reaches every persona holding that group with no edit.
   Guard tests fail on a stale group/topic id and on a group no persona holds.
2. **The seeded persona accounts follow on every boot**, so signing in as a persona shows what a
   visitor dealt that persona sees.

Out of scope (offered, not asked for): telling the visitor which persona they got; keeping the
same persona across reloads.

## Branch

Plain branch `feat/explore-personas` off `main`. The checkout is on `feat/publications` (unmerged,
unrelated) with an uncommitted `topic-groups.ts` edit that is Ben's — do not commit, stash-drop or
revert it. If another session holds the checkout, use a worktree. Note that Ben's edit may rename
a group id; resolve persona group ids against whatever `main` has at build time.

## Tasks

### 1. Personas name groups — `src/server/config/personas.ts`

- `Persona` gains `groups: readonly string[]` (ids from `TOPIC_GROUPS`); `topics` stays, now
  meaning "single topics on top of the groups" and may be empty.
- New pure export `personaTopics(p: Persona): string[]` — the union of each named group's
  `topics` and `p.topics`, de-duplicated. This is the one place a persona becomes topic ids.
- Rewrite the twenty entries by hand: for each current pick, name its group (`groupOf()` in
  `topic-groups.ts`) where the persona plausibly wants the whole group; keep it as a single topic
  where the group would blur the taste (e.g. Maren keeps `furniture` rather than all of
  "Everyday things"). Keep each persona to roughly 2–4 groups + 0–3 topics so the tastes stay
  distinct. Preserve the comparison pairs described in the file header, and update that header.
- All 34 groups must be held by at least one persona (see test), including the six place groups.

### 2. Guard tests — `src/server/config/personas.test.ts`

Replace/extend the existing pins:

- every `groups` id is a `TOPIC_GROUPS` id; every `topics` id is a key of `TOPIC_FACETS` (existing);
- every persona resolves to at least three topics (`personaTopics`), the onboarding floor;
- **every group in `TOPIC_GROUPS` is named by at least one persona** — the growth guard: a new
  group fails `bun run test` until someone decides whose taste it belongs to;
- no persona lists a single topic already covered by one of its own groups (keeps the file honest).

Also add one line to `scripts/promote-topics.ts`'s closing reminder (near line 183): a new *group*
needs a persona, and the test says so.

### 3. Deal a persona to the signed-out visitor — `src/server/services/feed.ts`

- New pure, exported `personaForSeed(seed: number): Persona` → `PERSONAS[seed % PERSONAS.length]`.
  The cursor already carries `seed`, so all pages of one visit are the same reader and a reload
  deals again. Nothing is stored; `feed.explore` still reads and writes nothing about the caller.
- New exported `exploreWeights(seed, existingTopicIds: ReadonlySet<string>): Map<string, number>`:
  `personaTopics(personaForSeed(seed))` intersected with `existingTopicIds`, each at weight 1;
  if fewer than three survive, return `coldStartWeights()`. (CI's database has the sixteen
  originals only; production can be behind the config between a deploy and a promotion.)
- In `getFeedPage` (≈ line 950): for `userId === null`, fetch the existing pickable ids with
  `listTopics()` (`src/server/db/topics.ts`, ~160 small rows) and use `exploreWeights(seed, ids)`.
  A signed-in user with no picks keeps `coldStartWeights()` exactly as today.
- Under `FEED_DEBUG`, put the persona's slug in `FeedPage.debug` so `/dev/feed`-style inspection
  and tests can see who was dealt.
- Update the comments at `feed.ts` ≈ 950 and `routers/feed.ts` ≈ 94–108 ("composes for nobody",
  "uniform over the sixteen originals") — the page is still for no *account*, but no longer generic.

Known and accepted: weights are flat at 1 per topic, so a persona holding an 18-topic group draws
from it far more than from a singleton — the same open item recorded for real readers under topic
groups. Do not solve it here; note the persona feeds as a second place to judge it.

### 4. Persona accounts follow on boot

- `src/server/services/persona-seed.ts`: use `personaTopics(p)` for `want`; extract the
  "rows differ → `setUserTopics`" half into `syncPersonaTopics()` which **only updates accounts
  that already exist** (no invite, no sign-up, no password) and filters `want` to topics that
  exist in the database (`setUserTopics`/`setMine` refuse unknown ids). `seedPersonas` calls it.
- `scripts/seed-topics.ts` (`db:seed`, run at every container boot): call `syncPersonaTopics()`
  after the facets are applied; print one summary line. A database with no persona accounts
  (CI, a fresh machine) is a no-op.
- Extend `persona-seed.integration.test.ts`: sync updates an existing account, creates none.

### 5. Tests for the feed change

- `src/server/services/feed.test.ts` (unit): `personaForSeed` is stable for a seed and covers all
  twenty over seeds 0–19; `exploreWeights` returns the persona's existing topics, and falls back
  to the uniform cold start when fewer than three exist.
- `src/server/services/feed.integration.test.ts` (≈ line 266, the explore block): a null-user
  page composes a full page, and two pages from one cursor chain report the same persona.
- `src/server/api/routers/routers.test.ts` (≈ line 504): existing explore pins still pass
  (anonymous, session ignored, cursor cap, non-strict input).
- `e2e/explore.spec.ts` should need no change — in CI the fallback is what runs. Confirm, don't assume.

### 6. Docs

- `SPEC.md` §9 (cold start / explore) and §7 (`feed.explore`): the dealt persona and the fallback.
- `docs/DESIGN_topic-facets-and-personas.md` §4: personas name groups; they are now also the
  signed-out feed; the boot sync.
- `CLAUDE.md`: one Architecture bullet; `log.md`: the day's entry with the session-spend line.

## Verification

1. `bun run check` (typecheck, lint, format, unit + integration).
2. Dev server on port 3000 (`lsof -ti:3000` first), signed out, open `/` several times: each reload
   should have a visibly different centre of gravity; scrolling within one load stays in character.
   With `FEED_DEBUG`, the page's debug block names the persona.
3. `bun run db:seed` locally, then sign in as two personas and compare with the explore feed dealt
   the same slug.
4. `bun run e2e:prod`, then the CI-shape run from CLAUDE.md (fresh Postgres on a spare port,
   `db:migrate && db:seed && build && E2E_PROD=1 bunx playwright test --workers 1`) — this is the
   run that exercises the sixteen-topic fallback.
5. `bun run bench:feed` — the null-user path adds one small query; confirm p50 has not moved.

No migration. Not merged or deployed by this plan; Ben looks first.
