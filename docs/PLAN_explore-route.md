# `/explore` — a signed-out taste of the feed

> **09-26-26, the same evening it shipped: this is `/` now.** Ben, after the phone look with the
> toolbar: "I like the /explore landing page, let's switch that to be the default." `app/page.tsx`
> is the explore page, `/explore` is a permanent redirect to it, and the reel landing this plan
> was written beside is parked whole at `/dev/landing` (`app/dev/landing/page.tsx`, dev-gated;
> `components/landing/` untouched; `e2e/home.spec.ts` drives it against the dev server). Read
> `/explore` below as `/`. SPEC §8.1 has the current description.

## Context

Today a signed-out visitor at `/` sees the landing overture + reel, then the sign-in sheet — they
never touch the actual product. Ben wants to try a second front door: the **real feed, readable
without an account**, with calm message blocks mixed in (sign in · sign up · "what is this?"),
capped at ~200 feed images and ~100 swipes in the item screen's rail. Still invite-only — this is
a taste, not open sign-up. It lives at a **separate route, `/explore`**, so it can be A/B'd against
the current landing; `/` is untouched.

Decisions (Ben, 09-26-26):
- **Feed = broad sampler**: the existing cold-start path (`coldStartWeights()`, uniform over the
  sixteen originals, DRIFT/JUMP/WILD reach the rest). Nothing stored per visitor.
- **Sign up = the existing card as-is**; an uninvited email gets today's "invite-only" error. The
  "what is this?" dialog explains invites.
- **Caps are soft, per visit**: counted client-side (+ a server page backstop). Reload resets.
- **Gallery = the item screen's wander rail** (`/i/[id]`, `ItemScreen`/`HeroRail`).
- **At the cap: an end card** — "That's the taste" + the three actions; the rail ends on the same card.
- **Cadence: one message block per page (~12 cards)**, rotating sign-in → sign-up → what-is-this.
- **Copy: drafted below**, in one config file Ben edits.

Execution note (Ben's convention): first copy this plan to `docs/PLAN_explore-route.md`, work on a
plain branch `feat/explore-route` off `main`, commit per task.

## Design

### Server — one new public procedure
- `src/server/services/feed.ts` `getFeedPage(userId: string | null, …)`: when `null`, skip
  `getUserTopicWeights`/`getTasteKeywords` (→ `coldStartWeights()`, no taste keywords) and pass
  `userId: null` into eligibility. Everything else (seed, cursor, plan→fetch→compose, fallback) is
  shared, byte for byte.
- `src/server/db/feed.ts` `eligibilityConditions`: `userId: string | null`; when null, omit the
  `notSeenBeforeAnchor` subquery. Same type change on `getTopicPools`/`getWildPool` opts. Repeats
  across adjacent pages are still stopped by the cursor's `prev`; occasional repeats further apart
  are acceptable for a 200-image taste (and the client dedupes by id, below).
- `src/server/api/routers/feed.ts`: new `feed.explore` **`publicProcedure`**, input
  `{ cursor?: string ≤4096 }` (no knobs), returns `getFeedPage(null, cursor)`. **Server backstop:**
  if the decoded cursor's `page ≥ EXPLORE_MAX_PAGES` (= 24, ~288 cards, comfortably above 200
  images) return `{ cards: [], nextCursor: undefined }` without composing. Rate-limited by the
  existing `rateLimitMiddleware` (120/min per IP) — no new limiter. No `markSeen` for anon.
- Constants in a new client-safe leaf `src/config/explore.ts`: `EXPLORE_FEED_IMAGE_CAP = 200`,
  `EXPLORE_RAIL_CAP = 100`, `EXPLORE_MAX_PAGES = 24`, plus the copy (below).
- SPEC §7/§11 and `items.ts`'s header comment: `feed.explore` is the **fourth deliberate public
  exception**, with its test named at the end of the bullet (SPEC §11 convention).

### Route
- `src/app/explore/page.tsx` (server): if a session exists → `redirect("/feed")` (same rule as
  `/`). Otherwise `void api.feed.explore.prefetchInfinite({})`, pass `topicLabels`, render
  `<HydrateClient><ExploreScreen/></HydrateClient>`. `metadata.robots = { index: false }` while it's
  an experiment. Not added to `proxy.ts` `AUTHED_PREFIXES` (it isn't authed). The service worker
  already treats it as NetworkOnly — no change.

### Client — share the grid, don't fork FeedScreen
`FeedScreen` is authed through and through (`feed.page`, `markSeen`, `TileActions`, `ItemSheet`,
`Toolbar`, dev knobs) and its hooks can't be switched conditionally. So:
1. **Extract** the masonry + infinite-scroll sentinel + tile rendering from
   `src/components/feed/feed-screen.tsx` into `src/components/feed/feed-grid.tsx` (`FeedGrid`:
   props `pages`, `hasNextPage`, `isFetchingNextPage`, `fetchNextPage`, `topicLabels`, and
   optional render hooks for the authed extras — `renderTileExtras?(tile)` for `TileActions`,
   `onLongPress?` for `ItemSheet`, `renderMessage?(tile)` for message tiles). `FeedScreen` becomes
   query + ack + sheets + toolbar around `FeedGrid`. Pure refactor — `/feed` must be unchanged
   (existing feed-screen tests + e2e are the proof).
2. **`masonry.ts`**: new `FeedTile` kind `{ kind: "message"; key: string; message: MessageKind }`
   (`"signin" | "signup" | "about" | "end"`). `buildTiles(pages, topicLabels, opts?)` gains
   `opts.messages?: boolean`; when on, insert one message tile per page at a fixed in-page position
   (after the 4th card, so it's never the first thing seen), kind = `["about","signup","signin"][pageIndex % 3]`
   (lead with "what is this?" on page 0). Add its case to `estHeight`. Dedupe cards by `item.id`
   across pages when `messages` is on (the anon feed has no seen-exclusion).
3. **`src/components/explore/message-tile.tsx`**: modeled on `because-tile.tsx` (35 lines) —
   quiet card, same corner radius/tokens, one line of copy + one button. Buttons call
   `onAction(kind)`.
4. **`src/components/explore/explore-screen.tsx`** (`"use client"`):
   - `api.feed.explore.useInfiniteQuery({}, { getNextPageParam, staleTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false })`
     — input `{}` byte-identical to the RSC prefetch (same hydration contract as `/feed`).
   - Counts image cards across pages; once ≥ `EXPLORE_FEED_IMAGE_CAP`, stop calling
     `fetchNextPage`, trim the tile list at the 200th image, and append a `message` tile of kind `"end"`.
   - ~~Header: the wordmark top-left and a small **Sign in** text button top-right (no `Toolbar` —
     it links to profile/collections).~~ **Superseded 09-26-26 (Ben):** the header is gone and the
     screen mounts the app's own `Toolbar` — Profile and Save raise the sign-up sheet, Feed
     scrolls to the top, no Share (a feed has no current item). The same sheet
     (`components/explore/auth-surface.tsx`) is mounted on both item screens for a signed-out
     visitor, whose toolbar is there too: Share as anyone's, Profile and Save the sheet in place,
     Feed to `/explore`. Branch `feat/explore-toolbar`.
   - `AuthSheet` + `AuthCard` (from `components/landing/`) mounted closed; a block's sign-in /
     sign-up opens it in that mode; `onCollapse` closes it. **`AuthCard` gains an
     `initialMode?: "signin" | "signup"` prop** (default `"signin"`, so the landing is unchanged);
     remount it with a `key` per open so the mode takes effect. After success it already
     `router.push("/feed")` → `/onboarding` for a new user. Correct as-is.
   - "What is this?" → `BottomSheet` (`components/ui/bottom-sheet.tsx`, centered dialog above `md`)
     with the about copy and the same two auth buttons at the bottom.
   - Tiles link to `/i/[id]` as on `/feed`, calling `markFeedOrigin(id)` and a new
     `markExploreOrigin()` (below).

### Item screen from `/explore`
- `src/components/feed/feed-origin.ts`: add `markExploreOrigin()` / `cameFromExplore()` —
  a sessionStorage flag set when a tile on `/explore` is tapped.
- `src/hooks/use-leave-to-feed.ts`: when `cameFromFeed(itemId)` → `router.back()` (unchanged; that
  pops to `/explore` intact too). Cold-open fallback: `cameFromExplore()` → `/explore`, else
  `/feed?focus=` as today.
- `src/components/item/item-screen.tsx`: when `!authed && cameFromExplore()` (read in an effect, not
  render — same hydration rule as `useLeaveToFeed`), count rail advances in sessionStorage
  (`ambit.explore.railCount`); at `EXPLORE_RAIL_CAP` stop `extend()` (the effect at ~`:177-184`)
  and render a final rail cell that is the `"end"` message. Shared links opened cold by a stranger
  keep today's endless rail (outside the experiment; keeps the A/B clean). `JoinCta` gains a
  "Keep exploring" link to `/explore` when `cameFromExplore()`.

### Draft copy (`src/config/explore.ts` — Ben edits)
- **about block:** "What is this?" · *A quiet feed of public-domain pictures and writing.* → "Read how it works"
- **signup block:** "Have an invite?" · *Make an account and the feed learns what you like.* → "Sign up"
- **signin block:** "Already have an account?" · *Your feed, your saves, where you left them.* → "Sign in"
- **end card:** "That's the taste." · *Ambit is invite-only for now. If you have an invite, the rest is yours.* → Sign up · Sign in · What is this?
- **About dialog** (title "What is Ambit?"):
  > Ambit is an endless feed of public-domain images and articles: paintings, maps, photographs,
  > scientific plates, old magazines, from museums, libraries and a few hand-picked blogs.
  >
  > It starts with the subjects you pick, then drifts sideways on purpose into neighbouring
  > subjects, and now and then somewhere unrelated. Every picture was scored by hand-tuned curation
  > before it got in. The feed leans toward what you save, and nothing else.
  >
  > No ads, no likes, no followers, no one else's opinions. It's meant to be something you can
  > wander in and put down.
  >
  > Ambit is invite-only for now. If someone sent you an invite, sign up with that email address.

## Files

New: `src/app/explore/page.tsx`, `src/components/explore/explore-screen.tsx`,
`src/components/explore/message-tile.tsx`, `src/components/feed/feed-grid.tsx`, `src/config/explore.ts`,
`e2e/explore.spec.ts`.
Modified: `src/server/services/feed.ts`, `src/server/db/feed.ts`, `src/server/api/routers/feed.ts`,
`src/components/feed/feed-screen.tsx`, `src/components/feed/masonry.ts`,
`src/components/landing/auth-card.tsx`, `src/components/feed/feed-origin.ts`,
`src/hooks/use-leave-to-feed.ts`, `src/components/item/item-screen.tsx`,
`src/components/item/join-cta.tsx`, `SPEC.md` (§7, §11), `log.md`.

## Task order (commit each)
1. Server: nullable `userId` through `getFeedPage` / `eligibilityConditions` / pools; `feed.explore` + backstop; SPEC. Tests first.
2. `FeedGrid` extraction (pure refactor; `/feed` unchanged).
3. `message` tile kind in `masonry.ts` + `MessageTile` + `config/explore.ts`.
4. `AuthCard initialMode`.
5. `/explore` page + `ExploreScreen` (cap, end card, auth sheet, about dialog).
6. Item-screen explore origin, rail cap, leave-to-explore, JoinCta link.
7. e2e + CI-shape run + log entry.

## Verification
- **Vitest:** `getFeedPage(null)` integration (returns cards, writes no `seen_item`, ignores
  seen rows of other users); `feed.explore` router test: works with no session, backstop returns
  empty at page 24, rejects `knobs`; `buildTiles` with `messages` (one per page, rotation, not at
  index 0, dedupe); cap trim pure function; `AuthCard` renders sign-up when `initialMode="signup"`;
  existing `feed-screen.test.tsx` (the `{}` input pin) still green.
- **Playwright `e2e/explore.spec.ts`** (phone + desktop projects): signed-out `/explore` shows
  tiles and a message block; "What is this?" opens the dialog; a sign-up block opens the card in
  sign-up mode; tap a tile → `/i/…` → leave → back on `/explore`; signed-in `/explore` → `/feed`;
  `/` still shows the landing. Fixture corpus must write `item_topic` (`seedFeedCorpus`), with no
  user, so the cold-start path is what's exercised.
- `bun run test`, `bun run check`, `bun run e2e:prod`, then the **CI-shape run** from CLAUDE.md
  (fresh postgres:17 on :5433, fixtures only). Anything that depends on corpus variety shows up there.
- Manual: `bun run build && bun run start` on :3000, private window, `/explore` on the phone via the
  tailnet origin: scroll to the end card (~17 pages), swipe the rail to 100, sign in with an
  invited account → lands on `/feed`.
