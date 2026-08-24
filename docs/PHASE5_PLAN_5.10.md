# Phase 5.10 — Profile + Settings + Profile Edit: detailed execution plan

**Status: ready to execute.** Companion to BUILD_PLAN.md Phase 5, same format as
PHASE5_PLAN_5.9.md. Written to be executed cold, by a session that has not read the research
behind it, straight through on `feat/5.10-profile-settings` — plain branch off `main`, merged
back when green. Where it says "verified", the claim was checked
against the repo at plan time (08-24-26, `main` @ ee1d406); re-verify line numbers if the repo
has moved — the *shapes* are the contract, not the line numbers.

**Prerequisites (Ben): none outstanding.** All plan-time inputs were collected 08-24-26: contact
address = `benjamin.reilly@gmail.com`; `package.json` bump to `0.4.0` approved; collection cover
tiles approved. Local Postgres up (`docker compose up -d`); clear port 3000 before dev/e2e runs.

**No mid-phase stop.** Every scope and design call below was settled with Ben at plan time.

**What this phase is:** the app's last 404s die. Three screens from the redesign bundle —
`/profile` (identity + collections grid + creation), `/settings` (full designed surface, real
rows real and stub rows honest), `/profile/edit` (name/handle/bio form) — plus the backend they
need: two `user` columns, a `user` tRPC router, `createCollection`, `topics.mine`, collection
covers, and sign-out's move to its permanent home.

---

## 1. Context

- **Where this sits:** feed 5.6 ✅ → item 5.7 ✅ → gallery 5.8 ✅ → Saved 5.9 ✅ →
  **Profile/Settings 5.10** → landing/PWA 5.11. Three screens, not two: the redesign bundle has
  `Ambit - Profile.dc.html`, `Ambit - Settings.dc.html`, **and `Ambit - Profile Edit.dc.html`**
  — all editing lives on the third. Prototypes are authoritative over the README (recorded
  convention). The §4 UI spec is distilled from them — do not open them during execution.
- **This phase closes long-standing signposts** (verified): `PillToolbar`'s default `onProfile`
  pushes `/profile` — a 404 today — from Saved, item pages, and the gallery;
  `CollectionsSheet`'s "New collection · Make one on your profile" row navigates to the same
  404; feed and `/dev/tokens` carry "Profile is 5.10" toast overrides; sign-out sits in its
  declared "interim home" on `/dev/tokens` (`sign-out-button.tsx`'s own header comment).
  It also answers 5.9's open reachability question: Settings' "Everything kept · N saves"
  shortcut card is the third doorway into Saved.

### Scope re-baseline (locked with Ben 08-24-26 — do not relitigate)

BUILD_PLAN's "minimal viable" 5.10 entry is superseded. Ben pulled the full designed surface
back into scope, with adjustments:

1. **Full settings surface, split real/stub.** REAL: What you see (topic editing), Appearance
   (accent picker over the shipped 4-accent knob), Notifications (live browser permission
   state), Add to home screen (install-instructions sheet), About Ambit, Get in touch (mailto),
   Account details, both shortcut cards, Sign out. STUB (visible; tap toasts
   "{label} · coming soon"; **no fabricated values** — the prototype's "2 left"/"Often"/"Not
   determined" demo values are dropped): Serendipity, Muted sources, Invite a friend, Camera
   roll, Language.
2. **Avatar = deterministic per-user color disc.** Hash user id → stable gradient; no storage,
   no upload, ever in this phase. The **preference-derived sprite/glyph generator** is recorded
   in BUILD_PLAN as a named post-MVP backlog entry — build none of it now.
3. **Bio and handle are in** (two new nullable `user` columns; handle unique, display-only —
   no share-profile button, no public profiles). **Email read-only** in the edit screen
   (Better Auth's update-user rejects email changes by design; change-email is a later phase).
4. **`/profile/edit` is a dedicated route** (real multi-field form), not a sheet.
5. **New collection = name-input sheet** → new `createCollection` procedure; duplicate name is
   a clean inline error. (The prototype's zero-input auto-name "Collection 4" is rejected: no
   rename exists, so auto-names would be permanent.)
6. **Collection deletion/rename: deferred entirely.** No design pressure (the prototype has
   none — verified across all 11 files), and deferring keeps the `collections_seeded_at`
   marker migration out (the note in `db/collections.ts:99` stays live).
7. **Sign out = standalone one-row card** above the version footer (the prototype has no
   sign-out anywhere — this treatment is 5.10's own, flagged as such in a comment).

## 2. Decisions locked in this plan

| # | Decision | Rationale |
|---|---|---|
| 1 | **Profile data flows through a new tRPC `user` router** (`user.me` + `user.updateProfile`), not `authClient.updateUser` and not Better Auth `additionalFields`. | (1) `getSession` only returns columns Better Auth declares — `handle`/`bio` would be invisible on `ctx.user`, so a read path is needed regardless, and `user.me` slots into the RSC prefetch pattern. (2) tRPC maps handle conflicts to a typed `CONFLICT`; Better Auth would 500. (3) No auth-config churn (schema.ts's header warns about the CLI-generate dance). The `user.create.before` invite hook is unaffected — both columns nullable (verified). |
| 2 | **Handles stored bare + lowercase** (client strips typed `@`, server lowercases), `^[a-z0-9_]{2,24}$`, rendered `@{handle}`. Uniqueness = select-then-update with the race accepted and commented (the `saveToCollection` "accepted race" precedent; no `onConflict` for UPDATE exists to reuse). | Case-sensitive unique would let `Ben`/`ben` coexist; normalize at the API. |
| 3 | **`saves.collections` gains nullable `cover`** (most-recent saved image per collection) for Profile's cover tiles. Additive — existing consumers ignore it. *(Approved by Ben.)* | The cover tiles are the Profile grid's visual payoff. |
| 4 | **Avatar color: pure `avatarHue(userId)` (FNV-1a → hue) + `avatarGradient(userId)`** returning a `linear-gradient(150deg, hsl(…), hsl(…))` string, applied via a new optional `gradient` prop on `AvatarChip` as inline `style`. Pill toolbar's 25px disc keeps the static default gradient (no user data in `PillToolbar`; deferred). | Inline style sidesteps the tailwind-merge registration gotcha; deterministic beats random (stable across sessions/devices, no storage). Prototype geometry (150deg two-stop) preserved. |
| 5 | **Accent persistence: `localStorage["ambit.accent.v1"]` + a tiny inline `<script>` in `layout.tsx`'s head** reapplying it to `documentElement.dataset.accent` before first paint, plus `suppressHydrationWarning` on `<html>` (server always renders the default). Per-device; no migration. The script can't import `lib/accent.ts` — duplicated key/allow-list gets keep-in-sync comments both sides. | FOUC-free with zero schema cost; a user column can come later if cross-device sync matters. |
| 6 | **Profile's header is NOT a `GlassHeader`** — the prototype's is a plain non-sticky row that scrolls away. Settings and Edit DO use `GlassHeader` (their prototypes are sticky+blur), in its **default row layout** (back/title/right-slot is its natural `justify-between` — not Saved's `flex-col` override). | Read straight off the three prototypes. |
| 7 | **Profile's header shows only the gear.** The prototype's Share disc dies with public profiles (scope), and Search has no feature anywhere in BUILD_PLAN — a "coming soon" stub *outside* Settings would break the stubs-live-in-Settings pattern, so it's omitted, not stubbed. | Flagged as a plan-time call; revisit when search is real. |
| 8 | **Stub-row honest values:** Muted sources → "None" (true), Language → "English" (true); Serendipity / Invite a friend / Camera roll → chevron only, no value. | A settings row must never display invented state. |
| 9 | **All three routes skip the onboarding redirect** (session guard only), like `/saved`. | They render user-owned data needing no topic picks; bouncing a mid-onboarding user who taps the pill's avatar is a trap; and "What you see" is *itself* a topic picker — a zero-pick user should reach it. Comment this at each guard. |
| 10 | **Three new origin markers** (`profile-origin`, `settings-origin`, `edit-origin`), each a structural copy of `saved-origin.ts` (bare `"1"` flag). Writers: `PillToolbar`'s default `goProfile`, `CollectionsSheet`'s `/profile` row, Profile's gear + Edit pill, Settings' two edit entries. Deferred note: six near-identical files is where an `origin(key)` helper becomes defensible — not this phase's call. | House precedent, explicitly unabstracted. |
| 11 | **Profile's pill:** avatar dot **inert** (you're here — comment it), mark = `leaveProfile` (pop-or-push, same corpus arithmetic as `leaveSaved`), bookmark opens **`CollectionsSheet`** — a deliberate divergence from the prototype's direct-to-Saved bookmark, for one bookmark behavior app-wide (the sheet already writes `saved-origin` and offers filtered entry). No share. | |
| 12 | **`TopicsSheet` Save gates at ≥1 pick** (matching `topics.setMine`'s `.min(1)`), not onboarding's 3 — that minimum is a cold-start-quality gate, not an invariant; blocking an established user from shrinking to 2 topics would be hostile. | |
| 13 | **Edit-save UX copies the prototype:** toast "Profile saved" ~900ms, then leave (pop-or-push). Handle conflict renders inline under the field ("That handle's taken."), not a toast. | |
| 14 | **Version footer is real:** `package.json` → `"0.4.0"` *(approved)*; `app/settings/page.tsx` imports it server-side and passes `versionLabel` (`"v0.4"`). **Get in touch** = `mailto:benjamin.reilly@gmail.com` constant in `settings-screen.tsx` *(Ben's address, provided at plan time)*. | |

## 3. Files

### Migration (first)

Workflow (verified): edit `src/server/db/schema.ts` → `bun run db:generate` → inspect
`drizzle/0003_*.sql` → `bun run db:migrate`. Change at the `user` table (~schema.ts:33):

```ts
// 5.10: both nullable so the Better Auth sign-up insert (and its invite-gate
// databaseHooks) never has to know these columns exist.
handle: text("handle").unique(),  // bare, lowercase — normalized by user.updateProfile
bio: text("bio"),
```

Expected SQL: two `ADD COLUMN`s + `ADD CONSTRAINT "user_handle_unique" UNIQUE("handle")`.
(Postgres unique treats NULLs as distinct — unlimited users with no handle; comment it.)

### New files

| File | Contents |
|---|---|
| `src/server/db/users.ts` | House style (dynamic `await import("./client")`, explicit userId). `UserProfile` = `{id, name, email, handle: string\|null, bio: string\|null}`. `getUserProfile(userId)` → select those five fields, limit 1. `isHandleTaken(handle, excludeUserId)` → select id where handle = $1 and id != $2. `updateUserProfile(userId, {name, handle, bio})` → update…returning the `UserProfile` fields (`updatedAt` via the column's `$onUpdate`). |
| `src/server/api/routers/user.ts` | `user.me`: protectedProcedure → `getUserProfile(ctx.user.id)`; `undefined` → `INTERNAL_SERVER_ERROR` (session just proved the row exists). Doc comment: NOT `ctx.user`, because getSession only returns declared columns. `user.updateProfile`: input `z.object({ name: z.string().trim().min(1, "Name can't be empty").max(60), handle: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{2,24}$/, "Letters, numbers and underscores only").nullable(), bio: z.string().trim().max(280).nullable() })`; if handle set and `isHandleTaken` → `CONFLICT "That handle is taken."`; then `updateUserProfile` (accepted race, commented — saveToCollection precedent). |
| `src/lib/avatar-hue.ts` | Pure: `avatarHue(userId)` FNV-1a → 0–359; `avatarGradient(userId)` → `linear-gradient(150deg, hsl(h …), hsl(h …))` two-stop string (light-to-mid, prototype geometry). |
| `src/lib/avatar-hue.test.ts` | Determinism; range; distinct ids → distinct hues (sampled). |
| `src/lib/accent.ts` | `ACCENTS` (the four from dev/tokens — now their canonical home), `AccentKey`, `storedAccent()` / `setAccent(key)` — try/catch-wrapped localStorage + `documentElement.dataset` writes, key `"ambit.accent.v1"`. Keep-in-sync comment pointing at layout.tsx's inline script. |
| `src/components/ui/textarea.tsx` | `Textarea` — the `Input` primitive's classes verbatim on `<textarea>`, `resize-none leading-[1.5]`, default `rows={4}`. |
| `src/components/profile/profile-origin.ts` | Marker, key `"ambit.profileOrigin.v1"`, value `"1"`: `markProfileOrigin()` / `cameToProfileFromApp()` — structural copy of `saved-origin.ts`, comments pointing at `feed-origin.ts` for the full account. |
| `src/components/settings/settings-origin.ts` | Same shape, `"ambit.settingsOrigin.v1"`. |
| `src/components/profile/edit-origin.ts` | Same shape, `"ambit.profileEditOrigin.v1"`. |
| `src/app/profile/page.tsx` | RSC shell (pattern: `app/saved/page.tsx`): session guard → `redirect("/")`, **no onboarding redirect** (Decision 9 comment); `void api.user.me.prefetch()`, `void api.saves.collections.prefetch()`; `HydrateClient`; `metadata = { title: "Profile · Ambit" }`. All prefetches input-less — the byte-matching rule is trivially satisfied; say so anyway (house convention). |
| `src/components/profile/profile-screen.tsx` | The screen (§4). Queries `user.me` + `saves.collections`; state `newCollectionOpen` / `collectionsSheetOpen` / `toast`. `leaveProfile` = marked ? back : push `/feed`. Loading spinner on `me.isPending`; error branch "Couldn't load your profile." + retry. |
| `src/components/profile/collection-tile.tsx` | One grid tile: cover `<img>` (`aspect-square rounded-[20px] object-cover`) when `cover` set, else bordered placeholder with outline `Bookmark size={26} className="text-ink/30"`; name; `itemCountLabel(itemCount)` (reuse from `collection-rows.tsx`). Tap → `markSavedOrigin()` + `push("/saved?collection=" + encodeURIComponent(id))` — identical to `CollectionsSheet.go`. |
| `src/components/profile/new-collection-sheet.tsx` | `{open, onClose, onCreated}`. BottomSheet title "New collection"; autoFocus `Input` placeholder "Collection name"; Create `Button` disabled when blank; `saves.createCollection` mutation — onSuccess: `utils.saves.collections.invalidate()`, `onCreated(row)` (parent toasts "{name} created"), close+reset; onError: `CONFLICT` → inline `role="alert"` "You already have a collection with that name." (sheet stays open), else "Something went wrong — try again." |
| `src/app/profile/edit/page.tsx` | RSC shell: guard (no onboarding redirect), `void api.user.me.prefetch()`, `metadata = { title: "Edit profile · Ambit" }`. |
| `src/components/profile/profile-edit-screen.tsx` | §4. Render the form only when `me.data` exists, as a keyed inner `<EditForm profile={me.data}>` so `useState(profile.name)` initializers are honest. Save mutation: onSuccess → `utils.user.me.setData(undefined, profile)` + invalidate, toast "Profile saved", `setTimeout(leaveEdit, 900)`; onError CONFLICT → `handleError` inline, else toast "Couldn't save — try again." Double-submit guard (local `submitting`, AuthCard pattern). |
| `src/app/settings/page.tsx` | RSC shell: guard (no onboarding redirect); prefetches `user.me` / `saves.count` / `topics.list` / `topics.mine`; imports `package.json` server-side → `versionLabel` prop (`"v0.4"`); `metadata = { title: "Settings · Ambit" }`. |
| `src/components/settings/settings-screen.tsx` | §4. Props `{versionLabel}`. Queries the four prefetched. One `openSheet: "topics"\|"accent"\|"about"\|"install"\|null` discriminant. Client-capability state null-before-mount (accent via `useEffect`+`storedAccent()`; notification hook) — SSR/hydration byte-stability comment. `leaveSettings` = marked ? back : push `/profile`. Sign-out row: `void authClient.signOut().then(() => router.push("/"))`, accessible name exactly "Sign out" (e2e contract — comment it). Mailto constant `benjamin.reilly@gmail.com`. |
| `src/components/settings/settings-row.tsx` | Presentational `SettingsRow` `{icon, label, value?, warnValue?, action?, onClick}` + `SettingsGroup {title, children}` (§4 chrome). |
| `src/components/settings/use-notification-permission.ts` | `useNotificationPermission()`: null pre-mount → `"unsupported"\|"default"\|"granted"\|"denied"`, plus `request()`. iOS-Safari note: the API exists only in installed PWAs — "unsupported" is a real state, and it also protects jsdom. |
| `src/components/settings/topics-sheet.tsx` | `{open, onClose, topics, initialSelected, onSaved}`. BottomSheet title "What you see", `maxHeightPct={72}`: intro line "Ambit starts from these and wanders sideways.", `flex flex-wrap gap-[10px]` of `Chip selected` (onboarding grid chrome), Save disabled at 0 picks (Decision 12), `aria-busy` while `topics.setMine` pends. Selection re-seeds from `initialSelected` each open (effect on `open` — discard doesn't leak). On save: `mutateAsync` → `utils.topics.mine.invalidate()`, `onSaved`, close; parent toasts "Feed updated". Comment: weights survive because `setUserTopics` only deletes dropped topics (verified `db/topics.ts:41-75`) — the whole reason this is safe to expose. Data flows from SettingsScreen's already-mounted queries (needed eagerly for the row value; zero extra fetches). |
| `src/components/settings/accent-sheet.tsx` | Four swatch rows (literal hexes for dots, per dev/tokens' own comment), active check, tap → `setAccent` + parent state. |
| `src/components/settings/about-sheet.tsx` | Static: `Logo`, one-paragraph description, version line, source attributions. |
| `src/components/settings/install-sheet.tsx` | Static iOS + Android add-to-home-screen steps (`Share`/`PlusSquare` icons); written to be imported by 5.11's install flow. |
| `src/components/profile/profile-screen.test.tsx` | §6.1. |
| `src/components/profile/profile-edit-screen.test.tsx` | §6.1. |
| `src/components/settings/settings-screen.test.tsx` | §6.1. |
| `e2e/settings.spec.ts` | §6.3. |

### Modified files

| File | Change |
|---|---|
| `src/server/db/schema.ts` | `user.handle` (nullable, unique) + `user.bio` (nullable). |
| `src/server/db/collections.ts` | `createCollection(userId, name)` → `.insert().onConflictDoNothing().returning({id, name})`, `undefined` = conflict (the exact house idiom; comment the seeding interplay — a raw-API create before any `getCollections` read would suppress default seeding; unreachable through the UI, accepted). `CollectionWithCount` gains `cover: string \| null`; `getCollections` merges a second query after the read/seed branch: `selectDistinctOn([savedItem.collectionId], {collectionId, imageUrl})` joined to `item`, `isNotNull(collectionId)` + `isNotNull(imageUrl)`, ordered `collectionId, desc(savedAt)` → Map → merged. |
| `src/server/db/topics.ts` | `getUserTopicIds(userId)` → `string[]` (not `getUserTopicWeights` — that's the feed engine's Map; the row/sheet need ids only). |
| `src/server/api/routers/saves.ts` | `createCollection`: input `z.object({name: z.string().trim().min(1).max(40)})`; `undefined` from the repo fn → `CONFLICT` "You already have a collection called "{name}"". Flag: the `(userId,name)` unique is case-sensitive — "art"/"Art" coexist; accepted. |
| `src/server/api/routers/topics.ts` | `mine`: protectedProcedure → `getUserTopicIds(ctx.user.id)`. |
| `src/server/api/root.ts` | Register `user: userRouter`. |
| `src/proxy.ts` | Matcher += `"/profile/:path*"`, `"/settings/:path*"`. |
| `src/app/layout.tsx` | Inline accent script in `<head>` (reads `ambit.accent.v1`, validates against the four keys, sets `dataset.accent`; try/catch); `suppressHydrationWarning` on `<html>`; update the stale `data-accent` comment. |
| `src/components/ui/avatar-chip.tsx` | Optional `gradient?: string` → inline `backgroundImage`; `bg-avatar-gradient` class only when absent. |
| `src/components/ui/pill-toolbar.tsx` | Default `goProfile` = `markProfileOrigin(); router.push("/profile")`; update the `(5.10)` doc comment. |
| `src/components/ui/pill-toolbar.test.tsx` | ~L49-56: also assert `sessionStorage["ambit.profileOrigin.v1"] === "1"`. |
| `src/components/sheets/collections-sheet.tsx` | `go()`: `if (href === "/profile") markProfileOrigin()`. Retire the "signpost, not an affordance" comment — sub-label "Make one on your profile" stays (now literally true). |
| `src/components/sheets/sheets.test.tsx` | New-collection-row case (~L380): profileOrigin assertion beside the existing savedOrigin-null one. |
| `src/components/feed/feed-screen.tsx` | Delete the `onProfile` toast override (~L277) — default is now real. |
| `src/components/icons/index.tsx` | New glyphs (below); add to dev/tokens' `ICONS` audit array. |
| `src/app/dev/tokens/page.tsx` | Delete the "Session" section (~L191-195) + `SignOutButton` import **in step 9, not before** (§5 ordering trap); delete the `onProfile` toast override (~L704); accent switcher's unmount reset: `"indigo"` → `storedAccent()` (stop stomping the user's preference on leave). |
| `src/app/dev/tokens/sign-out-button.tsx` | **Deleted** (step 9); logic moves verbatim into settings-screen. |
| `package.json` | `"version": "0.4.0"` *(approved)*. |
| `src/server/api/routers/routers.test.ts` | Null-session describe += `user.me` / `user.updateProfile` / `saves.createCollection` / `topics.mine`; router-shape describe += `user`; zod-rejection cases for the two new inputs. |
| `src/server/api/routers/routers.integration.test.ts` | §6.2. |
| `e2e/auth.spec.ts` | ~L110-128: sign-out test → `page.goto("/settings")`, same role+name selector; update the "interim home" comment. |

**New icons** (17×17/viewBox-24/stroke-1.7 house set; paths verbatim from the prototypes):
`Gear`, `ChevronRight` (13px, stroke 2.2), `Person`, `PersonPlus`, `FeedLines`, `Mute`, `Rays`,
`Photo`, `Bell`, `Contrast`, `Globe`, `ChatBubble`, `Plus` (26×26 grid, stroke 1.5 — dashed
tile). Reused: `Download` (Install row), `Info`, `Bookmark`, `ChevronLeft`, `PlusSquare`/`Share`
(install sheet), `Logo`.

**Do not touch:** `db/saves.ts`, feed engine, gallery code, `bottom-sheet.tsx`,
`saved-screen.tsx` (tolerates the extra `cover` field; add `cover: null` to typed test fixtures
if step 2's typecheck complains).

## 4. UI spec (distilled from the three prototypes — do not open them during execution)

Token translation: `#161411`→`bg-bg` · `#F5F1E7`→`text-ink-hi` · `#EFEBE0`→`text-ink` ·
`rgba(239,235,224,α)`→`ink/α` · `#4C5FE0`→`accent` · warn `#D98C6A`→literal `text-[#D98C6A]`
(with a "prototype's warn tint, no theme token" comment) · radius 20→`rounded-[20px]` ·
18→`rounded-[18px]` · 999→`rounded-pill`. The redesign bundle is already Sora throughout.

### `/profile` — window scroll, `bg-bg`, no sticky header, no back button

- **Icon row** `flex justify-end px-5 pt-14`: one gear — `IconButton size={38}`, 17px `Gear`,
  `aria-label="Settings"` → `markSettingsOrigin(); push("/settings")`. (Prototype's Share +
  Search discs omitted — Decision 7.)
- **Identity row** `flex items-center gap-[18px] px-5 pt-[30px]`, in `Rise`:
  `AvatarChip size={88} gradient={avatarGradient(me.id)}` (house ring kept); name
  `text-ink-hi text-[28px] leading-[1.1] font-semibold`; handle (when set) `@{handle}`
  `mt-[5px] text-[15px] text-ink/45`.
- **Bio** (when set): `px-5 pt-[14px] text-[14.5px] leading-[1.5] text-ink/58`.
- **"Edit profile"** full-width outline pill in `px-5 pt-5`: `h-[46px] rounded-pill
  border-hairline border-ink/18`, no fill, `text-[15px] font-medium text-ink` →
  `markProfileEditOrigin(); push("/profile/edit")`.
- **Collections header** `flex items-baseline gap-[9px] px-5 pt-[34px]`: "Collections"
  `text-[17px] font-semibold text-ink` + bare count `text-[13px] text-ink/40`; hairline rule
  `h-[0.5px] bg-ink/10 mx-5 mt-[14px]`.
- **Grid** `grid grid-cols-2 gap-4 px-5 pt-[18px] pb-[120px]`, each tile in `Rise` (no
  stagger — prototype rises tiles individually):
  - **NewCollectionTile first**: `aspect-square rounded-[20px] bg-ink/[4.5%] border-[0.5px]
    border-dashed border-ink/16`, centered `Plus` 26px `ink/55`; caption "New collection"
    `mt-[10px] text-[15px] font-medium text-ink`; sub "Group what you keep" `mt-[3px]
    text-[12.5px] text-ink/40`. Tap → `NewCollectionSheet`.
  - **CollectionTile** per row (order = `createdAt asc`, seeded defaults first): §3's
    cover/placeholder variants; caption name + `itemCountLabel` sub, same styles.
- **Pill**: `bookmark="idle"`, `onBookmark` opens `CollectionsSheet`, `onHome={leaveProfile}`,
  `onProfile` inert (comment: you are here), no share. **Toast** raised, 1800ms.

### `/settings` — `GlassHeader` (default row layout), no pill

- **Header**: back `IconButton size={34}` (`ChevronLeft size={15}`, `aria-label="Back"`,
  `leaveSettings`) · centered "Settings" `text-[17px] font-semibold text-ink` · `w-[34px]`
  spacer for optical centering.
- **Shortcut cards** `grid grid-cols-2 gap-3 px-5 pt-5`, in `Rise`; both
  `rounded-[18px] bg-ink/4 border-hairline border-ink/8 p-4` buttons:
  1. `AvatarChip size={44} gradient=…` · name `mt-[14px] text-[16px] font-semibold
     text-ink-hi` · "Edit profile" `mt-[3px] text-[13px] text-ink/42` → edit (marker + push).
  2. 44px `rounded-[13px] bg-ink/6 border-hairline border-ink/9` holder with outline
     `Bookmark size={19} className="text-accent"` · "Everything kept" · `1 save`/`N saves` →
     `markSavedOrigin(); push("/saved")`.
- **Groups** (`SettingsGroup` eyebrow `text-[11px] font-semibold tracking-[1.2px] uppercase
  text-ink/34 mt-[30px] mx-1 mb-[10px]`; card `rounded-[18px] bg-ink/[3.5%] border-hairline
  border-ink/8 overflow-hidden divide-y-[0.5px] divide-ink/7`; row `flex items-center
  gap-[13px] px-4 py-[15px]`, 26px icon slot `text-ink/60`, label `flex-1 text-[15px]
  text-ink`, value `text-[13.5px] text-ink/42`, chevron `ChevronRight size={13}
  className="text-ink/32"` — rule: chevron unless the row has an action pill; action pill
  `text-[13px] font-semibold bg-accent text-on-accent rounded-pill px-[15px] py-[7px]`):
  - **ACCOUNT** — Account details (`Person`, chevron → edit) · Invite a friend (`PersonPlus`,
    STUB, no value) · Add to home screen (`Download`, accent pill **"Install"** → install
    sheet).
  - **YOUR FEED** — What you see (`FeedLines`, value = first 3 picked labels joined ", " with
    `+N` overflow; "Nothing picked" when empty → topics sheet) · Muted sources (`Mute`, value
    "None", STUB) · Serendipity (`Rays`, STUB, no value).
  - **PERMISSIONS** — Camera roll (`Photo`, STUB, no value) · Notifications (`Bell`; value
    "Not asked" / "On" / "Off" in warn tint / "Unavailable"; null pre-mount → no value; tap:
    `default` → `request()`, granted/denied → toast "Change this in your browser settings.",
    unsupported → toast "Notifications aren't available in this browser.").
  - **OTHER** — Appearance (`Contrast`, value = accent name → accent sheet) · Language
    (`Globe`, value "English", STUB) · About Ambit (`Info` → about sheet) · Get in touch
    (`ChatBubble` → mailto).
  - Stub taps → toast "{label} · coming soon".
- **Sign out**: standalone one-row card `mt-[30px]` (same card chrome, no eyebrow), accessible
  name exactly "Sign out", no chevron → `signOut().then(push("/"))`.
- **Footer**: "Ambit · invite-only · {versionLabel}" `mt-[34px] pb-[120px] text-center
  text-[12px] text-ink/28` (middle dots U+00B7). **Toast** unraised, 1700ms.

### `/profile/edit` — `GlassHeader` (default row layout), no pill

- **Header**: back chevron (`leaveEdit`) · "Edit profile" 17px/600 · right slot Save
  text-button `text-accent text-[14.5px] font-semibold`, accessible name "Save", `aria-busy`
  while pending.
- **Avatar**: centered 104px disc `pt-[34px]`, in `Rise` — no caption (the prototype's upload
  copy would be a lie; flag the omission in a comment).
- **Form** `flex flex-col gap-5 px-5 pt-[34px] pb-[60px]`; field eyebrow `mb-2 text-[11px]
  font-semibold tracking-[1.2px] uppercase text-ink/38`:
  - **NAME** — `Input` placeholder "Your name".
  - **HANDLE** — `Input` placeholder "@you"; displayed bare; on submit strip leading `@`,
    lowercase, `"" → null`; inline `role="alert"` slot under the field.
  - **ABOUT** — `Textarea rows={4}` placeholder "What are you curious about?"; `"" → null`.
  - **EMAIL** — `Input readOnly` muted (`text-ink/55`), value = account email; helper
    `mt-2 text-[12px] text-ink/35`: "Only used for your invite and sign-in."
- **CTA**: full-width accent pill `h-[50px]` "Save changes" (same handler as header Save);
  **Discard** centered text link `text-[14px] text-ink/45` → `leaveEdit()` with no write.
- One centered error slot for non-conflict failures (AuthCard pattern); handle conflicts render
  under the handle field.

### Deliberately dropped from the prototypes (state in code comments where natural)

Share-profile + Search chips (Profile); "Drop a photo" slot + upload caption (Edit); editable
EMAIL; all stub-row demo values; the zero-input auto-name collection creation.

## 5. Implementation order

1. **Schema + migration**: `schema.ts` columns → `bun run db:generate` → inspect `0003_*.sql`
   → `bun run db:migrate`. Verify the invite-gate hook is untouched (nullable columns — it is;
   note it in the walkthrough, don't re-verify in code).
2. **Repo layer**: `db/users.ts`; `createCollection` + `cover` in `db/collections.ts`;
   `getUserTopicIds` in `db/topics.ts`. `bun run typecheck` (fix `cover` in any typed fixtures).
3. **Routers**: `routers/user.ts` + registration; `saves.createCollection`; `topics.mine`;
   `routers.test.ts` unit additions; §6.2 integration additions. `bun run test`.
4. **Primitives**: icons; `lib/avatar-hue.ts` (+test); `lib/accent.ts`; `AvatarChip.gradient`;
   `Textarea`.
5. **Markers + wiring**: three origin files; `pill-toolbar.tsx` default + test;
   `collections-sheet.tsx` + sheets.test; `proxy.ts` matcher. Typecheck.
6. **Accent bootstrap**: layout.tsx inline script + `suppressHydrationWarning`; dev/tokens
   unmount fix.
7. **Profile**: `collection-tile`, `new-collection-sheet`, `profile-screen`,
   `app/profile/page.tsx`; delete feed-screen's override. **Do NOT touch dev/tokens' sign-out
   yet** — the e2e suite must never have a window with no sign-out affordance.
8. **Profile edit**: `profile-edit-screen`, `app/profile/edit/page.tsx`.
9. **Settings**: `settings-row`/`SettingsGroup`, `use-notification-permission`, four sheets,
   `settings-screen`, `app/settings/page.tsx`, `package.json` bump; **now** delete dev/tokens'
   Session section + `sign-out-button.tsx`.
10. **Component tests** (three screen files) + `e2e/auth.spec.ts` retarget.
11. **`e2e/settings.spec.ts`**.
12. `bun run check`; `bun run e2e` (three consecutive runs per house convention; 15s allowances
    on ALL server-bound waits — 08-23's five-worker lesson, and this adds a sixth spec file:
    **if rotating timeout victims reappear, cap `workers` in `playwright.config.ts` rather than
    spreading more per-assertion allowances** — that was 5.9's explicit recommendation);
    `bun run build`.

Comment generously throughout, in the repo's explanatory house style (why, not what).

## 6. Testing

### 6.1 Component tests (jsdom; `vi.hoisted` state holders + mocked `~/trpc/react` /
`next/navigation` / `~/lib/auth-client`, per `saved-screen.test.tsx`)

**`profile-screen.test.tsx`**: (1) name/`@handle`/bio render from `user.me`; handle/bio absent
when null. (2) avatar disc carries `avatarGradient(id)` inline (compute expected in-test).
(3) grid: dashed tile first, then per-collection tiles; cover `<img>` vs bookmark placeholder;
`itemCountLabel` counts. (4) tile tap writes savedOrigin + pushes `/saved?collection=c1`.
(5) gear/Edit-pill write their markers + push. (6) create flow: trimmed-name mutation; success
closes + toasts "{name} created" + invalidates; CONFLICT renders inline, sheet stays open.
(7) pill `onHome` pops when marked else pushes `/feed`; avatar dot navigates nowhere.

**`settings-screen.test.tsx`**: (1) shortcut cards: name; save pluralization; taps write
markers + push. (2) all rows render; stub rows carry no fake values; stub tap toasts.
(3) What-you-see value formatting (3 labels, `+N`, empty copy); sheet opens preselected; Save
fires `setMine` with toggled ids, disabled at 0; success invalidates `topics.mine`.
(4) Notifications against a mocked `Notification` global: per-state values; `default` tap calls
`requestPermission`; absent global → "Unavailable" branch. (5) Appearance: pick Amber →
`documentElement.dataset.accent === "amber"` + localStorage + row value. (6) sign out: role+name
"Sign out" → `signOut` then `push("/")`. (7) back chevron pops when marked else pushes
`/profile`; footer shows `versionLabel`.

**`profile-edit-screen.test.tsx`**: (1) form seeds from `user.me`; email readOnly + helper.
(2) Save submits `{name, handle, bio}` — `@` stripped, lowercased, `"" → null`. (3) success:
cache updated, toast, leave after 900ms (fake timers). (4) CONFLICT → inline "That handle's
taken.", no navigation. (5) Discard/back: pop when marked else push `/profile`; nothing
submitted.

Plus `avatar-hue.test.ts` (pure) and the `pill-toolbar.test.tsx` / `sheets.test.tsx`
amendments (§3).

### 6.2 Router integration (`routers.integration.test.ts`)

New `describe("5.10 — user.me + user.updateProfile")` with `authedContext(userId)`:
(1) `me` returns the row with `handle: null, bio: null`. (2) `updateProfile` round-trips;
mixed-case handle stored lowercase. (3) other user claiming the handle → `CONFLICT`; owner
re-saving their own handle succeeds (the `excludeUserId` clause). (4) `handle: null` clears.
(Cleanup free — afterAll already deletes both users.)

Appended to the existing saves describe (after the 5.9 test; the L232 seeding-idempotence test
untouched): (5) `createCollection` appears in `collections()` with `itemCount: 0` after the
seeded three; duplicate → `CONFLICT`; duplicating seeded "Articles" → `CONFLICT`. (6) covers:
image-item collection's `cover` = its `imageUrl`; article-only collection's `cover` null.
In the topics describe: (7) `topics.mine` matches what `setMine` wrote.

### 6.3 E2E — `e2e/settings.spec.ts` (~5 serial tests, feed.spec scaffolding: timestamped
EMAIL `ambit-settings-e2e-…`, `connect()` dynamic import, `execFileSync bun run invite`,
15s timeouts on ALL server-bound waits. No seeded corpus needed — skip the item sweep;
afterAll still cleans this user's `collection` rows by EMAIL lookup, children-first.)

1. **Sign-up → Profile**: full sign-up → onboarding (3 topics) → `/feed`; pill "Profile" →
   `waitForURL("/profile")`; name visible; New-collection tile + Articles/Art/Photos tiles
   ("0 items"); pill "Feed" returns to `/feed`.
2. **Create collection + duplicate**: New collection → "Maps" → Create → toast + "Maps" tile;
   reopen, "Maps" again → inline error, sheet stays; tile tap →
   `waitForURL(/\/saved\?collection=/)`.
3. **Edit round trip**: Edit profile → set name "Ben R", handle "@BenTest", bio → Save → toast
   → back on `/profile` showing "Ben R", "@bentest", bio; gear → `/settings` card shows
   "Ben R".
4. **Settings reals**: What-you-see row shows the 3 onboarding labels; sheet toggle a 4th →
   Save → row updates; Appearance → Amber → `html[data-accent="amber"]`; reload → still amber
   (inline script); a stub row toasts "coming soon"; footer "v0.4".
5. **Sign out from its permanent home**: `/settings` → role+name "Sign out" →
   `waitForURL("/")`; `goto("/feed")` bounces. (auth.spec's retargeted test overlaps
   deliberately — this proves the full Settings path.)

## 7. Deferred / flagged (record in the walkthrough)

- **Sprite/glyph avatar generator** (preference-derived) — post-MVP; **BUILD_PLAN backlog
  entry lands with this phase's docs** (locked decision). Also deferred: per-user color on the
  *pill's* 25px disc (no user data in `PillToolbar`).
- **Serendipity / Muted sources / Invite a friend** — honest stubs; each a future phase
  (serendipity = per-user dial over JUMP share + `wildcardChance`).
- **Camera roll / Language** — stubs with no web-platform backing today.
- **Change-email** — later auth phase (verification round trip; mailer infra exists).
- **Collection deletion/rename** — deferred; `collections_seeded_at` note stays live in
  `db/collections.ts:99`. Case-insensitive uniqueness (citext) for handles/collection names —
  only if it ever bites.
- **Search on Profile** (Decision 7's omission) — revisit when search is a feature.
- **`origin(key)` helper** — six near-identical marker files is the threshold; a seventh forces
  the question.

## 8. Done-bar verification

- `bun run check` green (typecheck, eslint, prettier, vitest — expect ~35-40 new tests).
- `bun run e2e` green across all six spec files, three consecutive runs (environment notes:
  `gallery.spec:193` is a known dev-DB flake; rotating timeout victims under six-file load →
  cap `workers`, don't spread timeouts).
- `bun run build` clean; migration applied to the dev DB (`bun run db:migrate`) with existing
  users unaffected (nullable columns).
- Manual: hard-reload each of the three routes with the Network tab open — all paint from
  hydration with zero client `user.*`/`saves.*`/`topics.*` requests; accent survives a reload
  with no flash; sign-out from Settings lands on `/` signed out.

## 9. Wrap-up (house conventions)

- `docs/PHASE5_WALKTHROUGH_5.10.md` (5.9's format), including §7's deferred list.
- `docs/BUILD_PLAN.md`: rewrite the 5.10 entry recording the scope re-baseline (superseding
  "minimal viable"), check it off; add the post-MVP backlog entry for the sprite/glyph avatar
  generator.
- `log.md` extended per its format — session-spend line via
  `python3 ~/.claude/scripts/session-spend.py --session <session-uuid>` (never estimate; omit
  on non-zero exit).
- Merge `feat/5.10-profile-settings` to `main` when green.

### Critical files for implementation
- `src/components/saved/saved-screen.tsx` — the screen pattern all three new screens mirror
- `src/app/saved/page.tsx` — the RSC shell pattern (guard, no-onboarding-redirect comment,
  prefetch contract)
- `src/server/db/collections.ts` — house conflict idiom; `createCollection` + covers land here
- `src/server/api/routers/saves.ts` — the router voice `user.ts` copies (guards, error mapping)
- `src/components/feed/feed-origin.ts` — the marker file the three new origins structurally copy
