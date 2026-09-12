# The list screens — a Profile hub with four tabs, faces on collections, desktop width — design

**Written:** 09-12-26 by Fable 5.1, from Ben's desktop review notes
(`docs/design_update_3/desktopPolishChecklistNotes.md`, the one-line "List screens" section) and
three questions answered in chat the same day.
**Status:** design approved 09-12-26 (the six decisions below); plan `docs/PLAN_list-screens.md`,
ready to execute cold.
**Sub-project 4 of 4** from that review. Sub-projects 1–3 (facets and personas, the merged item
screen, the chrome redesign) shipped 09-10/09-11 and went to production 09-12. This one is the
pass over everything that is a *list*: Profile, Saved, Topics, Edit profile, Settings, and the
collection rows inside every picker sheet.

## Why

The review said one thing about these screens: *"they adhere to the spec but I don't like the way
they look at all."* Asked what, on 09-12-26, Ben narrowed it:

> "I may have been a little too broad with my condemnation. For the most part, everything looks
> ok, layout wise. I don't think the settings button needs to be a little floatey thing off in
> the corner. When you go to the account page, by pressing the little colored circle button in
> the rail, let's have edit profile, collections, topics, and settings be listed across the top
> kinda like tabs, right under the profile avatar, where the 'edit profile' button currently is.
> This is definitely how it should look on the phone. Adapt that to a bigger screen size however
> you see fit."

And two of the offered diagnoses ticked: **desktop is a stretched phone** (every list screen is a
600 px column of phone rows in the middle of a 1440 px window — `Column width="narrow"`, the
desktop pass's deliberate choice for "anything list-shaped"), and **collections have no face**
(a collection is a name and a count everywhere but the Profile grid, where it is one rounded
cover — the picker rows, the Saved chips and the browse sheet never show what is in one).

What the screens are today, for the record: `/profile` is a gear in the corner, the avatar row, a
full-width outline "Edit profile" pill, a "Topics · N on ›" row, and a two-column grid of
20 px-radius square covers; `/profile/edit` and `/settings` each wear a sticky `GlassHeader` with
a back chevron and their own origin marker (`edit-origin.ts`, `settings-origin.ts`) so that
chevron can pop; `/profile/topics` has a "← Profile" text link over a title and a facet tablist;
`/saved` is chips under a glass header over a two-column masonry, and *stays* two columns at
1440 by a comment's decision. Settings also carries two shortcut cards — Edit profile and
"Everything kept" — that exist because there was no other way to those places from here.

## Decisions (with Ben, 09-12-26)

1. **The Profile screen is a hub with four tabs under the avatar**, in the order
   **Collections · Topics · Edit profile · Settings**, landing on Collections. (Ben listed
   "edit profile, collections, topics, and settings"; he approved Collections first because
   `/profile` lands there, and a first tab that is not the default reads as a mistake.)
2. **The gear goes.** Settings is a tab; nothing floats in a corner.
3. **A collection's face is a 2×2 mosaic** of its four newest pictures, square-cornered, on the
   Collections tab *and* small in the picker rows. Chosen over a single square-cornered cover
   (least work) and a Cosmos-style fanned cluster (most character, hardest to make look good
   with museum aspect ratios).
4. **The tabs are routes, not state.** `/profile`, `/profile/topics`, `/profile/edit`,
   `/profile/settings`; `/settings` redirects permanently. Deep links and every existing spec keep
   working, and a reload lands on the tab it left.
5. **Tab switches `replace` history**, the rule Saved's chips already follow: flicking between
   tabs is refinement of one screen, so the hub is one history entry and the Feed button pops
   back to the intact feed from any tab.
6. **Desktop is Ben's "however you see fit":** the hub and Saved take the feed's wide column;
   grids pack the feed's column count; form-and-row tabs sit left-aligned at a 600 px measure.
   Stated, not asked.

Calls made here and stated rather than asked: the facet selector inside the Topics tab becomes a
**chip row**, so there are no tabs under tabs; Edit profile **stays on its tab after a save**
(the header above it is the same query and updates live), where today it leaves after a
900 ms beat; Settings' two shortcut cards go (the tabs make both redundant) and its "What you
see" and "Account details" rows switch tabs in place; the Collections tab loses its
"Collections · N" heading because the tab is the heading; the four pages keep their own
`getSession` guards under the layout's, since a layout's server code runs on the document load
and not on client tab switches.

## 1. The hub — one layout, four child pages

`src/app/profile/layout.tsx` is a server layout: the session guard, a `user.me` prefetch, and
`HydrateClient` around a client **`ProfileHub`** that wraps `{children}`. React's per-request
`cache(createQueryClient)` (`src/trpc/server.ts`) means the layout's prefetch and each page's
prefetches seed one query client, so nested `HydrateClient`s dehydrate the same store.

`ProfileHub` (`src/components/profile/profile-hub.tsx`) owns everything the four tabs share:

- **`<main className="bg-bg text-ink min-h-dvh">`** and the desktop column (§6). The tabs render
  content only — no `<main>`, no `Column`.
- **The header:** today's identity block verbatim — `AvatarChip` 88 with the deterministic
  gradient, name at 28 px, `@handle` at 15 px / 45 %, bio at 14.5 px — with the same three
  branches (spinner, "Couldn't load your profile." + Try again, the block).
- **The nav**, directly under the bio where the Edit pill was:
  `<nav aria-label="Profile">` holding four `<Link replace>`s, 14 px, `gap-6`, a 2 px accent
  underline on the current one (`aria-current="page"`), `text-ink/55` otherwise, `overflow-x-auto`
  so a fifth tab one day scrolls rather than wraps. The active tab comes from
  `useSelectedLayoutSegment()`: `null` is Collections, `"topics"`, `"edit"`, `"settings"` the
  rest. Links, not ARIA tabs — they navigate, and `role="tab"` promises an in-page panel.
- **The toolbar**, on every tab (`Toolbar`: pill below `md`, rail from it): bookmark idle →
  `CollectionsSheet` anchored to the control; Feed → `leaveProfile`; Profile → no-op, you are
  here. Edit, Settings and Topics have no toolbar today; now the rail is persistent across the
  hub, as decision 3 of the chrome redesign wanted for every non-item screen.
- **One raised `Toast`**, exposed to the tabs through `ProfileHubContext` — `useProfileHub()`
  returns `{ toast(text) }`, defaulting to a no-op so a tab renders in a unit test without the
  hub. The Collections tab toasts "{name} created"; Edit toasts "Profile saved".

**Origins.** `profile-origin.ts` stays and is now the hub's marker: the rail's Profile button
writes it before pushing `/profile`, and `leaveProfile` reads it from any tab. `edit-origin.ts`
and `settings-origin.ts` are deleted with their only readers (the back chevrons) and writers
(the gear, the Edit pill, Settings' cards). Tab links use `replace`, so history never holds
two hub entries; a cold open of `/profile/settings` followed by Feed pushes `/feed`, exactly as
a cold `/profile` does today.

## 2. Collections tab — the mosaic

`/profile` (`src/components/profile/collections-tab.tsx`, the renamed grid half of today's
`profile-screen.tsx`): `NewCollectionTile` first, then one `CollectionTile` per collection, in
`GRID_COLS[useColumnCount()]` — two on the phone, three from `md`, four from `xl` (the feed's
hook and its literal class map, moved to `masonry.ts` so both screens read one). `gap-4 px-5`,
`pb-[120px]` to clear the pill. No heading.

**`CoverMosaic`** (`src/components/profile/cover-mosaic.tsx`) is the face, sized by its caller:

- **0 pictures:** the bookmark placeholder — hairline square, outline `Bookmark` — the same
  glyph-shows-the-affordance treatment as today, square-cornered.
- **1 picture:** it fills the square (`object-cover`).
- **2–4 pictures:** a `grid-cols-2 grid-rows-2 gap-[2px]` on the page background, cells filled in
  order, empty cells `bg-ink/5`. Square corners on the tile and the cells.

Every `<img>` is `alt=""` and plain (not `next/image`) — arbitrary museum URLs, the same rule as
every image surface in the app. The 20 px radius on today's cover goes: Ben's "ditch the rounded
corners on hero images in every view" applies to any picture that is content.

**The data.** `saves.collections` returns **`covers: string[]`** — the picture srcs of the four
most recently saved *image* items in the collection, newest first, `[]` for an empty or
article-only collection — in place of `cover: string | null`. `db/collections.ts`'s
`withCovers` swaps its `DISTINCT ON` for one window function,
`row_number() over (partition by collection_id order by saved_at desc)`, over the same
collected-only / image-only filter, and keeps rows numbered ≤ 4. Still one extra round trip after
the count query, for the same reason as before: the count is a `GROUP BY`, a face is specific
rows per group.

> **Amended at build, 09-12-26.** "Image URLs" became *proxied srcs*: each entry is
> `/api/img/<itemId>` (or a `data:` pixel as-is), through `lib/image-src.ts`, the rule the feed
> tile already followed. The page's CSP is `img-src 'self' data: blob:`, so the stored museum
> URL the design named is blocked by the browser — the old single cover had been a broken image
> on production since 7.2 for exactly that reason, and nobody had noticed.

## 3. Topics tab

`/profile/topics` keeps every behaviour — optimistic toggles, the serialised `setMine`, the
floor of one, the dev-only weights and Reset — and loses its chrome: no "← Profile" link, no
"Topics" h1. "**N on. Changes save as you go.**" stays as the first line. The four facets are
**four stacked sections on one page**, in `FACETS` order: an uppercase accent eyebrow with the
facet's name, an `h2` carrying the question onboarding asks for that facet (`FACET_PROMPTS`, the
one copy both pickers share), and the topic chips in a `role="group"` named "{Facet} topics".
Nothing here is a tablist — the hub's nav is the screen's one row of sections.

_Amended 09-12-26 after Ben's review._ The first build put the facets in a row of small chips
(the Saved filter row's idiom) showing one facet at a time. Ben asked for the onboarding
screen's grouping instead: the filter made a reader flick between facets to see what they had
already picked, and the whole vocabulary is only a few screens of chips. So the tab is now the
four setup stages laid end to end, which is what it is.

## 4. Edit profile tab

`/profile/edit` is the form under the hub header: `GlassHeader` and its back chevron go, and
with them `leaveEdit` and the origin marker. The bottom **"Save changes"** button is the save.
On success: `utils.user.me.setData` then `invalidate` (the header above re-renders with the new
name at once), `toast("Profile saved")` through the hub, and the tab **stays**. **Discard**
resets Name, Handle and About to the loaded profile and clears both error slots; it navigates
nowhere. Email stays read-only with its explanation. The double-submit guard stays; it clears on
success now that nothing leaves.

## 5. Settings tab and the redirect

`src/app/settings/page.tsx` moves to `src/app/profile/settings/page.tsx` unchanged in its
guard, prefetches and `versionLabel`; the old path becomes `permanentRedirect("/profile/settings")`
— the `/g/[itemId]` idiom, a 308 for bookmarks, history entries and the PWA. `proxy.ts`'s
`AUTHED_PREFIXES` keeps `/settings`, so a signed-out visitor bounces to `/` before the redirect
runs, and `security.spec.ts`'s guard assertion holds as written.

The screen loses its `GlassHeader`, `leaveSettings`, and the two shortcut cards. The four groups,
every row, the stubs, the three sheets, sign-out and the version footer are as they were. Two rows
change destination: **"What you see"** → `router.replace("/profile/topics")`, **"Account
details"** → `router.replace("/profile/edit")` — in-hub switches, so `replace`, like the nav.

## 6. Desktop

From `md` the hub is `Column width="wide"` (1120 px) — the feed's column — with the header and the
nav **left-aligned** in it (`px-5`, as on the phone), the rail persistent at the right. The
Collections grid packs three columns at 768 and four at 1280. The Edit, Topics and Settings
panels each sit in a plain `<div className="md:max-w-[600px]">` — left-aligned, not centred —
under the same left edge as the avatar, the way a desktop settings page hangs its form off its
header rather than floating it. Literal classes: Tailwind's scanner reads source text.

**Saved** gets the same width: `GlassHeader` gains a `width` prop (default `narrow`, so
onboarding's use is untouched) and Saved passes `wide` to both the header and its `Column`; the
masonry packs `useColumnCount()` columns through the shared `GRID_COLS`, so a modest collection
at 1440 is four short stacks rather than two long ones. The chips, the unsave badge, the
empty states and the tiles are unchanged. This reverses `saved-screen.tsx`'s "stays two
columns — a modest collection would look like a thin feed" comment on Ben's word: the stretched
phone was the complaint.

## 7. Picker rows

`CollectionRow` gains an optional **`leading`**:

```ts
type RowLeading =
  | { kind: "covers"; covers: string[]; current?: boolean }
  | { kind: "glyph"; glyph: "bookmark" | "plus" };
```

With `covers`, the 9 px dot becomes a 36 px `CoverMosaic` (placeholder glyph at 14 px);
`current` draws the accent as a 2 px ring around it, so "Already saved here" keeps its colour.
With `glyph`, the row shows a hairline square with the outline bookmark ("Everything kept") or a
dashed square with a plus (`NewCollectionRow`'s collapsed row) — the same two squares the
Collections tab's placeholder and `NewCollectionTile` use, at row size. Without `leading` the
dot renders as today (the `tone` prop stays for it).

`SaveToCollectionSheet`, `CollectionsSheet` and the hover strip's picker (which is
`SaveToCollectionSheet`) pass `covers` from the rows they already read. `ItemSheet`'s bespoke
compact rows — the right-click / long-press menu, which deliberately fetches nothing extra —
swap their 8 px accent dot for a 28 px mosaic from the same query. No search field, no rename,
no delete: the rows stay rows.

## 8. Testing

**Unit (Vitest).** `routers.integration.test.ts`: `covers` are the four newest images, newest
first, capped at four (five saved → the first is missing), `[]` for article-only and empty.
New `cover-mosaic.test.tsx`: cell count per length (0 → placeholder, 1 → one img, 3 → three
imgs + one filler), every `img` has `alt=""`, `data-count`. New `profile-hub.test.tsx`: the four
links in order with the right hrefs, `aria-current` follows the selected segment, links carry
`replace`, Feed pops when marked and pushes cold, Profile is inert, the error branch, the wide
column class. `collections-tab.test.tsx` (from `profile-screen.test.tsx`): the dashed tile
first, a mosaic per collection, the tile tap marks saved-origin, creating a collection toasts
through the hub context, the grid class follows the column count. `topics-screen.test.tsx`:
four facet chips with Subject pressed, a chip click switches the group, no `tab` roles.
`profile-edit-screen.test.tsx`: success primes the cache, toasts through the hub and does not
navigate; Discard resets the fields and calls nothing. `settings-screen.test.tsx`: the two rows
`replace` in-hub, no cards, no Back, one `md:max-w-[600px]`. `glass-header` and
`saved-screen.test.tsx`: `wide` on both, and the column count from `stubMatchMedia`.
`collection-rows.test.tsx` / `sheets.test.tsx`: `leading` variants render a mosaic, a glyph
square or the dot; the current row is ringed; the browse sheet's first row shows the bookmark
square. `masonry.test.ts`: `GRID_COLS` has exactly the three literal classes.

**e2e (`bun run e2e:prod`).** `settings.spec.ts` is rewritten around the hub: Profile from the
pill → the four links → Collections' tiles; Edit profile is a link, the save stays on
`/profile/edit` and the header shows the new name; Settings is `/profile/settings` and its rows
switch tabs; the facets are buttons; sign-out from `/profile/settings`; `/settings` lands on
`/profile/settings`. `auth.spec.ts`, `pwa.prod.spec.ts` and `security.spec.ts` follow the
path. `desktop.spec.ts` gains: on `/profile` the first four tiles share a top edge (four per
row) inside a grid ≤ 1120 wide; the nav's left edge sits at the column's left edge (160 px
± 2 at 1440); `/saved` packs four stacks.

## Out of scope, recorded

- A search field in any picker; collection rename or delete; a cover *chosen* by the reader.
- Onboarding, the feed, the item screen, the landing page.
- `topic_edge`; anything in the feed engine.
