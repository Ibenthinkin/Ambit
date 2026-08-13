# Phase 5.4 — Feed: detailed execution plan

> ⚠️ **PAUSED — do not execute as-is.** Written 08-13-26, on branch `phase-5.4-feed`, in a planning
> session that got as far as a full design pass (three parallel `Explore` agents covering the old
> design handoff, the backend contract, and existing frontend conventions, then a `Plan` agent
> synthesizing all three into the plan below) before Ben stopped the work: he's unhappy with the
> current design handoff (`docs/design_handoff_ambit_pwa/`) and is redesigning it in Claude's
> design tool. Building this screen against a visual spec that's about to be replaced would waste
> the work and risk anchoring the real build on the wrong design.
>
> **What's still trustworthy here** — reuse without re-deriving: the backend contract section
> (`feed.page`/`saves.toggle`/`items.byId` signatures, the `Item` schema, `driftPath` semantics
> confirmed directly against `src/server/services/feed.ts`, the cursor/`nextCursor` end-of-feed
> signal, image-serving reality — no proxy, no `next/image` configured), the RSC-prefetch pattern
> findings (`prefetchInfinite`/`HydrateClient`, zero existing consumers, the query-key-match
> requirement), and the frontend primitive/token inventory (everything in `src/components/ui/`,
> the icon set, CSS tokens) — none of that is design-dependent, all of it was verified against the
> real repo on 08-13-26.
>
> **What's stale and must be re-derived once the new design lands**: the entire "Exact design
> handoff spec" section below (every pixel value, class translation, and copy string came from the
> *old* `Ambit - Feed.dc.html` prototype), the Visual Spec section, and the Copy table. The gesture
> *logic* (12px tap-slop, 480ms hold, 320ms double-tap window) is more likely to survive a visual
> redesign than the exact spacing does, but re-verify against whatever the new design actually
> specifies rather than assuming it carries over.
>
> **Also unresolved, independent of the redesign**: Decision 1 below (where sign-out lives once
> the `/feed` placeholder is deleted) was flagged by the planning pass as a real product call
> needing Ben's sign-off, not something to silently decide — still open. The new design may settle
> it directly.
>
> **Next step when resuming**: re-run the design-handoff exploration against whatever Ben brings
> back, reuse the backend/primitive research below as-is, redo only the visual-spec translation,
> copy, and gesture-constant verification, then re-check this whole document against the current
> repo state (Phases 5.1–5.4 will have moved on) before treating any of it as ready to execute.

---

> Companion to [`BUILD_PLAN.md`](BUILD_PLAN.md) Phase 5 (step 5.4), same format as
> [`PHASE5_PLAN_5.3.md`](PHASE5_PLAN_5.3.md) / [`PHASE5_PLAN_5.2.md`](PHASE5_PLAN_5.2.md). Written
> 08-13-26. Check the BUILD_PLAN box when the *Done =* line is met.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or
> superpowers:subagent-driven-development) to implement this plan step-by-step.
>
> **Workflow note (Ben's plan-then-execute-cheaper):** written in a planning session with docs
> verification done (findings inlined below); the executing session works cold from this file.
> When live docs contradict this plan, re-verify against docs before trusting either.
>
> **Assumes:** Phases 1–4 and Phase 5.1–5.3 complete and merged to `main` — tokens, the accent
> knob, 12 icons, 11 primitives in `src/components/ui/`, the real `/`, `/reset-password`,
> `/onboarding` flows, and a throwaway `/feed` placeholder carrying the session + onboarding
> guards forward into this phase. Read `docs/PHASE5_WALKTHROUGH_5.2.md` and
> `docs/PHASE5_WALKTHROUGH_5.3.md` before starting; this plan assumes that vocabulary (the alpha
> ladder, the `aria-busy`-not-`disabled` submitting pattern, "local `submitting`/`error` state, not
> the mutation's own flags") without re-explaining it.

**Goal:** `/feed` per handoff §3 — the infinite, mixed-media core loop. Sticky glass header,
`useInfiniteQuery` on `feed.page` with an `IntersectionObserver` sentinel + "finding something
interesting…" tail loader, `ImageCard` + `ArticleCard` rendering real DB content, serendipity
connective rows between drifted cards, movement-guarded taps, save (`saves.toggle`, optimistic)
and share (real Web Share API + clipboard fallback), article hold-~480ms-or-double-tap expand with
a filling progress bar, and an in-page "quick fullscreen preview" on image tap — **not** a
navigation to a Gallery route (5.5 doesn't exist yet; see Decision 2 below on scope).

*Done =* smooth infinite scroll of real DB content; every interaction in this plan's Visual Spec
works by hand at 402×874, matching `docs/design_handoff_ambit_pwa/screenshots/03-feed.png`.

**The core framing:** unlike 5.3 (a near-straight port), this is a **partial port with two
deliberate cuts and one deliberate rewrite.** Cut 1: the serendipity row's prototype copy
("Because you saved Rayleigh scattering" → "a painter chasing the very same light") is hand-authored
narrative text baked into the prototype's fixed `POOL` — there is no backend field that could ever
produce that sentence. The real row renders `"{FromTopicLabel} → {ToTopicLabel}"` from
`driftPath`'s topic ids, per the visual spec's own literal template. Cut 2: image tap opens an
in-page overlay, not `Ambit - Gallery.dc.html?start=<id>` — Gallery is Phase 5.5. Rewrite: share
goes from the prototype's fake `setTimeout` + fabricated toast to the real Web Share API with a
clipboard fallback. Everything else — layout, spacing, the two gesture systems (movement-guarded
tap, hold-vs-double-tap), the loader, the toast shape — is a close port.

---

## Decisions settled during planning

1. **⚠️ Flag for Ben — sign-out has no production home in 5.4, and that's a product call, not
   just an implementation one.** The design handoff has zero sign-out affordance on any screen
   (`PHASE5_PLAN_5.2.md` Decision 3, `PHASE5_WALKTHROUGH_5.2.md`'s findings). `/feed`'s throwaway
   placeholder — the only place `SignOutButton` currently lives — is deleted in this phase per its
   own `DELETE IN 5.4` comment. **This plan's recommendation: ship nothing in its place on
   `/feed` itself**, and cover the two real needs that creates with two narrow, already-precedented
   workarounds instead of inventing new production UI:
   - **Manual/dev testing:** relocate `SignOutButton` (`src/app/feed/sign-out-button.tsx` →
     `src/app/dev/tokens/`) and render it on `/dev/tokens`, which is already
     `NODE_ENV === "production" ? notFound()`-gated and already the repo's designated
     pre-Phase-9 junk drawer (its own walkthrough calls it exactly that). Zero visual or
     behavioral change to `/feed`.
   - **e2e:** `e2e/auth.spec.ts`'s "sign out" step moves from clicking a button on `/feed` to
     visiting `/dev/tokens` and clicking the relocated button there — still a real UI interaction,
     not a `page.evaluate`/cookie-clearing hack.

   **Correction caught during review, before Ben paused the work (do not lose this when
   resuming):** `/dev/tokens`'s `NODE_ENV === "production"` gate means this "recommendation" makes
   sign-out **categorically unreachable in a real production deploy**, not just hard to discover —
   confirmed by reading the actual guard (`src/app/dev/tokens/page.tsx:131`). This is a materially
   bigger regression than the plan originally framed it as, and three options were on the table
   when the session paused to ask Ben directly (not yet answered):
   (a) a quiet muted text-link in the end-of-feed empty state (stays reachable in production,
   doesn't collide with the header spec),
   (b) the `/dev/tokens` relocation above (simplest, but production-unreachable),
   (c) a small, unobtrusive affordance kept directly on `/feed` itself (most reachable, diverges
   furthest from the exact screenshot).
   **Resolve this with Ben before executing**, ideally informed by whatever the new design does or
   doesn't say about it.

   *Rejected, seriously considered:* a hold-~600ms gesture on the header wordmark, reusing the
   article-card hold machinery this phase already builds — invisible to the screenshot diff, real
   in production, and nearly free given the hook this plan builds anyway. Rejected because it's an
   **undiscoverable production affordance on the one screen every session touches**, and deciding
   "ship a secret gesture as the real sign-out path" is a genuine UX call this plan shouldn't make
   unilaterally.
   *Rejected:* a header icon-button — directly collides with the header's exact two-element spec
   (wordmark + bookmark) that the Verification screenshot diff exists specifically to catch.

2. **Image tap opens a local, in-page "quick fullscreen preview" — no route, no `?focus=`.**
   Already decided upstream of this plan (not re-litigated here): the prototype's actual wiring
   sends image taps to `Gallery.dc.html?start=<id>` (Phase 5.5), which doesn't exist yet. A
   separate `openImage`/`closeImage` overlay exists in the prototype's own JS but the template never
   calls it via the image tap handler (`onImgUp` calls `openGallery`, not `openImage`) — an apparent
   leftover from an earlier draft. **This plan builds that leftover overlay for real**, wired to
   the actual image tap, and leaves `?focus=` return-scroll entirely to 5.5. `data-feed-id` is
   still emitted on every card wrapper (Decision 10) since it costs nothing and gives 5.5 a
   head start, but nothing in 5.4 reads it.

3. **BUILD_PLAN's 5.4 line overstates scope — correct it when the box is ticked.** It currently
   reads "...quick fullscreen preview, `?focus=` return-scroll." Per Decision 2, `?focus=`
   return-scroll is explicitly **not** built here — same "correct a line that predates a
   divergence" move 5.3 made for BUILD_PLAN's "32-chip" text. Drop the `?focus=` clause from the
   5.4 line in the same edit that ticks the box.

4. **Serendipity row copy is `"{FromLabel} → {ToLabel}"` from `driftPath`, not narrative text.**
   Per the backend's own doc comment (`src/server/services/feed.ts:72-74`, verified 08-13-26):
   `driftPath` is `[start, hop1, hop2?]` for DRIFT and `[start, landing]` for JUMP, **absent for
   CORE**, and — critically — can be **length 1** when a topic's adjacency row has no positive
   neighbour (`why: "DRIFT · poetry (no row)"`, `driftPath: ["poetry"]`) or when JUMP's row is
   empty. A length-1 path has no genuine from→to pair. **Render the row only when
   `card.driftPath !== undefined && card.driftPath.length >= 2`.** `from` = `driftPath[0]`; `to` =
   `card.topicId` (identical to `driftPath.at(-1)` by construction — using the card's own field is
   more direct than re-deriving it). For a 2-hop DRIFT (`[start, hop1, hop2]`), collapse to a
   single `from → to` pair (`driftPath[0]` → `card.topicId`) rather than rendering two arrows — the
   visual spec shows exactly one rule/diamond/arrow, never a chain. Map both ids through a
   `topicId → label` dictionary built server-side from `TOPICS` (same "server page maps `TOPICS`
   down, passes as a prop" pattern `/onboarding/page.tsx` already established for the exact same
   config file — don't have the client component import `~/server/config/topics.ts` directly,
   stay consistent with that precedent).

5. **`useTapGuard` is a new shared hook, in a new `src/hooks/` directory — the repo's first.**
   `usePressExpand` (hold/double-tap) stays local to `src/components/feed/`. The split is
   deliberate, not arbitrary: the design handoff's own README explicitly reuses "movement-guarded,
   same as Feed" tap logic for Saved's tile tap (§5) and the public Item page's image tap (§6) —
   two confirmed near-term consumers outside Feed. Nothing in the README describes a hold-to-expand
   interaction anywhere but the article card, so there's no known second consumer to justify
   promoting `usePressExpand` yet.

6. **Both gesture hooks are designed for per-card component instances, not the prototype's
   single-screen-class state.** The prototype needed `pressingIdx`/`lastTap.idx` comparisons
   because one class instance managed gesture state for every card on screen. Since `ArticleCard`
   is a real per-item React component here, each instance's `usePressExpand` call gets its own
   closure-scoped `useRef`s — no index bookkeeping needed, and no risk of one card's double-tap
   window leaking into another's. This is a genuine simplification the architecture change buys for
   free, not a corner cut.

7. **Progress-bar fill and card press-scale use Tailwind class-toggling, not inline styles** (the
   prototype's `pressBarStyle`/`cardStyle` objects). `duration-[480ms] ease-linear` while holding
   vs `duration-[180ms] ease-out` on release/cancel are both exact, arbitrary-value Tailwind
   classes — no precision lost. The card's `scale(0.985)` transition uses `ease-out` as the nearest
   built-in stand-in for the prototype's plain CSS `ease` (imperceptible difference at 0.2s / 1.5%
   scale delta) rather than an arbitrary `[transition-timing-function:ease]` property, consistent
   with the alpha-ladder precedent of normalizing one-offs to the nearest existing stop rather than
   reproducing every value bit-for-bit.

8. **Image card heights are a fixed 4-value rotation keyed by the card's position in the
   flattened, cross-page card list — not aspect-ratio-derived, not per-image-page-relative.**
   `IMAGE_HEIGHT_CLASSES = ["h-[224px]", "h-[248px]", "h-[276px]", "h-[300px]"]`, indexed by
   `globalIndex % 4` where `globalIndex` is the card's position across *all* loaded pages
   concatenated (not reset per network page — resetting per page would create a visible rhythm
   aligned to fetch boundaries). **These must be literal, statically-visible class strings
   somewhere in source** (e.g. the array above) — Tailwind's scanner can't see a runtime template
   literal like `` `h-[${h}px]` `` and would silently emit no height utility at all if this class
   list weren't spelled out verbatim. *Rejected:* aspect-ratio-based sizing — the prototype's
   224–300px range is a deliberate curated-variety choice (its own `POOL` hardcodes a height per
   item), not an accident of unknown image dimensions; object-cover into a fixed height is also
   what avoids any CLS from images loading at their native size.

9. **Image load failures render a muted placeholder block, not a broken-image icon.** No image
   proxy exists (confirmed, per the brief); every `imageUrl` is a live external URL (Wikimedia
   Commons, museum CDNs) that can 404, hotlink-block, or simply be slow. `ImageCard` and the
   fullscreen overlay each track local `broken: boolean` via the `<img>`'s `onError`; when true,
   render a `bg-ink/5` block at the same height/radius with a small centered `text-ink/40` caption
   ("Image unavailable") instead of the `<img>` — title/meta footer render normally either way, so
   a broken image never blanks the whole card.

10. **`data-feed-id="{item.id}"` is kept on each card's wrapper div**, wrapping both the optional
    serendipity row and the card itself in one boundary (mirrors the prototype's own DOM shape
    exactly). Free, harmless, and gives 5.5 a head start on `?focus=` scroll-restoration without
    this phase needing to build or test any of that logic itself.

11. **No per-card `<Rise>` stagger on initial paint, and no rise animation at all on
    infinite-scroll-appended cards.** `Rise`'s own doc comment anticipates "feed cards appearing
    one after another," but applying that literally here has two problems this plan explicitly
    overrides: (a) it's the same "one wrap, not per-item" call 5.3 already made for a *bounded*
    16-chip grid — Feed's list is unbounded, and a stagger cascade across dozens of cards reads as
    slow, not calm; (b) worse, if applied to cards appended by `fetchNextPage()`, every scroll-driven
    load would re-trigger a rise cascade on newly appended content, which looks like flicker/churn
    on an already-settled list, not an entrance. **Decision: wrap only the initial
    server-hydrated page's card column in one `<Rise>`** (matching the single-wrap precedent used
    everywhere else); cards from subsequent page fetches render with no entrance animation.
    Documented here and in the component's own comment so it isn't rediscovered as a "missing
    animation" bug later.

12. **No `saves.list` call on mount to seed initial saved-state.** The brief flags this as
    optional; this plan skips it. `feed.page` cards carry no per-card `saved` field by design (the
    brief states this explicitly, and it's confirmed against the router), so save state is tracked
    entirely in local optimistic component state, starting empty (`Set<string>`) on every mount.
    The real gap this leaves — a save made in a *previous* session doesn't show as filled if that
    same card happens to reappear in a later session — is narrow (the Saved screen that would make
    this visible doesn't exist until 5.6) and self-healing (tapping save again just re-toggles
    correctly via the server's own insert-or-delete logic; the icon briefly shows the "wrong" state
    but never causes a wrong *write*). Revisit holistically once `/saved` exists and it's clear
    whether `feed.page` itself should start returning per-card saved state instead of a client-side
    join.

13. **Save has no confirmation toast; share does.** Matches the prototype's own asymmetry (it
    toasts only on share, never on save) rather than adding one for symmetry. The icon's fill/unfill
    is itself the confirmation for a fast, frequent, reversible micro-interaction — a toast on every
    save tap is friction the "calm, not-social" positioning doesn't want. Share is different: it's
    the one action that could silently leave the app or fail without any visible feedback, which is
    exactly what a toast is for.

14. **Real share behavior diverges from the prototype in three ways**, all deliberate:
    - **URL:** `${window.location.origin}/i/${item.id}` — the real, semantically-correct
      destination, even though `/i/[itemId]` (Phase 5.7) doesn't exist yet and this 404s today.
      *Rejected:* sharing `item.sourceUrl` (the external museum/Wikipedia link) — defeats the whole
      point of Phase 5.7's investment (Ambit's own "shared by" attribution + OG tags never get
      seen), and sends people to a third party instead of back into the product. *Rejected:*
      omitting `url` from the `navigator.share()` call — the `url` field is what makes the native
      share sheet actually do something useful; a text-only share is close to a no-op on most
      platforms.
    - **No toast on a successful native share.** The OS's own share sheet UI is the confirmation;
      showing a toast after it (as if something were "copied") would be actively wrong — nothing
      was copied. `AbortError` (user cancelled the sheet) is treated identically — no toast, no
      fallback.
    - **Toast only fires on the clipboard fallback** (`navigator.share` unsupported, e.g. desktop
      Chrome) — real copy text, not the prototype's fabricated `ambit.link/i/{id}` domain (this app
      has no such domain; inventing one in shipped copy would be worse than a plain generic
      string). Toast: "Link copied to clipboard." A failure on *both* paths (share unsupported
      *and* clipboard write rejected — e.g. an insecure context) shows "Couldn't share this — try
      again."

15. **The prototype's two near-identical hold/double-tap strings are preserved verbatim, not
    unified**, despite looking like a possible typo (comma placement: label "Hold or double-tap to
    read" vs. toast hint "Hold, or double-tap, to read"). Both are independently marked
    "prototype-exact" in this plan's own copy sourcing — the safer default, given no found evidence
    either way, is to preserve exactly what's there rather than silently "fix" something that might
    be an intentional label-vs-spoken-hint register shift. Flagged in the Copy table footnote for
    Ben to override if it's confirmed to be a typo.

16. **`Toast` (the shared primitive) gains `role="status" aria-live="polite"`.** It currently has
    neither (confirmed directly against `src/components/ui/toast.tsx`). This phase is the
    primitive's first real functional consumer beyond a dev-tokens button trigger — worth fixing at
    the shared component (5.5's gallery share toast and 5.6's unsave toast inherit the fix for
    free), same category of "real improvement to the primitive, not a local workaround" as 5.2's
    `Input` placeholder-color fix.

17. **`FullscreenPreview` is a new Feed-scoped component (`src/components/feed/`), not a new
    `src/components/ui/` primitive.** *Rejected:* building it as a shared primitive now,
    anticipating 5.5's Gallery reusing its shape — Gallery's swipe-rail, chrome auto-cycle, and
    details-sheet complexity (README §4) make it a fundamentally different, much larger component;
    committing to a shared shape now risks either an overfit primitive or an awkward one two phases
    later. Escape-to-close is added (the prototype's overlay has no keyboard close at all) for
    consistency with `BottomSheet`'s own established Escape-close convention.

18. **`@tailwindcss/typography` is not installed, contra `SPEC.md` §10's note that it "lands in
    Phase 5.4."** That note predates inspecting the actual `item.body` field: it's plain text
    (paragraphs separated by `\n\n`), not markdown or HTML, and the design spec renders it with
    plain `whitespace-pre-line` — no list/heading/blockquote styling ever appears in the handoff's
    article-expand state. Correct that SPEC line in this phase's Docs step, same move as 5.3's
    32-chip correction.

19. **Article cards get real keyboard/screen-reader access, not just the hold/double-tap gesture**
    (see Accessibility section) — the prototype's design has a genuine, unaddressed accessibility
    gap here (no non-pointer way to expand an article at all), and this plan treats closing it as
    in-scope rather than a follow-up.

20. **IntersectionObserver test mocking: a permissive global stub in `src/test/setup.ts`, overridden
    per-test where triggering matters.** jsdom (v30, confirmed current version) still doesn't
    implement `IntersectionObserver` at all — any component test that merely *renders* a component
    using it would throw without a stub, and this is the repo's first consumer. Add a minimal
    always-present class (`observe`/`unobserve`/`disconnect` no-ops, calling the constructor
    argument never) to `setup.ts` as a safety net for any future incidental consumer (5.5's Gallery,
    5.6's Saved lazy-load are both plausible). In `feed-screen.test.tsx` specifically, override it
    per test via `vi.stubGlobal("IntersectionObserver", ...)` with a fake that captures the
    constructor's callback so the test can invoke it manually to simulate "sentinel scrolled into
    view," restored via `vi.unstubAllGlobals()` in `afterEach` (built into Vitest, no manual
    bookkeeping).

---

## Docs findings (verified 08-13-26 — do not re-derive)

- **`driftPath` semantics, read directly from `src/server/services/feed.ts` (not just the router's
  type comment):** absent for CORE; `[start]` (length 1) for a DRIFT/JUMP topic with no positive
  adjacency row (`"(no row)"` fallback); `[start, hop]` for a normal 1-hop DRIFT/JUMP; `[start,
  hop1, hop2]` for a 2-hop DRIFT (`rng() < knobs.hop2`, default second-hop probability ≈ 0.5 per
  SPEC §9). Decision 4 above is built directly on this.
- **`GlassHeader` (`src/components/ui/glass-header.tsx`) already implements the exact header
  padding this phase needs**: `pt-14 px-5 pb-3` = 56/20/12px, matching the prototype's
  `56px 20px 12px` literally, built in 5.1 anticipating this screen. **No safe-area-inset handling
  exists anywhere in the repo** (confirmed by grep — zero hits for `safe-area`/`viewport-fit`/
  `env(safe`), and Onboarding's header used a literal `pt-16` the same way — so this phase follows
  that established precedent (literal px values, no `env()`) rather than introducing a new
  convention unilaterally.
- **`IconButton`'s default (non-glass) variant is `bg-ink/5 border-ink/12`** (confirmed directly
  against `src/components/ui/icon-button.tsx`, not just its header comment, which cites slightly
  different ~0.06/0.09 alphas — a pre-existing minor comment/code drift in that file, not something
  this phase needs to fix, just don't trust the comment's literal numbers over the code). The
  `glass` variant is `bg-ink/9 border-ink/16`, which matches the fullscreen overlay's stronger-fill
  spec closely enough to reuse as-is, per the same "nearest ladder stop, not a bit-for-bit one-off"
  normalization 5.1 already established for this exact component.
- **`--radius-input` (14px) is the closest existing token to the overlay image's 14px radius**,
  despite being named/commented for text inputs and landing buttons. Reusing it (`rounded-input`)
  rather than adding a new one-off token for a single call site is consistent with the ladder's own
  "reuse the nearest stop" philosophy, documented inline where used so it isn't mistaken for a
  content-vs-radius-naming bug later.
- **`saveItem` (`src/server/db/saves.ts`) does not currently touch `user_topic.weight`** —
  confirmed by reading the file; no `userTopic` import or write exists there. SPEC §9's
  "saving nudges topic weight" personalization loop is **not yet wired**, at least not at the
  repository layer this phase consumes. Out of scope for 5.4 either way (this phase only calls the
  already-built `saves.toggle` mutation) — noted so the executing session doesn't go looking for
  personalization feedback that isn't there yet, or feel obligated to add it.
- **`api.feed.page.prefetchInfinite(input)` is the RSC hydration-helper's infinite-query analog to
  `.prefetch(input)`**, both auto-generated per query procedure by `createHydrationHelpers`
  (`src/trpc/server.ts`, unchanged this phase) — confirmed against tRPC's own docs (classic
  `@trpc/react-query/rsc` integration, not the newer `@trpc/tanstack-react-query` proxy pattern this
  repo doesn't use). The client's `useInfiniteQuery({}, { getNextPageParam: (last) =>
  last.nextCursor })` call must use the **same input** (`{}`) as the server's `prefetchInfinite({})`
  for the query keys to match and hydration to actually connect — passing `knobs` on one side and
  not the other would silently produce two different cache entries and a client-side refetch
  waterfall exactly like the plumbing was built to avoid.
- **`hasNextPage` (from `useInfiniteQuery`'s result) already encodes "no `nextCursor` = end of
  feed" via React Query's own convention** — `getNextPageParam` returning `undefined` on the last
  page is what makes `hasNextPage` become `false`. No separate "is this really the end" check is
  needed beyond what the hook already computes.
- **The prototype's `scrollerRef`-scoped `IntersectionObserver` root is prototyping scaffolding**
  (`ios-frame.jsx`'s device-bezel demo needs an internal scroll container; the real PWA scrolls the
  whole page/viewport). The real sentinel's observer must use the default root (`null` = viewport),
  not a custom scroller ref — there is no such element in the real layout.
- **`TOPICS` (`src/server/config/topics.ts`) has no `server-only` import and is pure data**, but
  the established pattern (`/onboarding/page.tsx`) is still to map it down and pass as a prop from
  the server page rather than have the client component import it directly — followed here for
  the topic-label lookup (Decision 4), for consistency, not because the file is actually
  import-unsafe client-side.

---

## Architecture

```
src/app/feed/page.tsx                            (edit)    real screen: guards + prefetchInfinite + HydrateClient
src/app/feed/sign-out-button.tsx                  (delete)  moved, see Decision 1
src/app/dev/tokens/page.tsx                       (edit)    gains the relocated SignOutButton
src/components/feed/feed-screen.tsx               (client)  top-level: useInfiniteQuery, sentinel, header, overlay, toast
src/components/feed/image-card.tsx                (client)
src/components/feed/article-card.tsx              (client)
src/components/feed/serendipity-row.tsx           (client, presentational only)
src/components/feed/fullscreen-preview.tsx        (client)
src/components/feed/use-press-expand.ts           (client hook)
src/components/feed/source-label.ts               (pure util — SOURCE_LABELS map + sourceLabel())
src/components/feed/image-heights.ts              (pure util — IMAGE_HEIGHT_CLASSES + heightClassFor())
src/components/feed/share-item.ts                 (pure util — real Web Share + clipboard fallback)
src/hooks/use-tap-guard.ts                        (client hook — first file in a new src/hooks/ dir)
src/components/feed/feed-screen.test.tsx
src/components/feed/image-card.test.tsx
src/components/feed/article-card.test.tsx
src/components/feed/fullscreen-preview.test.tsx
src/hooks/use-tap-guard.test.ts
src/components/feed/use-press-expand.test.ts
src/components/ui/toast.tsx                       (edit)    + role="status" aria-live="polite" (Decision 16)
src/test/setup.ts                                 (edit)    + permissive global IntersectionObserver stub
e2e/auth.spec.ts                                  (edit)    sign-out step now goes through /dev/tokens
e2e/feed.spec.ts                                  (new)     see Test coverage
SPEC.md                                           (edit)    §10 typography-plugin note corrected
docs/BUILD_PLAN.md                                (edit)    5.4 line's `?focus=` clause dropped, box ticked
```

### A structural note, same shape as 5.2's and 5.3's

**`/feed` must stay dynamic.** It already reads `headers()` (unchanged guards); this phase adds a
real DB-backed `prefetchInfinite` call on top of that, which is an even stronger reason the route
can never be allowed to prerender. Confirm with `bun run build` under CI's placeholder env exactly
as the prior two phases did — this is the specific gate that would catch a route quietly opting
back into static generation.

---

## The Feed screen

### `FeedScreen` (`src/components/feed/feed-screen.tsx`)

Props: `topicLabels: Record<string, string>` (built server-side from `TOPICS`, per Decision 4).

State:
- `saved: Set<string>` — optimistic save state, item ids, starts empty (Decision 12).
- `fullscreenId: string | null` — which item (if any) the quick-preview overlay shows.
- `toast: string | null` — current toast text, `null` = hidden. Reuses the `Toast` primitive's own
  dismiss-timer ownership; this component just flips `toast` back to `null` in `onDone`.
- `expanded: Record<string, boolean>` — keyed by **item id**, not array index (more robust than
  the prototype's index-keying: an id can never point at "the wrong card" even if the underlying
  list were ever reordered, which a cursor-paginated infinite list never should be mid-session, but
  costs nothing to get right regardless).

Data: `api.feed.page.useInfiniteQuery({}, { getNextPageParam: (last) => last.nextCursor })`.
`const cards = data?.pages.flatMap((p) => p.cards) ?? []`.

Sentinel effect: an `IntersectionObserver` (`rootMargin: "500px"`, default root) observing a 1px
sentinel div after the card list; on intersect, `if (hasNextPage && !isFetchingNextPage)
fetchNextPage()`. `rootMargin: 500px` is kept exactly as the prototype specifies — it's a
prefetch-ahead distance, not a network-latency simulation (that was the prototype's separate fake
`setTimeout(600)`, which the real query naturally replaces with actual latency); 500px is a
reasonable "start the next real fetch before the user physically reaches the bottom" margin.

Render, top to bottom:
1. `<GlassHeader>` — wordmark span (exact copy/classes below) + bookmark `IconButton` (34px,
   non-glass, `<Bookmark />`, **no `onClick` at all** — conceptually routes to `/saved`, Phase 5.6;
   left genuinely inert with a one-line comment, not a fake no-op handler, so it's honest about
   doing nothing yet rather than simulating a dead link).
2. The card column: `.map()` over `cards`, one `<div data-feed-id={card.item.id} key={card.item.id}>`
   per card, containing (a) an optional `<SerendipityRow>` when Decision 4's condition holds, then
   (b) `<ImageCard>` or `<ArticleCard>` by `card.item.type`. The **first page's worth of cards**
   (i.e., everything already resolved via the RSC `prefetchInfinite`) is wrapped in one `<Rise>`;
   cards belonging to any subsequently-fetched page render with no entrance animation (Decision 11).
   A simple way to draw that boundary without extra state: wrap the render of
   `data.pages[0]?.cards` in `<Rise>` and map `data.pages.slice(1)` unwrapped.
3. Sentinel + tail region: if `isFetchingNextPage` (or the initial `isLoading` before any page has
   resolved — same visual, see Decision below), render the loader row (`Spinner` size 15 + italic
   caption). If `!hasNextPage && cards.length > 0`, render the end-of-feed copy instead. If
   `isError` on the very first page (`cards.length === 0 && isError`), render an inline error +
   "Try again" (`refetch()`) in the same slot. If a *later* page's fetch fails
   (`fetchNextPage()`'s own promise rejects — check via `isFetchingNextPage` transitioning false
   with `isError` on the infinite query, or simpler: wrap the `fetchNextPage()` call in a
   try/catch that sets a local `pageError: boolean` and shows a small "Couldn't load more — try
   again" row without touching already-rendered cards). This entire tail region gets
   `aria-live="polite"` so a screen-reader user is told when more content loads or the feed ends.
4. `<FullscreenPreview>`, rendered only when `fullscreenId` is non-null (found by looking up the
   item in `cards`).
5. `<Toast text={toast ?? ""} open={toast !== null} onDone={() => setToast(null)} />`.

**No skeleton loading state is built.** Reasoning stated explicitly rather than silently omitted:
the RSC `prefetchInfinite` means the *first* page is normally already resolved before the client
ever paints, so there's no flash-of-empty-feed in the common case; the one loading UI the handoff
actually specifies anywhere is the tail loader (spinner + caption). This same loader doubles as the
fallback for the rare case where a client mounts before hydration resolves (`isLoading` true, zero
pages yet) — reusing it rather than building a distinct skeleton keeps this to one loading
treatment total, not two.

### `ImageCard` (`src/components/feed/image-card.tsx`)

Props: `item: Item`, `saved: boolean`, `heightIndex: number` (the card's global flattened index,
mapped through `image-heights.ts`), `onToggleSave: () => void`, `onShare: () => void`,
`onOpen: () => void`.

State: `broken: boolean` (Decision 9), starts `false`.

Three independent `useTapGuard` instances: one for the image itself (`onOpen`), one for save, one
for share — each hook call is self-contained (own `useRef`), calling it three times in one
component is expected and fine. Save/share additionally need `stopPropagation` on down/up/cancel/
leave (not move) — see the hook's `stopPropagation` option below.

Also a real keyboard path (Accessibility section): the image wrapper carries
`role="button" tabIndex={0} aria-label={`View ${item.title} fullscreen`}` and an `onKeyDown` that
calls `onOpen()` directly on Enter/Space (`preventDefault` on Space).

### `ArticleCard` (`src/components/feed/article-card.tsx`)

Props: `item: Item`, `saved: boolean`, `expanded: boolean`, `onToggleExpand: () => void`,
`onToggleSave: () => void`, `onShare: () => void`, `onHint: () => void` (fires the parent's toast
with the "Hold, or double-tap, to read" hint text — the hook itself stays copy-agnostic).

Uses `usePressExpand({ expanded, onToggle: onToggleExpand, onHint, holdMs: 480, doubleTapMs: 320 })`
→ `{ pressing, handlers }`. `handlers` spread onto the `<Card as="article" radius="card">` root
(`onPointerDown/Up/Leave/Cancel` — no movement guard here, deliberately, matching the prototype's
own separate gesture path). Save/share buttons each get their own `useTapGuard` instance (still
movement-guarded + `stopPropagation`, exactly like the image card — the prototype applies the same
guard to article-card save/share, confirmed by reading its `onSaveDown`/`onSaveUp` wiring).

Also carries the real keyboard path: the whole `<Card>` root additionally gets
`role="button" tabIndex={0} aria-expanded={expanded} aria-label={...}` and `onKeyDown` for
Enter/Space → `onToggleExpand()` directly, bypassing the hold/double-tap timing entirely — see
Accessibility.

### `use-tap-guard.ts` (`src/hooks/`)

```ts
export interface UseTapGuardOptions {
  slop?: number;            // px tolerance, default 12
  stopPropagation?: boolean; // default false — save/share buttons pass true
}

export function useTapGuard(action: () => void, opts: UseTapGuardOptions = {}) {
  const { slop = 12, stopPropagation = false } = opts;
  const tap = useRef<{ x: number; y: number; ok: boolean } | null>(null);

  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (stopPropagation) e.stopPropagation();
      tap.current = { x: e.clientX, y: e.clientY, ok: true };
    },
    onPointerMove: (e: React.PointerEvent) => {
      const t = tap.current;
      if (!t) return;
      if (Math.abs(e.clientX - t.x) > slop || Math.abs(e.clientY - t.y) > slop) t.ok = false;
    },
    onPointerUp: (e: React.PointerEvent) => {
      if (stopPropagation) e.stopPropagation();
      const t = tap.current;
      tap.current = null;
      if (!t?.ok) return;
      if (Math.abs(e.clientX - t.x) > slop || Math.abs(e.clientY - t.y) > slop) return;
      action();
    },
    onPointerCancel: () => {
      tap.current = null;
    },
    onPointerLeave: () => {
      tap.current = null;
    },
  };
}
```

(`onPointerCancel`'s `stopPropagation` needs the event argument threaded through in the real
implementation — the snippet above elides that only for brevity; port the prototype's
`onBtnCancel: (e) => { if (e?.stopPropagation) e.stopPropagation(); this.tapCancel(); }` faithfully.)

### `use-press-expand.ts` (`src/components/feed/`)

```ts
export interface UsePressExpandOptions {
  expanded: boolean;
  onToggle: () => void;
  onHint?: () => void;
  holdMs?: number;      // default 480
  doubleTapMs?: number; // default 320
}

export interface UsePressExpandResult {
  pressing: boolean; // drives both the progress-bar fill and the card's scale(0.985)
  handlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerLeave: () => void;
    onPointerCancel: () => void;
  };
}
```

Internals port `pressStart`/`pressEnd`/`pressCancel` near-verbatim (right-click guard on
`e.button === 2`, a `firedRef` to distinguish "hold already fired" from a genuine short tap on
release, `navigator.vibrate(8)` best-effort wrapped in try/catch). One necessary addition the
prototype didn't need: since `expanded` is a **prop**, not internal state, the `setTimeout`
callback and the pointer-up handler must read the *latest* value, not a stale closure — keep an
`expandedRef` synced via `expandedRef.current = expanded` on every render, and read `.current`
inside both the timer callback and `pressEnd`. Per-instance `lastTap`/`pressFired`/`pressTimer` all
live in refs local to this hook call — no index comparison needed (Decision 6).

### `source-label.ts`

```ts
export const SOURCE_LABELS: Record<string, string> = {
  wikipedia: "Wikipedia",
  met: "The Met",
  aic: "Art Institute of Chicago",
  cma: "Cleveland Museum of Art",
  wellcome: "Wellcome Collection",
};

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source.charAt(0).toUpperCase() + source.slice(1);
}
```

Used for **both** the image card's meta line (`item.attribution ?? sourceLabel(item.source)`) and
the article card's eyebrow (`sourceLabel(item.source)`, rendered through the same `uppercase`
CSS the prototype already applies) — one shared mapping, not two, and readable acronym expansion
("THE MET" / "CLEVELAND MUSEUM OF ART") beats bare uppercased slugs ("MET" / "CMA") in the eyebrow
too.

### `image-heights.ts` and `share-item.ts`

As specced in Decisions 8 and 14 respectively — kept as small, independently unit-testable pure
functions rather than inlined, matching the repo's existing preference for pulling pure logic out
of components (e.g. `services/random.ts`).

### `FullscreenPreview` (`src/components/feed/fullscreen-preview.tsx`)

Props: `item: Item`, `saved: boolean`, `onClose: () => void`, `onToggleSave: () => void`,
`onShare: () => void`.

Full-bleed `absolute inset-0 z-[40]` overlay (see Visual Spec for exact classes). Closes on: (a)
tap anywhere on the scrim/image area (the prototype's outer `onClick={closeImage}`, which the info
block and both action buttons stop-propagate out of, and the close X — implemented here as a real
`<button onClick={onClose}>` rather than relying on event bubbling, better for a11y regardless of
the prototype's implementation detail), (b) `Escape` (new relative to the prototype, matching
`BottomSheet`'s established convention — `useEffect` + `document.addEventListener("keydown", ...)`
while mounted). Local `broken: boolean` state, same pattern as `ImageCard`.

---

## Copy — final, do not invent alternatives

| Slot | Text |
|---|---|
| Wordmark | "Ambit" |
| Loader caption | "finding something interesting…" |
| Article collapsed label | "Hold or double-tap to read" |
| Article expanded label | "Show less" |
| First-single-tap hint toast | "Hold, or double-tap, to read"¹ |
| Image-broken caption | "Image unavailable" |
| Share, clipboard fallback toast | "Link copied to clipboard" |
| Share, total failure toast | "Couldn't share this — try again." |
| End-of-feed heading | "You've reached the edge, for now." |
| End-of-feed body | "New things arrive as the collection grows." |
| Tail-fetch error | "Couldn't load more — try again." |
| First-page load error | "Something went wrong loading your feed — try again." |
| Bookmark save aria-label | "Save" (unsaved) / "Remove from saved" (saved) |
| Share button aria-label | "Share" |
| Image tap aria-label | "View {title} fullscreen" |
| Article region aria-label | "{title}" |
| Fullscreen close aria-label | "Close" |

¹ Deliberately left distinct from the collapsed label above despite the near-identical wording —
see Decision 15. Flag to Ben if this turns out to be an unintentional prototype typo rather than an
intentional label-vs-toast register difference; unifying them later is a one-line change.

---

## Visual spec (prototype/handoff → 5.1 tokens)

> ⚠️ Sourced entirely from the *old* `Ambit - Feed.dc.html` — see the PAUSED banner at the top of
> this document. Re-derive against the new design before trusting any value below.

Everything below is either an existing primitive/token or an exact arbitrary-value translation.
Where a value contradicts `docs/design_handoff_ambit_pwa/README.md`, the README wins (same rule
5.2/5.3 used).

**Header:** `<GlassHeader>` as built (no changes needed — already matches). Inside:
`<span className="font-serif italic font-medium text-[28px] leading-none text-ink tracking-[0.2px]">Ambit</span>`
and `<IconButton size={34}><Bookmark size={13} className="text-ink/62" /></IconButton>` (outline,
unfilled — `IconButton`'s own `text-ink/62` default already matches the prototype's `0.55`-ish
alpha closely enough per the existing normalization precedent).

**Feed column:** `flex flex-col gap-[28px] px-5 pt-[22px] pb-3`.

**Serendipity row:** `flex items-center gap-[11px] px-1 py-0.5`.
- Rule: `flex-none w-[22px] h-[0.5px] bg-accent opacity-55`.
- `<Diamond size={9} className="text-accent flex-none" aria-hidden />`.
- Text: `font-sans text-[12.5px] leading-[1.45] text-ink/50 tracking-[0.1px]` wrapping
  `{fromLabel} ` + `<span className="text-accent">→ {toLabel}</span>` — only the arrow+destination
  span is accent-colored.

**Image card:**
- Wrapper: `cursor-pointer` + tap-guard handlers + keyboard role.
- `<img loading="lazy" onError={...} className={cn("w-full object-cover rounded-img-lg", heightClass)} src={item.imageUrl ?? ""} alt={item.title} />`
  — `rounded-img-lg` is the `--radius-img-lg` (20px) token's auto-generated utility, **its first
  consumer in the repo**. `heightClass` from `image-heights.ts` (Decision 8).
- Broken-image fallback (same container size): `flex items-center justify-center bg-ink/5 rounded-img-lg text-ink/40 font-sans text-[12px]`, same `heightClass`.
- Meta row: `flex items-start justify-between gap-[14px] pt-[13px] px-0.5`.
  - Title: `font-serif text-[19px] leading-[1.3] text-ink`.
  - Meta line: `font-sans text-[12px] text-ink/48 mt-[5px] tracking-[0.15px]`.
  - Actions: `flex items-center gap-[7px] flex-none` — two `<IconButton size={34}>` (non-glass):
    `<Bookmark size={13} filled={saved} className={saved ? "text-accent" : "text-ink/62"} />` and
    `<Share size={15} className="text-ink/62" />`.

**Article card:** `<Card as="article" radius="card" className="p-[22px_22px_16px] select-none [touch-action:manipulation] cursor-pointer transition-transform duration-200 ease-out">` with `scale-[0.985]`/`scale-100` toggled by `pressing` (class-only, per Decision 7).
- Eyebrow: `font-sans text-[10.5px] font-semibold tracking-[1.4px] uppercase text-ink/38`.
- Title: `font-serif text-[24px] leading-[1.22] tracking-[0.1px] text-ink mt-3`.
- Lede: `font-serif text-[16px] leading-[1.55] text-ink/62 mt-[11px]`.
- Expanded body (only when `expanded`): `font-serif text-[16px] leading-[1.62] text-ink/74 mt-[14px] whitespace-pre-line`.
- Collapsed-only progress track (only when `!expanded`): `h-0.5 rounded-full bg-ink/7 mt-4 overflow-hidden` containing a fill bar
  `className={cn("h-full rounded-full bg-accent", pressing ? "w-full duration-[480ms] ease-linear" : "w-0 duration-[180ms] ease-out")}`.
- Footer: `flex items-center justify-between mt-[18px]` — left `<span className="font-sans text-[13px] font-medium text-accent">{expanded ? "Show less" : "Hold or double-tap to read"}</span>`; right, same two `IconButton`s as the image card.

**Infinite-scroll tail:**
- Sentinel: `<div ref={sentinelRef} className="h-px" />`.
- Loader row: `flex items-center justify-center gap-[10px] py-[14px] pb-2` — `<Spinner size={15} className="border-2 border-ink/14 border-t-accent" />` (overriding `Spinner`'s default `border-ink/20` per the prototype's `0.14` value; confirm `tailwind-merge` actually lets this win over the base class, same caution 5.2 flagged for its own `Spinner` override) + `<span className="font-serif italic text-[14px] text-ink/40">finding something interesting…</span>`.
- End-of-feed: same row shape, no spinner — `<p className="font-serif italic text-[14px] text-ink/40">You've reached the edge, for now.</p>` + `<p className="font-sans text-[12px] text-ink/32 mt-1">New things arrive as the collection grows.</p>`.

**Fullscreen preview:**
```
absolute inset-0 z-[40] bg-scrim/97 backdrop-blur-[24px] flex flex-col
```
- Close: `flex justify-end pt-[54px] px-[18px]` containing `<IconButton size={36} glass onClick={onClose} aria-label="Close"><Close size={14} /></IconButton>`.
- Image area: `flex-1 flex items-center justify-center px-4 py-2` containing
  `<img className="w-full h-[56vh] object-contain rounded-input" onError={...} />` (`rounded-input`
  reused for its matching 14px value, per Decision/finding above) or the same broken-image fallback
  block, sized `h-[56vh] w-full`.
- Info block: `px-[26px] pt-2 pb-11` (8/26/44px) — title
  `font-serif text-[22px] leading-[1.28] text-ink`; row below,
  `flex items-center justify-between gap-4 mt-2`: meta text
  `font-sans text-[12.5px] text-ink/50 min-w-0` on the left, `flex items-center gap-[9px] flex-none`
  on the right with two `<IconButton size={38} glass>` (save/share, same icon logic as the cards).

**Toast:** unchanged — `Toast` primitive already matches exactly (`bottom-[46px] z-[50]`, etc.);
confirm no divergence by eye once wired up.

---

### Accessibility

- **Save buttons:** `aria-pressed={saved}` + `aria-label` per the Copy table (dynamic on state).
- **Article expand — real keyboard/screen-reader path, not gesture-only.** This is a genuine gap in
  the prototype's own design (hold-to-expand and double-tap have no non-pointer equivalent at all)
  and this plan treats closing it as in-scope. The whole `<Card as="article">` root gets
  `role="button" tabIndex={0} aria-expanded={expanded}` and an `onKeyDown` that calls
  `onToggleExpand()` directly on `Enter`/`Space` (`e.preventDefault()` on Space to stop page
  scroll) — bypassing the 480ms hold and double-tap timing windows entirely for keyboard users. The
  nested save/share `IconButton`s remain independently focusable and are real `<button>`s already,
  so Enter/Space on them activates the button, not the card (focus is on the inner element, so the
  card's own key handler never fires for it — no extra `stopPropagation` needed for the keyboard
  path, only the pointer path per `useTapGuard`).
- **Image tap** gets the equivalent treatment: `role="button" tabIndex={0}
  aria-label="View {title} fullscreen"`, Enter/Space → `onOpen()`.
- **Tail region:** `aria-live="polite"` wrapping the loader/end-of-feed/error slot, so a
  screen-reader user is told when more content lands or the feed ends — mirrors the count label's
  `aria-live` precedent from Onboarding.
- **`Toast` primitive** gains `role="status" aria-live="polite"` (Decision 16) — announces share
  confirmations/failures without the consuming component needing to do anything extra.
- **Fullscreen overlay:** `Escape` closes it (new, matching `BottomSheet`'s precedent); the close
  button is a real, labelled `<button>`. Full focus-trap/return-focus-on-close is a reasonable
  nice-to-have this plan does **not** build out in full — noting the omission explicitly rather than
  silently skipping it, consistent with not gold-plating beyond what the phase's scope calls for.
- **Images:** every `<img>` needs a real `alt={item.title}` (never empty/decorative — these are the
  primary content, not chrome).

---

## Steps

Given Feed's materially higher gesture/data complexity than Onboarding, this plan stages
incrementally rather than "build the whole component, then create the route" — each step has its
own checkpoint so a gesture bug doesn't get buried under five other new behaviors at once.

1. **`Toast` a11y fix** — add `role="status" aria-live="polite"` to
   `src/components/ui/toast.tsx`. No behavior change; existing `toast.test.tsx` should still pass
   unmodified (add one assertion for the new attributes if convenient).
2. **`src/test/setup.ts`** — add the permissive global `IntersectionObserver` stub (Decision 20).
   Verify by running the existing full suite (`bun run test`) — should still be green, nothing yet
   depends on it.
3. **`src/hooks/use-tap-guard.ts`** + `use-tap-guard.test.ts` — pure hook, testable via
   `@testing-library/react`'s `renderHook` and synthetic `PointerEvent`s (jsdom supports
   `PointerEvent` construction). Cover: a tap within slop fires the action; a move beyond slop
   before release suppresses it; `stopPropagation: true` calls it on down/up (not move); cancel/leave
   both reset pending state without firing.
4. **`src/components/feed/use-press-expand.ts`** + its test (fake timers,
   `vi.useFakeTimers()`) — cover: holding past `holdMs` fires `onToggle` once and sets
   `pressing` false again; releasing before `holdMs` does not fire it; a single short tap while
   collapsed calls `onHint`, not `onToggle`; two short taps within `doubleTapMs` call `onToggle`
   once and don't also fire `onHint` a second time; a tap while `expanded: true` calls `onToggle`
   immediately, no double-tap window involved; right-click (`button: 2`) is ignored entirely.
5. **`source-label.ts`, `image-heights.ts`, `share-item.ts`** + their tests — pure functions,
   straightforward table-driven tests. `share-item.test.ts` mocks `navigator.share` /
   `navigator.clipboard.writeText` per Decision 14's three branches (native success, AbortError,
   clipboard fallback, total failure).
6. **`ImageCard`** — build complete against a small fixture `Item`, rendered standalone in its own
   test file first (nowhere real to mount it yet, same as 5.3's component-before-route staging).
   Cover: renders title/meta/save-filled-state; broken image swaps to the fallback block on
   `onError`; tap-guard wiring (movement beyond 12px suppresses `onOpen`); save/share buttons
   stop propagation (clicking save must not also fire `onOpen`).
7. **`ArticleCard`** — same standalone-first approach. Cover: collapsed/expanded label text and
   body visibility; the progress-bar class toggles on `pressing`; keyboard Enter/Space toggles
   expand without waiting for the hold timer; save/share still independently guarded/stop-propagate
   inside an otherwise-clickable card.
8. **`SerendipityRow`** — trivial presentational component, no dedicated test file (folded into
   `feed-screen.test.tsx`'s render assertions, matching the "no test file for pure prop→class
   mapping" precedent already set for `IconButton`/`Card`/`GlassHeader`/`Input`/`Spinner`).
9. **`FullscreenPreview`** + its test — build and test standalone. Cover: renders the item's
   title/meta; Escape and the close button both call `onClose`; tapping the scrim/image calls
   `onClose`, tapping the info block or either action button does not (stop-propagation intact);
   broken-image fallback.
10. **`FeedScreen`** — the integration point. This is where `api.feed.page.useInfiniteQuery` and
    the `IntersectionObserver` sentinel first get wired together; write `feed-screen.test.tsx`
    alongside it, following `onboarding-screen.test.tsx`'s `vi.hoisted` module-mock pattern for
    `~/trpc/react`, but shaped for a hook that returns pages/`fetchNextPage`/`hasNextPage` rather
    than a single mutation. Cover at minimum:
    - renders cards from the mocked first page, image and article types both correctly dispatched
    - a serendipity row renders before a card whose mocked `driftPath` has length ≥ 2, using
      `topicLabels` to resolve the two ids to text; no row for a CORE card or a length-1
      `driftPath`
    - save toggles optimistically on tap, and **reverts** if the mocked `saves.toggle` mutation
      rejects (`onError` path) — the one most important correctness test in this file, since
      there's no server-confirmed saved state to fall back on
    - share success (mocked `navigator.share` resolving) shows **no** toast; clipboard fallback
      shows the "Link copied to clipboard" toast; total failure shows the failure toast
    - scrolling the sentinel into view (via the stubbed `IntersectionObserver`'s captured callback,
      Decision 20) calls `fetchNextPage()` exactly once per intersection, and not again while
      `isFetchingNextPage` is already true
    - `hasNextPage: false` renders the end-of-feed copy, not the loader
    - a first-page load error renders the error slot with a working "Try again" retry
11. **`/feed/page.tsx`** — replace the placeholder body: keep the two existing guards verbatim
    (session → `redirect("/")`; `hasCompletedOnboarding` → `redirect("/onboarding")`), then
    `void api.feed.page.prefetchInfinite({})`, then
    `<HydrateClient><FeedScreen topicLabels={...} /></HydrateClient>` where `topicLabels` is built
    from `TOPICS` (imported statically — this file already runs server-side, same treatment
    `/onboarding/page.tsx` gives the same import). **Delete** `src/app/feed/sign-out-button.tsx`
    from this location. **Visual check the whole screen for the first time here**, against
    `docs/design_handoff_ambit_pwa/screenshots/03-feed.png`, using real seeded dev-DB content (see
    Verification — you'll need `bun run ingest` to have populated real items beforehand, or this
    step has nothing to render).
12. **`/dev/tokens/page.tsx`** — import and render the relocated `SignOutButton` (moved from
    `src/app/feed/`). Confirm `bun run build`'s production dev-gate still 404s it (same check 5.1's
    walkthrough already did for this route).
13. **`e2e/auth.spec.ts`** — update the sign-out step: navigate to `/dev/tokens` instead of
    clicking a button on `/feed`, click the relocated `SignOutButton` there, assert the same
    post-sign-out redirect behavior as before.
14. **`e2e/feed.spec.ts`** (new) — see Test coverage for exactly what it needs and the seeding
    problem it has to solve first.
15. **Docs** — write `docs/PHASE5_WALKTHROUGH_5.4.md`; tick the BUILD_PLAN 5.4 box (dropping the
    `?focus=` clause in the same edit, Decision 3) with its retrospective paragraph; correct
    `SPEC.md` §10's typography-plugin note (Decision 18) and add `/feed`'s real component names to
    §8.2 if they diverge from what's listed there (`ImageCard.tsx`/`ArticleCard.tsx` already match;
    `SaveButton.tsx`/`ShareButton.tsx` don't exist as separate files in this plan's architecture —
    save/share are inline `IconButton` usages inside each card, not extracted components; update
    §8.2 to reflect that, same "match the built component, not the guessed name" move 5.3 made for
    `OnboardingScreen.tsx`); append a `log.md` entry.

> **Log-and-merge hazard, verbatim from 5.2/5.3's plans:** the executing session writes its own
> `log.md` entry, and whoever lands the PR checks for an unwritten entry *before* merging — a log
> commit pushed after a squash-merge lands on a deleted branch.

---

## Verification

- `bun run check` (typecheck + lint + format + full test suite) and `bun run build` under CI's
  placeholder env — confirms `/feed` doesn't accidentally prerender (it now does a real DB-backed
  `prefetchInfinite` on top of the existing `headers()` read, an even stronger dynamic-rendering
  signal than 5.2/5.3 had).
- **Real seeded data is required before any visual check means anything.** Unlike 5.2/5.3 (auth-
  only, no content dependency), this screen has nothing to render against an empty `item` table.
  Run `bun run ingest` against a handful of the 16 onboarding topics first (check
  `scripts/ingest.ts --help` or its own header comment for how to scope a run) so the dev DB has
  enough real image/article items to populate several pages and actually exercise `feed.page`'s
  tier mix.
- `bun run dev` + Chrome DevTools MCP at **402×874**, against
  `docs/design_handoff_ambit_pwa/screenshots/03-feed.png`. Then cycle all four accents via
  `data-accent` on `<html>` and confirm the serendipity arrow, save-button fill, article footer
  label, and progress-bar fill all recolor with no rebuild.
- **Specific things to look at rather than assume, all easy to ship subtly broken:**
  - **The tail loader's spinner border override.** `Spinner`'s default is `border-ink/20`; the
    prototype wants `border-ink/14`. Confirm the override class actually wins through
    `tailwind-merge` rather than losing to the primitive's base class (exact same caution 5.2 had
    to verify for its own `Spinner` override on the submit button).
  - **The image-height class rotation actually applies.** Since these are static, pre-declared
    arbitrary-value classes (Decision 8), confirm all four heights genuinely show up across a
    scrolled feed rather than every image silently falling back to no explicit height (the failure
    mode if a dynamic template literal snuck in instead).
  - **Save's optimistic-then-revert path**, by hand: throttle/offline the network tab, tap save,
    confirm the icon fills immediately, then confirm it un-fills again once the mutation actually
    fails against a genuinely offline request.
  - **The movement-guard threshold**, by hand on an actual touch device or Chrome's touch emulation:
    a slow scroll that drifts more than ~12px over a card's save button must NOT toggle save; a
    genuine tap must.
  - **Hold-to-expand's 480ms timing and the double-tap 320ms window**, by hand — these are the two
    numbers most likely to feel wrong on a real device even if the unit tests (fake-timer-driven)
    are green.
- **The real loop, by hand:** sign in as an onboarded user → `/feed` loads with real content
  server-rendered (no loading flash) → scroll to trigger `fetchNextPage` at least twice → tap an
  image → fullscreen preview opens, no URL change → Escape closes it → tap save on a card → icon
  fills instantly → reload the page → confirm the save state is gone (Decision 12's accepted gap,
  confirm it behaves exactly as documented, not worse) → hold an article card ~half a second →
  body expands, haptic on supporting devices → double-tap another article card → expands
  immediately → tap share on any card → real OS share sheet appears (or clipboard toast on
  desktop) → scroll until `hasNextPage` is false (may require a small dev-DB corpus to actually
  reach) → end-of-feed copy renders, not an infinite spinner.
- `bun run e2e` locally, green (updated `auth.spec.ts` + new `feed.spec.ts`).

---

## Risks

- **Gesture conflict is the single highest-risk area in this phase.** Three independent
  pointer-event systems now share the same card DOM: native scroll, `useTapGuard`'s movement-slop
  tap, and `usePressExpand`'s untimed hold/double-tap. The prototype's own code keeps these
  disjoint by construction (tap-guard only ever wraps images/save/share; press-expand only ever
  wraps the article card root, never both on the same element) — **do not let any element end up
  wrapped by both hooks at once**, that combination was never validated by the source design and
  is likely to misfire in some direction (e.g. a hold beginning to register as a tap-guard "ok"
  tap on release).
- **This is the app's first `useInfiniteQuery` + RSC `prefetchInfinite` pairing anywhere in the
  codebase.** The query-key-must-match-exactly requirement (Docs findings above) is exactly the
  kind of thing that fails silently — a mismatched input produces a working feed with an extra,
  invisible client-side refetch on mount rather than a visible error. Confirm via the Network tab
  on first load that the first `feed.page` request is genuinely absent (i.e. hydration actually
  worked), not just that the feed eventually renders.
- **Image loading failures are a real, not hypothetical, risk** — every image URL is a live
  external hotlink (Wikimedia/museum CDNs) with no proxy, no retry, and no CDN caching layer of
  Ambit's own. Expect a nonzero broken-image rate in normal use, not just as an edge case to
  handle defensively; verify the fallback block actually looks acceptable in situ, not just that
  it doesn't crash.
- **Seen-item/cursor staleness across a long scroll session is a backend-owned risk, not this
  phase's to fix, but worth watching for during manual verification anyway** — if a very long
  single-session scroll surfaces a repeat item, that's a `services/feed.ts` bug (Phase 4.1's job to
  fix), not a Feed-UI bug; don't spend time debugging the UI for something that's actually upstream.
- **`bun run e2e`'s `feed.spec.ts` needs real seeded items in a fresh dev DB, which nothing before
  this phase has required.** `e2e/auth.spec.ts` only ever needed an empty-but-migrated DB. A
  fresh clone's DB has zero `item` rows until someone runs `bun run ingest`, and CI doesn't have
  Postgres at all yet (same "local-only" status every e2e spec in this repo currently has, per
  Phase 7.1's still-pending CI Postgres work) — document this prerequisite loudly in the spec's own
  header comment (same style `auth.spec.ts`'s header already uses to document its own
  prerequisites), and consider whether the spec should seed a small number of items itself
  (directly via Drizzle, bypassing the real adapters/curator) rather than depending on a real
  `bun run ingest` run against live external APIs — a real ingest run is slow, non-deterministic,
  and depends on third-party services being up, which is a bad foundation for a repeatable e2e
  spec. **Recommend seeding a small fixed fixture set of `item` rows directly in the spec's own
  setup** (a handful of hand-written rows across 2-3 topics, inserted via the Drizzle client,
  mirroring how `routers.integration.test.ts` already self-skips without `DATABASE_URL` rather than
  depending on a populated corpus) rather than requiring a real ingest run as a precondition.
- **The sign-out relocation (Decision 1) is a real, if narrow, regression** in end-user
  reachability, not just a testing inconvenience — see the explicit flag in Decision 1. Don't treat
  it as fully resolved by this plan; it's resolved for *implementation purposes* only, pending
  Ben's sign-off on the underlying product question.
