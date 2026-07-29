# Phase 1.2/1.3 walkthrough

A step-by-step account of an autonomous session that picked up Phase 1.2 and finished Phase 1.3
while Ben was away — written so he could read it after the fact and follow every move. Pairs with
the narrative decisions/findings already in `log.md`'s 07-28-26 entry; this is the "what did the
assistant actually do, in order" version.

## Getting oriented

1. **Read `log.md` and the "prefers-conventional-branches" memory** — to figure out where we'd
   left off and confirm Ben wanted plain git branches, not the `.claude/worktrees` isolation
   technique from before.
2. **Discovered Phase 1.1's work was still stuck on the old worktree branch**, un-merged into
   `main` — the decision to retire the worktree technique had been recorded last session but
   never actually carried out.
3. **Asked how to handle that** before touching anything, since merging + deleting a worktree is
   a moderately destructive action.

## Cleaning up the worktree

4. **Fast-forward merged `worktree-phase1-scaffold` into `main`** (`git merge --ff-only`) — safe
   because main had no commits of its own since that branch diverged.
5. **Unlocked and removed the worktree directory** (`git worktree unlock` then
   `git worktree remove`) — it was locked by this very session, so it had to be unlocked first.
6. **Deleted the now-merged local branch** and confirmed only the main worktree remained.
7. **Created a new conventional branch** `phase1.2-quality-tooling` off `main` to start Phase 1.2
   work.

## Phase 1.2 — Vitest, Playwright, CI

8. **Ran `bun install`** in the main checkout, then verified ESLint/Prettier/typecheck still
   passed clean on the merged scaffold.
9. **Added a `cn()` classname helper** (`src/lib/utils.ts`, using `clsx` + `tailwind-merge`) —
   picked as the "real pure function" Vitest needed to test, since components will need it soon
   anyway (not a fake placeholder).
10. **Wrote a Vitest unit test** for `cn()` and a minimal `vitest.config.ts`.
11. **Installed Playwright + Chromium**, wrote `playwright.config.ts` and one smoke test
    (`e2e/home.spec.ts`) asserting the home page loads with no console errors.
12. **Hit a real blocker**: the smoke test needs the dev server to boot, which needs
    `DATABASE_URL` — but `.env` is outside the assistant's permission boundary, so it asked Ben
    to add it via the `!` prefix.
13. **Updated `bun run check`** to chain typecheck → lint → format check → unit tests.
14. **Wrote the GitHub Actions workflow** (`.github/workflows/ci.yml`): checkout → setup-bun →
    install → check → build, with a placeholder `DATABASE_URL` for the build step (nothing
    actually connects to it).

## The plan-mode interruption

15. **Plan mode activated mid-task** (a harness-level toggle, not something either side did
    mid-conversation) — this froze further edits until a plan was produced.
16. Already discovered the **real problem**: the smoke test would still fail because the
    homepage's leftover t3-boilerplate calls a real DB query (`getLatest`), which 500s without
    Postgres — and Docker wasn't supposed to be needed until Phase 2.
17. **Asked Ben to choose** between three fixes; he picked trimming the DB call out of the
    homepage rather than standing up Postgres early or weakening the test.
18. Plan mode exited on its own once he answered, and execution resumed directly.

## Finishing 1.2

19. **Removed `<LatestPost />` and its DB-touching prefetch from `page.tsx`**, then deleted the
    now-orphaned `post.tsx` demo component entirely.
20. **Re-ran the full check suite** — all green.
21. **Asked Ben to run the `.env` fix** again — once he did, the Playwright smoke test passed for
    real.
22. **Verified `bun run build` succeeds** without a live Postgres, confirming the home route is
    server-rendered per-request, not statically prerendered at build time.
23. **Asked how Ben wanted this landed** (push+PR+merge vs. direct-to-main vs. leave it to him) —
    he picked push, open PR, merge after CI green.
24. **Committed, pushed, opened PR #1, watched GitHub Actions go green**, then merged and deleted
    the branch.
25. **Checked the BUILD_PLAN 1.2 box**, updated the now-stale 1.1 note (about the homepage
    500ing) to reflect the fix, and extended the day's `log.md` entry with a second section
    covering all of this.
26. **Tried to log the token spend** — the script couldn't find the session transcript (it was
    created under the now-deleted worktree's project folder), so the line was omitted rather than
    guessed, per Ben's logging rule.

## Phase 1.3 — PWA shell

27. **Created a new branch** `phase1.3-pwa-shell` off `main`.
28. **Looked in the design handoff docs** for the "ring-and-dot" logo — found the actual SVG
    markup in the prototype HTML files (a ring circle + center dot + small satellite dot, in the
    accent gold color).
29. **Checked current Serwist docs via Context7** before touching anything (per Ben's standing
    rule to always check docs, even when the assistant thinks it knows the answer).
30. **Found the original plan's premise was stale**: it assumed Serwist had no Turbopack support,
    but a newer `@serwist/turbopack` package now exists at the same release version. **Asked Ben
    which to use** since it revises a previously-settled decision — he picked the new one.
31. **Installed `@serwist/turbopack`, `esbuild`, `serwist`** — Bun flagged two transitive
    packages' install scripts as untrusted (`@swc/core`, `unrs-resolver`); checked they were
    legitimate direct/transitive dependencies of what was just installed, then trusted them.
32. **Wrote `next.config.js`'s `withSerwist` wrapper** and the service worker source
    (`src/app/sw.ts`), with the heaviest teaching comments in Phase 1.3 since service workers are
    the least familiar concept.
33. **No SVG-to-PNG tool was available locally** (no rsvg-convert/imagemagick/inkscape) — instead
    wrote a throwaway HTML page with the logo SVG and used Playwright's already-installed
    Chromium to screenshot it at exact pixel sizes (192/512, plus maskable variants with extra
    safe-zone padding).
34. **Visually checked the rendered icons** before using them, then copied them into `public/`.
35. **Wrote `src/app/manifest.ts`** (name, colors, icon list) and wired `<SerwistProvider>` into
    `layout.tsx`, plus added proper `Ambit` metadata (replacing leftover "Create T3 App"
    boilerplate) and iOS-specific `appleWebApp` metadata.
36. **First build attempt failed** — a type error revealed the route handler file was in the
    wrong location (a literal `sw.js` folder instead of a dynamic `[path]` segment). **Fetched
    the live docs page directly** (Context7's snippets didn't show the exact file path) to
    confirm the correct structure, then fixed it.
37. **Rebuilt successfully**, started the production server, and confirmed with `curl` that the
    manifest and service worker both serve correctly.
38. **Tried Lighthouse to verify installability** (as the original plan specified) — discovered
    Lighthouse has fully removed its PWA audits entirely. **Fell back to checking Chrome's own
    real signal** instead: used the Chrome DevTools MCP to confirm `beforeinstallprompt` fires and
    the service worker registers `active`.
39. **Ran the full check suite and the e2e smoke test again** to confirm nothing regressed, then
    committed, pushed, opened PR #2, watched CI go green, and merged.
40. **Checked the BUILD_PLAN 1.3 box**, marked Phase 1 complete, and extended the day's `log.md`
    entry a third time with everything above — including the two stale-plan-assumption findings
    (Serwist Turbopack support, Lighthouse's removed PWA audits) since those are exactly the kind
    of non-obvious things worth recording.
41. **Tried the spend script again** — same transcript-location problem, omitted the line again.

## The two biggest "had to adapt on the fly" moments

- The plan-mode DB blocker in 1.2 (homepage 500ing without Postgres, needing a scope decision).
- Discovering both Serwist's Turbopack support and Lighthouse's removed PWA audits were stale
  assumptions in 1.3 — neither was knowable without checking current docs rather than trusting
  what the 07-17 plan had baked in.
