# Usage data for the beta — design

**Written:** 10-09-26 (overnight) by Fable 5.1, from Ben's ask before sleep: "a strategy and plan
to gather usage data in a non-invasive way so that I can see how people are using the app in
beta." Every decision below is a crack at it for the morning; the ones most likely to be
overruled are marked ⚖️. **Status:** every ⚖️ ruled with Ben 10-09-26 (morning); approved for the plan,
`docs/PLAN_usage.md`, straight through both cuts. Nothing is built.

## Why

The beta week (8.2 T6) has been open since 09-20 and the only witness of how anyone uses Ambit
is `seen_item`, `saved_item` and whatever a friend texts back. Read tonight on production: three
accounts have ever been served a page, one of them Ben's (4,610 of 4,787 rows). When the next
invites go out, "how do people actually use it" needs an answer that does not depend on asking
them — and it needs one that fits the app. Ambit is the antidote to the feeds that watch you;
its own measurement has to be the kind a reader would nod at if they read it.

## The posture (what "non-invasive" means here)

1. **First-party only.** No third-party script, pixel, SDK or hosted dashboard. The data lives
   in Ambit's own Postgres beside the saves, is read by a script Ben runs, and leaves the box
   only as a digest Ben reads. (The CSP already forbids any other origin; this keeps it so.)
2. **Behaviour, never identity.** No IP address, no user agent, no screen size, no language,
   no location, no referrer URL (only its *class*), no URL or query string, no free text. A
   device is `phone` or `desktop` — the one axis the app already branches on (`useMediaQuery`'s
   `md`) — and nothing finer.
3. **Named events, closed vocabulary.** The app records *that* a thing was done — a screen
   opened, a picture zoomed, an "Original post" button pressed — never a stream of scroll
   positions, mouse moves or timings finer than a second. The vocabulary is one config file a
   reader could read (`src/config/usage.ts`); the server refuses anything outside it.
4. **Told in person, and switched off after the beta.** Ben's ruling (10-09-26): no Settings
   toggle, no paragraph in the install note, no public list in the repo. He tells every person he
   invites what is recorded when he invites them, and **the recording is turned off when the beta
   ends** (one env flag, Cut 1 Task 8 — the provider mounts nothing without it). A reader who
   asks for it off during the beta gets it by hand (their rows deleted, their id in a skip list).
5. **Kept short, read by one person.** Rows older than 90 days are deleted by the same script
   that reads them. Nothing at request time reads this table; it cannot change what a reader
   sees.
6. **Signed-out visitors are counted, not followed** (ruled 10-09-26). A visit through a shared link records
   which public screens opened under a per-tab random key and no user, so the share → sign-up
   funnel is visible; nothing links two visits.

One thing to know that is *more* invasive than anything here: Better Auth's `session` table
already stores `ip_address` and `user_agent` for every sign-in (its default). Nothing reads
them. Left as is (ruled 10-09-26): they expire with the session.

## What already answers (Cut 0 — no schema change)

Most of what Ben wants is already in the database and has never been reported:

| Question | Where it already is |
|---|---|
| Who is active, which days, how many items a sitting | `seen_item.served_at` per user (a gap > 30 min = a new sitting) |
| How much of the corpus a reader has moved through | `seen_item` count per user |
| Do they save; into what | `saved_item`, `collection` |
| What they picked, and how the feed has learned | `user_topic` (no timestamps — see Cut 1) |
| Did they finish onboarding, retake it, type anything | `interview_answer` (`run_id`, `text`, skips), `user_taste` |
| Sign-ins per day | `session.created_at` |
| Are sources over-shown vs their corpus share | `seen_item ⋈ item.source` against `item` per source |

**Cut 0 is a report over these tables** — `bun run usage:report` — and ships first, before any
new column. It is also the baseline the event table is judged against: if a week of Cut 0 answers
Ben's questions, Cut 1 waits.

## What is missing (Cut 1 — the `usage_event` table)

Things no table records today, each tied to a question Ben has actually asked this month:

| Missing | Why it matters |
|---|---|
| Which screens open, how long a visit lasts, phone or desktop | "how are people using the app" at all — Saved, Topics and Settings are invisible today |
| Item opens and *where from* (feed tile, rail swipe, Saved, a shared link, the hang) | the item screen is the product's second half; swipe depth is the wander's whole value |
| Link-out, share, zoom, magazine view | three redesign decisions (the 40 px "Original post" button, the share row, the spread) were made blind |
| Topic edits on Profile → Topics | `user_topic` has no timestamp, so "do people tune their topics" cannot be answered |
| Onboarding step reached | `interview_answer` is written only on completion — abandonment is invisible |
| Install, the install card's fate, offline opens | the PWA flow (5.11) has never been observed in the wild |
| Unsaves | a deleted `saved_item` row leaves nothing |
| Client-side errors | `instrumentation.ts` sees server throws only |

### The table

```sql
usage_event (
  id          text primary key,             -- nanoid
  user_id     text null references "user"(id) on delete cascade,
  visit       text not null,                -- per-tab random key (sessionStorage); groups a sitting
  kind        text not null,                -- closed set, config/usage.ts
  at          timestamptz not null,         -- client clock, clamped server-side to [now-1h, now]
  screen      text null,                    -- route *name* (feed, item, saved…), never a URL
  item_id     text null references item(id) on delete cascade,
  topic_id    text null references topic(id),
  meta        jsonb null                    -- per-kind, closed keys, validated (below)
)
index (user_id, at); index (at)
```

No `ip`, no `ua`, no `url`, no `referrer`, by construction — the columns do not exist.

### The vocabulary (v1, fourteen kinds)

| kind | screen / item / topic | meta (closed keys) |
|---|---|---|
| `visit.start` | entry screen | `device: phone\|desktop`, `standalone: bool`, `via: direct\|link\|internal` |
| `visit.end` | — | `seconds: int` (visibility-aware active time) |
| `screen.open` | screen ∈ landing, explore, feed, item, saved, collection, profile, topics, edit, settings, onboarding, reveal, offline | — |
| `item.open` | item | `from: feed\|rail\|saved\|wander\|link\|explore\|hang` |
| `item.linkout` | item | — |
| `item.share` | item | `method: share\|copy\|image` |
| `item.zoom` | item | — |
| `item.magazine` | item | `on: bool` |
| `item.unsave` | item | — |
| `topics.edit` | topic | `action: add\|remove\|little\|some\|lot` |
| `onboarding.step` | — | `step: 1..8`, `action: answer\|skip\|back` |
| `onboarding.retake` | — | — |
| `pwa.install` | — | `how: prompt\|card\|appinstalled` |
| `client.error` | screen | `digest: string(≤32)` |

Deliberately **not** events: a feed page (that is `seen_item`), a save (`saved_item`), a sign-in
(`session`), onboarding completion (`interview_answer`), a scroll, a hover, a tile's lift.

### Transport

A tiny client queue (`lib/usage.ts`): `track(kind, props)` appends; the queue flushes every
15 s, at 50 events, and on `pagehide` / `visibilitychange → hidden` — the last two through
`navigator.sendBeacon`, which survives a closing tab where a `fetch` from `pagehide` is dropped.
The target is a **route handler**, `POST /api/usage`, not a tRPC mutation: a beacon carries a
plain JSON body and no tRPC envelope, and the handler can answer `204` to anything (a usage
beacon must never produce an error a client would retry). Server side: the session from the
cookie (`auth.api.getSession`), zod over the closed vocabulary, ≤ 50 events, `at` clamped to the
last hour, `Origin` must equal the app's own origin (the cheap CSRF check — a forged beacon could
only write usage rows for the victim, but there is no reason to allow it), and the existing
`RateLimiter` at 30 beacons/min per user or IP. Invalid input is dropped, counted in one log
line, and still answered `204`.

### Reading it

`bun run usage:report [--days 7] [--prune]` prints one markdown digest — the Cut 0 sections plus,
from the event table: visits and median active minutes; screens per visit; item opens per visit
and swipe depth (`item.open` runs with `from: rail`); link-out, share, zoom and magazine rates per
item opened; topic edits; the onboarding funnel (readers reaching each step, and where they
stopped); installs and the install card's fate; phone / desktop split; errors by digest. Personas
(`config/personas.ts`) and e2e accounts (`ambit-%@example.com`) are excluded by email, so Ben's
twenty chairs never count as readers. `--prune` deletes rows older than 90 days. Run over ssh
in the container, like `invite`. `--mail` sends the same digest to `OPS_EMAIL` through the
existing mailer (ruled 10-09-26: built in Cut 1, run by hand); the Sunday Coolify task that
schedules it waits until the digest's shape stops moving.

## Alternatives considered

- **Plausible / Umami, self-hosted.** A third container on VM 202, a script tag and a CSP change,
  for page views by URL — blind to every gesture in the table above and the funnel inside
  onboarding (one route). Rejected: more infrastructure for less meaning.
- **Cloudflare Web Analytics.** Free and cookieless, but a third-party beacon and the data on
  Cloudflare's side — against posture 1. Rejected.
- **Reading the server log.** The tRPC timing line already prints every procedure call; Docker
  keeps it for a container's lifetime and it has no reader identity beyond the procedure. Rejected
  as the primary source; it stays the debugging view.
- **Only the existing tables (Cut 0 forever).** The real contender — it may be enough. That is
  why it ships first and alone.

## Open for Ben

1. ~~The Settings toggle~~ — **ruled 10-09-26: none, and no note; Ben tells invitees in person;
   recording is switched off after the beta.**
2. ~~Signed-out visits~~ — **ruled 10-09-26: kept as drafted** (posture 6; `visit.*` and
   `screen.open` under a per-tab key, no user, nothing else).
3. ~~The install note's wording~~ — none (decision 1).
4. ~~The weekly mail~~ — **ruled 10-09-26: the CLI gains `--mail` in Cut 1** (the same
   markdown through `services/mailer.ts` to `OPS_EMAIL`, run by hand); the Sunday Coolify task
   waits until the digest's shape stops moving.
