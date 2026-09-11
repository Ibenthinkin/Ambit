# Chrome redesign — the fatter pill and detached Share, the desktop rail, hover-to-save tiles — design

**Written:** 09-11-26 by Fable 5.1, from Ben's desktop review notes
(`docs/design_update_3/desktopPolishChecklistNotes.md`, the Tiles and Redesign sections, and the
four Cosmos reference photos under `docs/design_update_3/photos/`) and six questions answered in
chat the same day.
**Status:** design approved 09-11-26 (the six decisions below); plan
`docs/PLAN_chrome-redesign.md`, ready to execute cold.
**Sub-project 3 of 3** from that review. Sub-project 1 (facets, four-stage onboarding,
`/profile/topics`, personas) and sub-project 2 (the merged item screen, one New-collection row,
the living landing slideshow) both shipped 09-10. This is the *taste* project the other two were
kept free of: every pixel here is new. **List screens are split out** (decision 1) into a
sub-project 4 of their own, after Ben has reviewed 1–3 in the browser.

## Why

Four things from the desktop pass, in Ben's words:

- **The phone controls are too small, and Share belongs on its own.** *"The UI buttons on the
  phone-sized version need to be bigger and fatter, and when we switch to the gallery or item
  views and the share button appears, instead of being within the same pill-shaped container it
  should be its own free-floating round button, detached but aligned horizontally and centered on
  the remaining distance between the main menu bar and the edge of the screen on the right
  side."* The reference is Cosmos's phone bar (`PhoneUIBarReference.PNG`): a three-glyph pill and
  a round search disc floating to its right. Today `PillToolbar` is one identical pill at every
  width — `px-5 py-2 gap-[26px]`, glyphs 25/31/24/23 px — and Share is its fourth glyph.
- **Desktop should not wear the phone's bar.** *"On the desktop and most likely on the tablet
  size, I want to move the UI bar to a fixed screen position on the right side. The three or four
  buttons will be inline vertically instead of horizontally. They should be a bit bigger than on
  the phone and have a bit more space between. Clicking will open a modal floating next to the
  button — floating to the left of it — and of course the buttons will be located down the right
  side. We can use the current menus/options we have for now."* Today every sheet above `md` is
  the centered 520 px dialog (`bottom-sheet.tsx`'s `PANEL_DESKTOP`), and the pill sits at the
  bottom centre of a 1440 px screen.
- **Tiles should save on hover.** *"The feed should have transparent hover-over menus to add an
  item to the collection, just like in the reference photos. Where it says 'Electronics' is the
  category and the button says Save but we can just use our save glyph instead."* In Cosmos
  (`hoverOverFeedItem.png`, `clickOnHoverOverFeedItem.png`) the left pill is the **target
  collection** — Save files the item there in one click, the chevron opens a picker ending in
  "Create collection". Today a tile has no controls at all: saving from the feed is a long-press
  or a right-click, then a row.
- **The hover zoom and the focus ring don't read.** *"The hover zoom is barely visible and clunky.
  It works but we need to change it later. And I definitely don't see an outline or highlight
  indicator of any kind."* The zoom is `group-hover:scale-[1.03]` over 300 ms; the ring is a 2 px
  accent outline inset 2 px — indigo on a photograph.

And one loose end from sub-project 1: the onboarding stage headings are marked
*"placeholder wording until sub-project 3 (the chrome redesign) writes it properly"*.

## Decisions (with Ben, 09-11-26)

1. **List screens are sub-project 4.** Saved, Profile, Topics, Settings and Edit are untouched
   here. They get their own design pass once Ben has reviewed sub-projects 1–3 in the browser.
   This doc stays cold-executable because of it.
2. **The hover pill is the target collection**, Cosmos-literal: it names the last-used collection,
   the save glyph beside it files the item there in **one click**, and the chevron opens the
   existing picker (rows + "New collection…"). Not the topic the card was served under — that
   stays the item page's and the toast's business.
3. **The desktop rail fades with the chrome on the item screen**, summoned by a mouse move like the
   caption, on the same 600 ms; on the feed, Saved and Profile it is persistent.
4. **The hover zoom is dropped.** The strip appearing is the hover feedback; the picture never
   moves.
5. **Popovers have no visible scrim.** The page stays fully visible behind a panel floating beside
   its button; an invisible click-catcher keeps click-outside, Escape, the focus trap and the
   scrim's test id.
6. **Article cards get the same strip** as image tiles.

Calls made here and stated rather than asked: **one breakpoint** — the rail begins at `md`
(768 px), so a tablet gets it, matching the app's one-breakpoint rule
(`docs/DESIGN_desktop-polish.md` §1); the **right-click item sheet keeps** the centered dialog
(it is tested and a menu, not a picker); the **picker keeps today's rows** — no search field, no
cover thumbnails, both list-screen taste (sub-project 4); **saved-state on the feed** comes from
one new `saves.ids` query, not a per-tile `saves.forItem`; and the **onboarding copy** is
written here (§6).

## 1. The phone pill — bigger, and Share detaches

Below `md`, `PillToolbar` (`src/components/ui/pill-toolbar.tsx`) keeps its position — fixed,
horizontally centred, `bottom: 26px` — and grows:

| | was | now |
|---|---|---|
| pill padding (v × h) | 8 × 20 | **10 × 22** |
| gap between controls | 26 | **28** |
| Profile avatar / Feed mark / Bookmark | 25 / 31 / 24 | **28 / 34 / 26** |
| hit area | 44 | **48** (a `-my-[6px]` overlap keeps the pill at 56, as `-my-2` kept it at 44) |
| pill height | 44 | **56** |

**Share leaves the pill.** When `onShare` is passed, the toolbar renders a **56 px round disc**
on the same glass recipe as the pill (`rgba(240,237,231,0.225)`, `blur(26px) saturate(180%)`,
`border-white/28`, `shadow-toolbar`) holding `Share size={25}`, **centred in the remaining
distance between the pill's right edge and the screen's right edge**, on the pill's own axis.
The wrapper — still `pointer-events-none`, still full width — becomes a three-column grid,
`grid-cols-[1fr_auto_1fr] items-center`: the pill sits in the middle column, the disc in the right
column with `justify-self-center`, and the empty left column is what keeps the pill centred. The
disc is `pointer-events-auto`, a **sibling of the `<nav>`**, `aria-label="Share"` as before;
the `extra` slot stays inside the nav (nothing passes it today).

On the item screen the pill is `static` inside the caption block, whose padding is 24 px a side;
that row gets `-mx-6` so the disc measures to the true screen edge rather than the caption's
inset. On the article reader (`ItemShell`) the toolbar is fixed normally and the grid spans the
viewport.

Feed, Saved, Profile: three controls, no disc — unchanged shape, bigger. The handoff README's
"never add a second bar" line gets an amendment: a detached *button* aligned with the pill is not
a bar, and the README's measurements are superseded by this section.

## 2. The desktop rail — vertical, fixed right, panels float beside it

From `md` up, a new `RailToolbar` (`src/components/ui/rail-toolbar.tsx`) replaces the pill. Same
props as `PillToolbar` (`bookmark`, `onBookmark`, `onShare?`, `onProfile?`, `onHome?`,
`className?`) plus `visible?: boolean` (default `true`). It renders
`<nav aria-label="Ambit toolbar" data-testid="rail-toolbar">`, `fixed right-[26px] top-1/2
-translate-y-1/2 z-30 flex flex-col`, the same glass recipe, `px-2 py-[14px] gap-[16px]` around
**52 px** controls (so the rail is 68 px wide and the glyphs sit ~32 px apart), glyphs avatar
**32** / mark **38** / bookmark **29** / share **27**. Order top to bottom: Profile, Feed, Save to
collection, Share — Share omitted without `onShare`, as today. No full-width wrapper, so no
`pointer-events` split to get wrong.

`visible={false}` → `opacity: 0`, `transform: translateX(10px)`, `visibility: hidden`,
`transition: opacity .6s ease, transform .6s ease, visibility .6s`, `aria-hidden` — the discrete
`visibility` trick `hero-rail.tsx`'s chrome block uses, for the same reason: an invisible control
that still takes clicks is worse than none.

**`Toolbar`** (`src/components/ui/toolbar.tsx`) is the one-liner every ordinary screen mounts:
`useMediaQuery(DESKTOP_QUERY) ? <RailToolbar/> : <PillToolbar/>`. The server snapshot is the
pill; a desktop client re-renders before paint (the feed's column-count pattern,
`use-media-query.ts`). `feed-screen.tsx`, `saved-screen.tsx`, `profile-screen.tsx` and
`item-shell.tsx` switch to it. **`item-screen.tsx` renders both explicitly**: the pill inside the
fading caption below `md` (exactly as today), and `<RailToolbar visible={chrome.visible} />`
outside the caption above `md` — it already reads `desktop` for the hero's height. Decision 3.

**Anchored popovers.** `BottomSheet` gains two props: `anchor?: DOMRect | null` (the opener's
rect, captured at click time) and `placement?: "left" | "below"` (default `"left"`). Without
`anchor` nothing changes: the phone sheet, the centered 520 px dialog above `md`. With
`isDesktop && anchor` the panel is a **popover**: `fixed`, `w-[360px]`, `rounded-sheet`, a full
hairline border, the `menu-rise`/`menu-drop` pair (a lift-and-fade, 200/150 ms) with a
`transform-origin` from the placement, and:

- `left` — the rail's panels: `right = vw − anchor.left + 14`, vertically centred on the anchor
  (`top = anchor.top + anchor.height/2`, `translateY(-50%)`), `max-height = min(70vh, 2·min(cy,
  vh − cy) − 32)`. That last is a CSS-only clamp — the panel can never overflow — and the rail is
  vertically centred, so it is never tight.
- `below` — the tile picker: `top = anchor.bottom + 8`, `left = anchor.left`, `max-height = vh −
  top − 16`; **flips above** (`bottom = vh − anchor.top + 8`) when that leaves under 240 px;
  `left` clamped to `vw − 360 − 16`.

The scrim in anchored mode is `bg-transparent`, no blur (decision 5) — the same element, the same
`data-testid="bottom-sheet-scrim"`, click-to-close, Escape, the focus trap and return-focus all as
before. The grabber is already `md:hidden`.

The three sheets the rail opens gain an `anchor?` passthrough: `CollectionsSheet` (feed, Saved,
Profile bookmark), `SaveToCollectionSheet` (item bookmark; also the tile picker, with
`placement="below"`), `ShareSheet`. Both toolbars' `onBookmark` and `onShare` become
`(anchor: DOMRect) => void`; callers on the phone may ignore the argument. This is "the current
menus/options we have for now", floating where Ben asked.

## 3. The tile hover strip — one-click save, fine pointer only

New `TileActions` (`src/components/feed/tile-actions.tsx`), rendered by `feed-screen.tsx` as a
**sibling after the tile** inside the per-tile wrapper, which becomes
`<div data-feed-id className="group/tile relative">`. This is `SavedTile`'s overlay pattern
(`saved-tile.tsx`), so e2e's `[data-feed-id] > *` `.first()` still finds the pressable tile, and
the tile components themselves are untouched. Because tiles carry no strip.

**Mounted only on a hover-capable fine pointer.** `use-media-query.ts` gains
`HOVER_QUERY = "(hover: hover) and (pointer: fine)"`; `FeedScreen` reads it once and renders no
strip otherwise. A strip that is merely invisible would still catch taps across the top 52 px of
every tile on a phone — so on touch it does not exist.

The strip: `absolute inset-x-0 top-0 flex items-start justify-between p-[10px]`, `opacity-0
transition-opacity duration-200 group-hover/tile:opacity-100 focus-within:opacity-100` — a
keyboard reaches its buttons through Tab, and focusing one reveals it. Two controls, both
`onPointerDown` stopPropagation (the README's rule for every save/share control), both on the
unsave badge's glass (`bg-bg-app/62 backdrop-blur-[8px] border-hairline border-ink/16`), 32 px
tall:

- **Left, the collection pill** — `{name}` + a new `ChevronDown` glyph, `px-[12px] text-[12.5px]
  font-medium text-ink-hi rounded-pill`, `aria-label="Choose collection"`. Click → the
  `SaveToCollectionSheet` anchored `below` it, `currentCollectionId` set when the item is saved.
- **Right, the save glyph** — a 32 px disc, `Bookmark size={15}`. Unsaved: outline,
  `aria-label="Save to {name}"`, click saves there **in one click**. Saved: `filled text-accent`,
  `aria-label="Saved to {name}"`, click opens the same picker (a move — what the item screen's
  lit bookmark does).

**Last-used collection.** `src/lib/last-collection.ts`: localStorage key `ambit.lastCollection`
holding an id; `useLastCollection(collections)` returns the matching row, else the first
collection (the seeded "Articles"). Every successful save from any surface —
`SaveToCollectionSheet`, `ItemSheet`, `TileActions` — writes it. Reads and writes are try/caught
like `install-store.ts`.

**Saved state on the feed.** `saves.ids` (new, protected) → `string[]`, the caller's saved item
ids; `getSavedItemIds` in `db/saves.ts`; prefetched by `app/feed/page.tsx` (the prefetch
contract: the RSC prefetch and the client hook key identically). The one-click save is
**optimistic** on the `topics-screen.tsx` pattern: `onMutate` cancels and snapshots `saves.ids`,
adds the id; `onError` restores it and toasts; `onSettled` invalidates ids, collections, list and
count. The toast is `saveToastText(collectionName, drift)` through `FeedScreen`'s `setToast`.

## 4. Hover and focus feedback

`image-tile.tsx` loses `group-hover:scale-[1.03]` and its transform transition (decision 4).
Both tiles' focus ring becomes `focus-visible:outline-[3px] focus-visible:outline-ink-hi
focus-visible:-outline-offset-[3px]` — off-white, 3 px, inside the edge — legible on any photo.
(`:focus-visible` never matches a mouse click, by design; Tab shows it.) `ArticleCard` keeps its
one-step hover fill.

## 5. Saves bump the topic the card was served under

The follow-up `docs/DESIGN_feed-on-membership.md` §5 recorded: since the feed draws on
membership, a card is routinely served under a topic that is not its display topic, and
`saves.saveToCollection` bumps `item.topic_id` regardless. Input gains `topicId?: string`. The
server bumps it **only if the item is a member of that topic** (`isItemInTopic` against
`item_topic`, new in `db/items.ts`) and falls back to the display topic otherwise — a client
cannot bump an arbitrary topic. `TileActions` passes `card.topicId`; `ItemSheet`'s `item` prop
gains `topicId` (the feed's `pressedItem` carries it) and passes it too; the item screen passes
nothing. The toast then names the topic the reader actually saw.

## 6. Onboarding stage copy

`STAGE_HEADINGS` in `onboarding-screen.tsx` stops being a placeholder:

| facet | was | now |
|---|---|---|
| subject | What do you want to see? | **What are you drawn to?** |
| medium | Made how? | **In what form?** |
| look | What should it look like? | **What should it feel like?** |
| place | Anywhere in particular? | **Anywhere in particular?** |

## 7. Testing

**Unit (Vitest).** `pill-toolbar.test.tsx`: the new sizes are not asserted (they are taste), but
Share renders as a **sibling disc** — count 1, not a child of the nav, omitted without `onShare`
— and the `pointer-events-none` wrapper guard stays. New `rail-toolbar.test.tsx`: four controls in
order, Share omitted without a handler, `visible={false}` → `aria-hidden="true"` and
`visibility: hidden`. New `toolbar.test.tsx`: pill under jsdom's absent `matchMedia`, rail under
`stubMatchMedia([DESKTOP_QUERY])`. `bottom-sheet.test.tsx`: anchored `left` positions from a
fake rect and paints a transparent scrim; anchored `below` flips above when tight; no `anchor` ⇒
the desktop classes are byte-identical to today. New `tile-actions.test.tsx`: not mounted by the
feed without the hover query; save calls the mutation with `itemId`, `collectionId` and
`topicId`; the saved state fills and renames the glyph; the chevron opens the picker with an
anchor; optimistic add and rollback. New `last-collection.test.ts`. Router integration:
`saves.ids`; `topicId` honoured for a member, ignored for a non-member. `image-tile.test.tsx`: no
scale class; the new outline classes. The e2e-fragile contracts all survive:
`nav[aria-label='Ambit toolbar']`, the four `aria-label`s, `gallery-chrome`,
`bottom-sheet-panel`/`-scrim`, the right-click dialog's 520 px geometry.

**e2e (`bun run e2e:prod`).** `desktop.spec.ts` gains: the rail sits at the right edge with four
stacked buttons; the rail's bookmark opens a panel whose box lies left of the rail and no scrim
is painted (the scrim's computed background is transparent); hover a tile → strip visible → Save
→ the `Saved to …` toast, and the item on `/saved`; chevron → picker → New collection → Create →
toast; on the item page a mouse move summons the rail (`rail-toolbar` `aria-hidden="false"`) and
Escape leaves. `item.spec.ts` (the phone project) gains one geometry assertion: the Share disc's
centre x is the midpoint of the nav's right edge and the viewport's right edge, ±2 px.
`feed.spec.ts`'s "the pill has no share control on the feed" stands.

## Out of scope, recorded

- The list screens (sub-project 4), including any picker search field or cover thumbnails.
- The right-click item sheet's form; `/profile/topics` copy; any touch hover affordance.
- `topic_edge`; the p50 lever; anything in the feed engine.
