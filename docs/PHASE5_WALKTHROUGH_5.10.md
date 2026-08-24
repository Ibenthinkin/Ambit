# Phase 5.10 walkthrough — Profile + Settings + Profile Edit

**Executed 08-24-26** against `docs/PHASE5_PLAN_5.10.md`, on branch `feat/5.10-profile-settings`,
straight through with no mid-phase stop, as the plan prescribed. `bun run check` green (642 vitest
tests, 47 of them new), `bun run build` clean, `bun run e2e` green across all six spec files on
three consecutive runs.

**Status: complete.** The plan's fourteen decisions all held. Four things argued back — one design
token the plan didn't know existed, one lint rule the plan's state shape couldn't satisfy, one
unordered query the plan (and I) assumed was ordered, and one consequence of global handle
uniqueness that bit the test fixtures twice. All four are below; none changed the phase's shape.

---

## What shipped

**Three screens, and the app's last 404s.** `/profile` (identity row over a per-user gradient
avatar, bio, Edit pill, collections grid led by a dashed New-collection tile), `/profile/edit`
(name / handle / about, with email read-only), `/settings` (the full designed surface). The
long-standing signposts they close: `PillToolbar`'s default Profile button, `CollectionsSheet`'s
"Make one on your profile" row, feed and `/dev/tokens`'s "Profile is 5.10" toast overrides, and
sign-out's move off `/dev/tokens` — `sign-out-button.tsx` is deleted, its logic verbatim in
Settings' one-row card.

**The backend they needed.** Two nullable `user` columns (`handle` unique + `bio`, migration
`0003`); a `user` tRPC router (`me` / `updateProfile`) rather than Better Auth's `updateUser`, for
the three reasons the plan gave and which all proved real; `saves.createCollection`; `topics.mine`;
and a `cover` field on `CollectionWithCount` — the most recently saved *image* per collection, via
a `DISTINCT ON` second query, which the two older sheets simply ignore.

**Settings' real/stub split, honestly.** Real: What you see (a topic re-pick), Appearance (the
4-accent knob, now persisted), Notifications (live browser permission state), Add to home screen,
About, Get in touch (mailto), Account details, both shortcut cards, Sign out. Stubs — visible, real
icon, chevron, `"{label} · coming soon"` on tap, **no invented values**: Serendipity, Muted sources,
Invite a friend, Camera roll, Language. The prototype's "2 left" / "Often" / "Not determined" demo
values are gone; the two stub values that are *true* stayed ("None" for muted sources, "English"
for language). A component test asserts the fabricated three are absent, so they can't creep back.

**The accent finally persists.** `lib/accent.ts` is now the canonical home of the four accents
(`/dev/tokens` imports from it), plus an inline `<head>` script in `layout.tsx` that re-applies the
stored value before first paint, with `suppressHydrationWarning` on `<html>`. `/dev/tokens`'s
switcher stayed a *preview*: it never persists, and its unmount restore now reads `storedAccent()`
instead of hardcoding "indigo" — which before this phase were the same thing and now aren't.

**Small enablers.** `AvatarChip` grew an optional `gradient` prop (inline `backgroundImage`,
sidestepping the tailwind-merge trap that made the static gradient a class in the first place);
`lib/avatar-hue.ts` derives it deterministically from the user id — no storage, no upload, stable
across devices; a `Textarea` primitive carrying `Input`'s classes verbatim; thirteen new icons; and
three origin markers (`profile-origin`, `settings-origin`, `edit-origin`), structural copies of
`saved-origin.ts` as the plan specified. That makes **six** near-identical marker files — the plan
named this the threshold where an `origin(key)` helper becomes defensible, and left it. A seventh
should force the question.

## Where the plan met the repo

**The warn tint already had a token.** §4 said to render the prototype's `#D98C6A` as a literal
`text-[#D98C6A]` with a "no theme token" comment. There is one: `--color-error` in globals.css is
that exact hex. Settings' denied-notification value and both inline error slots use `text-error`.

**`useState` + `useEffect` doesn't survive `react-hooks/set-state-in-effect`.** The plan's shape for
the two client-capability reads (accent from localStorage, permission from `window.Notification`) —
null state, effect fills it in — is precisely what that rule exists to flag, and the repo has it as
an *error*. Both are genuinely external stores, so both became `useSyncExternalStore` with a
`getServerSnapshot` returning `null`: the server render and the hydration render agree by
construction, and the real value lands on the pass after. Same pre-mount null the plan wanted, one
render sooner and with no lint suppression. The topics sheet's re-seed-on-open took the *other*
house answer — render-time state adjustment against a `prevOpen`, which is what `BottomSheet`
already does and which avoids a visible flicker of stale chips.

Two small hardenings fell out of writing the tests for that. `getSnapshot` needs no cache (it
returns a string, and `useSyncExternalStore` compares with `Object.is`), and caching it turned out
to be a way for the store and reality to disagree across tests. And `"Notification" in window` is
not a sufficient guard: a webview — or any test that stubs the global away — leaves the key present
with an undefined value, and reading `.permission` off that throws. The check is on the value now.

**`listTopics()` has no `ORDER BY`.** Settings' "What you see" row lists the first three picked
labels, and I wrote it to take the catalog's order, with a comment claiming that made it stable. It
doesn't: Postgres returned "Botany, Music, Astronomy" and the e2e assertion failed on it. The row
sorts alphabetically now, which needs nothing from the query. **Flagged, not fixed:** the onboarding
chip grid renders straight from that same unordered query, so its order is equally arbitrary — a
real if minor latent bug, left alone because fixing it means changing a screen this phase doesn't
own.

## Global handle uniqueness bites test fixtures — twice

`user.handle` is unique across the whole table, and e2e specs leave their user rows behind by
design (the timestamped email is what keeps *reruns* from colliding). A fixed handle in a test
therefore works exactly once:

1. `e2e/settings.spec.ts` claimed `@BenTest`. The first run passed; the second failed with the
   inline "That handle's taken." — against its own predecessor. The handle is timestamped now, like
   the email, and typed in upper case with a leading `@` so the round trip still proves both
   normalizations.
2. `routers.integration.test.ts` then failed the same way, having used the same literal — this time
   losing to the *e2e* user that had already claimed it. Its handle is now `nanoid`-derived, the
   same discipline every other id in that file already followed. (The squatted `bentest` was
   released from the dev DB by hand.)

Worth stating plainly: neither was a code defect. Both were fixtures assuming a namespace they don't
own, and both would have failed the same way on `main` in a month.

## Capping Playwright workers, at last

The plan's §5 step 12 said: if rotating timeout victims reappear under six spec files, **cap
`workers` rather than spreading more per-assertion allowances** — 5.9's own recommendation, carried
forward. They reappeared immediately. Two consecutive full runs failed two tests each, never the
same two (`gallery.spec:193`, `saved.spec:142`, `feed.spec:173` in some combination), and every one
of them passed in isolation.

`workers` is now `process.env.CI ? 1 : 3` (Playwright's default had put five on this box). Three
consecutive full-suite runs went green at 1.7–1.8 minutes against ~1.5 for the flaky five-worker
runs — the suite is I/O-bound on one dev server, so the fourth and fifth workers were buying almost
nothing and costing correctness. **Notably `gallery.spec:193` — CLAUDE.md's documented dev-DB flake
— passed all three times.** That's suggestive, not proof; the note stays until it survives a few
more sessions.

## The hydration handoff

All three RSC shells prefetch input-lessly, so the byte-identical-input contract that every previous
phase had to be careful about is trivially satisfied here (said out loud in each file, since the
*next* prefetch added to them might well take an input). Verified the way 5.9 verified its own —
throwaway Playwright spec, deleted after — with a hard document load of each route and a request
listener on `/api/trpc/`:

```
/profile      -> client tRPC calls: []
/profile/edit -> client tRPC calls: []
/settings     -> client tRPC calls: []
```

The accent's no-flash reload is covered in the shipped e2e spec rather than by hand: pick Amber,
assert `html[data-accent="amber"]`, reload, assert it again.

## Deferred / flagged (from the plan's §7, plus two found here)

- **Sprite/glyph avatar generator** (preference-derived) — post-MVP; the BUILD_PLAN backlog entry
  lands with this phase's docs. Also deferred: per-user color on the *pill's* 25px disc, which has
  no user data to work from.
- **Serendipity / Muted sources / Invite a friend** — honest stubs, each a future phase (serendipity
  = a per-user dial over JUMP share + `wildcardChance`).
- **Camera roll / Language** — stubs with no web-platform backing today.
- **Change-email** — a later auth phase (verification round trip; the mailer exists).
- **Collection deletion/rename** — deferred, so `db/collections.ts`'s `collections_seeded_at` note
  stays live. Case-insensitive uniqueness (citext) for handles and collection names — only if it
  ever bites; today "art" and "Art" can coexist, and that's commented at the router.
- **Search on Profile** — omitted rather than stubbed (a stub outside Settings would break the
  pattern); revisit when search is a feature.
- **`origin(key)` helper** — six marker files now. A seventh forces the question.
- **NEW: `listTopics()` is unordered**, so the onboarding chip grid's order is arbitrary. See above.
- **NEW: the `updateProfile` handle race is accepted and commented** — two users claiming the same
  free handle in the same instant means the loser gets a 500 rather than a clean CONFLICT. Same
  shape as `saveToCollection`'s accepted double-bump; there is no `onConflict` clause for an UPDATE
  to lean on.

## Files

**New** — `src/server/db/users.ts`, `src/server/api/routers/user.ts`, `src/lib/avatar-hue.ts`
(+test), `src/lib/accent.ts`, `src/components/ui/textarea.tsx`,
`src/components/profile/{profile-origin,edit-origin,collection-tile,new-collection-sheet,profile-screen,profile-edit-screen}`
(+2 screen tests), `src/components/settings/{settings-origin,settings-row,use-notification-permission,topics-sheet,accent-sheet,about-sheet,install-sheet,settings-screen}`
(+screen test), `src/app/profile/page.tsx`, `src/app/profile/edit/page.tsx`,
`src/app/settings/page.tsx`, `e2e/settings.spec.ts`, `drizzle/0003_ambitious_true_believers.sql`.

**Modified** — `schema.ts` (two columns), `db/collections.ts` (covers + `createCollection`),
`db/topics.ts` (`getUserTopicIds`), `routers/{saves,topics}.ts`, `api/root.ts`, `proxy.ts`,
`app/layout.tsx` (accent bootstrap), `ui/avatar-chip.tsx`, `ui/pill-toolbar.tsx` (+test),
`sheets/collections-sheet.tsx` (+`sheets.test.tsx`), `feed/feed-screen.tsx` (override deleted),
`icons/index.tsx`, `app/dev/tokens/page.tsx`, `package.json` (0.4.0), `routers.test.ts`,
`routers.integration.test.ts`, `e2e/auth.spec.ts`, `playwright.config.ts`.

**Deleted** — `src/app/dev/tokens/sign-out-button.tsx`.
