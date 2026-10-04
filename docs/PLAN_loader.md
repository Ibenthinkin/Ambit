# Loader + view toggle — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app's generic ring `Spinner` with Ben's **"Reach" loader** — the Ambit mark whose dot leaves the centre, orbits the ring and comes home — everywhere the app waits, and confirm the **view toggle** is fully in.

**Architecture:** One React component, `components/ui/loader.tsx`, drawn from `docs/LoaderAnimation/loader/` (tokens + reference web component). Its three motions are CSS keyframes in `globals.css`'s `@theme`, each behind an `--animate-*` token so Tailwind emits them. Every one of the nine `<Spinner>` call sites moves to `<Loader>`, then `spinner.tsx` and its keyframe are deleted.

**Tech Stack:** Next.js App Router, React, Tailwind v4, Vitest + Testing Library (jsdom), Playwright.

**Spec:** `docs/LoaderAnimation/loader/README.md`, `loader.tokens.json`, `ambit-loader.js` (the reference) and `demo.html` (open it in a browser to see the target). For the view toggle: `docs/viewTOggleTOkens/view-toggle/`.

---

## 0. The view toggle is already in — nothing to build

`docs/viewTOggleTOkens/` was introduced on **09-27-26** (`37d9fc6`, then the magazine-turn plan `docs/PLAN_magazine-turn.md`). Audited against its tokens on 10-04-26:

| Token / README item | Where it lives | State |
|---|---|---|
| Two-path glyph, single ↔ spread, `d` morph 420 ms `cubic-bezier(.3,1.3,.5,1)` | `src/components/icons/view-glyph.tsx` | ✅ verbatim paths, pinned by `view-glyph.test.tsx` |
| 36 px / 10 px button, 0.14 white while pressed, `aria-pressed`, label "Magazine view" | `src/components/item/spread-toggle.tsx` (scaled ×1.12 to the rail) | ✅ |
| `M` hotkey, ←/→ | `item-screen.tsx` keydown | ✅ (desktop only) |
| Persisted choice | `lib/hero-layout.ts`, key `ambit.heroLayout.v1` | ✅ (key renamed from the design's `ambit.galleryView.v1` on purpose; default `single`, because the server has no localStorage) |
| Spine gradient, page-turn leaf 800 ms, folios, fade-out mid-turn, single-view enter fade 350 ms | `item/hero-rail.tsx` | ✅ |
| `Space` as "next" | — | **Not wired, on purpose:** the item screen scrolls to `ItemFacts` below the hero, and Space is the browser's scroll key there. |
| Placement "in the phone pill, replacing the feed's layout picker" | — | **Superseded:** the feed layout picker was rejected (`docs/DESIGN_spread-mode.md`), and the spread is desktop-only (two pages side by side don't fit an upright phone). The toggle lives in the desktop rail. |

**The only open question is Ben's:** does he want a magazine view on the phone at all (e.g. a landscape phone)? That would be a new design, not this plan. This plan builds the loader only.

---

## Global Constraints

- **Keyframes go inside `@theme` *with* an `--animate-*` token each.** Tailwind v4 emits a `@keyframes` declared in `@theme` only if a token names it (CLAUDE.md, 09-26-26 trap). `globals.test.ts` compiles the file to prove it.
- **No web component.** `docs/` is not in the Docker image, and the house rule (design handoff) is to rebuild designs in the app's own components. `ambit-loader.js` is the reference only. Do not copy it into `src/`.
- **Token values, copied verbatim** from `loader.tokens.json`: viewBox `0 0 26 26`; ring r `11.5`; stroke `1.7`, or `2` when size `< 22`; ring opacity `0.28 ↔ 0.75`; dot r `3.6`; reach scale `0.55`; sizes inline `18` / block `26` / hero `64`; cycle `2400ms`, easing `cubic-bezier(.65,0,.35,1)`; reach out `0–22%`, orbit `22–78%`, reach in `78–100%`; ring pulse `ease-in-out`; label Sora 14 px, `rgba(239,235,224,0.4)` (= `text-ink/40`), gap 10 px.
- **Colour is `currentColor`, defaulting to `text-accent`**, so the accent knob (`[data-accent]`) recolours it live. On an accent-filled button it's `text-on-accent`.
- **Reduced motion plays the full Reach, by Ben's decision (10-04-26)** — the same call as the view glyph and the page turn. `.motion-gentle` goes on the outer mark `<span>` so globals.css's 0.01 ms collapse never reaches any of the three animations. The design's `calm` variant is not built.
- **Accessible name:** `role="status"`, `aria-label` = the label, or `"Loading"` when there's none. That's the same contract as today's `Spinner`.
- Branch: **`feat/loader` off `main`**, a plain branch, not a worktree (Ben's preference). Don't start from `feat/hero-zoom`.
- `bun run check` must be green at the end of every task. CLAUDE.md's comment density applies: Ben reads this repo to learn, so explain *why* in the component.

## Review Focus

1. **Reduced motion on.** Ben's devices have it on, and he wants the full motion there: the dot must still leave, orbit and return, not freeze at home. → Task 1 pins `motion-gentle` on the whole mark; Task 3 checks it in a browser emulating `reduced-motion: reduce`.
2. **Accent knob changes.** A loader rendered under `[data-accent="amber"]` must be amber, never a baked hex. → Task 1 test: no inline `color`, and the class is `text-accent`.
3. **Inside the submit button.** The loader must be dark (`on-accent`) on the accent fill. The button must not grow or shift when it appears (14 px spinner → 16 px loader). → Task 2 swaps the class; Task 3 checks it in the browser.
4. **Production CSS actually contains the keyframes.** A loader with no `@keyframes` is a static dot, and it would pass every jsdom test. → Task 1 extends `globals.test.ts`.
5. **Small sizes stay legible.** At 16–18 px the ring must use the thicker `2` stroke. → Task 1 test.

---

## File structure

- Create `src/components/ui/loader.tsx`: the component. Exports `Loader` and `LOADER_SIZES`.
- Create `src/components/ui/loader.test.tsx`
- Modify `src/styles/globals.css`: three tokens and three keyframes in; `--animate-spinner` and `@keyframes spinner` out (Task 2).
- Modify `src/styles/globals.test.ts`: the keyframes survive the build.
- Modify (Task 2) these call sites: `feed/feed-screen.tsx`, `explore/explore-screen.tsx`, `saved/saved-screen.tsx`, `profile/profile-hub.tsx`, `profile/profile-edit-screen.tsx`, `sheets/save-to-collection-sheet.tsx`, `sheets/item-sheet.tsx`, `sheets/collections-sheet.tsx`, `landing/auth-card.tsx`, `landing/reset-password-card.tsx`, `app/dev/tokens/page.tsx`
- Delete `src/components/ui/spinner.tsx`

---

### Task 1: The `Loader` component and its keyframes

**Files:**
- Create: `src/components/ui/loader.tsx`
- Create: `src/components/ui/loader.test.tsx`
- Modify: `src/styles/globals.css` (the `@theme` `--animate-*` list near line 97, and the `@keyframes` block near line 177)
- Modify: `src/styles/globals.test.ts`

**Interfaces:**
- Produces: `export function Loader(props: { size?: number; label?: string; className?: string }): JSX.Element` and `export const LOADER_SIZES = { inline: 18, block: 26, hero: 64 } as const`. The utilities `animate-loader-ring`, `animate-loader-orbit` and `animate-loader-reach`.

- [ ] **Step 1: Write the failing component test** at `src/components/ui/loader.test.tsx`

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LOADER_SIZES, Loader } from "./loader";

// Ben's "Reach" loader (docs/LoaderAnimation/loader/): the mark's dot leaves the centre, orbits
// the ring, comes home. The motion itself is CSS (globals.css) and jsdom doesn't run it — these
// pin the structure the keyframes act on, and the reduced-motion split.
describe("Loader", () => {
  it("is a status named Loading when it has no label", () => {
    render(<Loader />);
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
  });

  it("shows its label and takes it as its name", () => {
    render(<Loader label="finding something interesting…" />);
    const status = screen.getByRole("status", {
      name: "finding something interesting…",
    });
    expect(status).toHaveTextContent("finding something interesting…");
  });

  it("defaults to 18px and scales the 26-unit mark to fit", () => {
    const { container } = render(<Loader />);
    const box = container.querySelector<HTMLElement>("[data-loader-box]")!;
    expect(box.style.width).toBe("18px");
    expect(box.style.height).toBe("18px");
    const mark = container.querySelector<HTMLElement>("[data-loader-mark]")!;
    expect(mark.style.transform).toBe(`scale(${18 / 26})`);
  });

  it("thickens the ring below 22px so it stays legible", () => {
    const ring = (size: number) =>
      render(<Loader size={size} />)
        .container.querySelector("circle")!
        .getAttribute("stroke-width");
    expect(ring(18)).toBe("2");
    expect(ring(LOADER_SIZES.block)).toBe("1.7");
    expect(ring(LOADER_SIZES.hero)).toBe("1.7");
  });

  it("is drawn in currentColor on the accent, so the accent knob recolours it", () => {
    const { container } = render(<Loader />);
    const status = screen.getByRole("status");
    expect(status.className).toContain("text-accent");
    expect(status.style.color).toBe("");
    expect(container.querySelector("circle")!.getAttribute("stroke")).toBe(
      "currentColor",
    );
  });

  it("lets a caller recolour it", () => {
    render(<Loader className="text-on-accent" />);
    expect(screen.getByRole("status").className).toContain("text-on-accent");
  });

  // Reduced motion plays the whole Reach (Ben, 10-04-26): globals.css collapses every animation
  // outside `.motion-gentle`, so the whole mark — ring, orbit and dot — sits inside it.
  it("exempts the whole mark from the reduced-motion collapse", () => {
    const { container } = render(<Loader />);
    for (const sel of [
      ".animate-loader-ring",
      ".animate-loader-orbit",
      ".animate-loader-reach",
    ]) {
      expect(container.querySelector(sel)!.closest(".motion-gentle")).not.toBeNull();
    }
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bunx vitest run src/components/ui/loader.test.tsx`
Expected: FAIL. `Failed to resolve import "./loader"`.

- [ ] **Step 3: Write the component** at `src/components/ui/loader.tsx`

```tsx
import * as React from "react";

import { cn } from "~/lib/utils";

// Ben's "Reach" loader (docs/LoaderAnimation/loader/, 10-04-26), replacing the generic ring
// spinner: the Ambit mark — a ring with a dot at its centre — where the dot reaches out to the
// ring, travels once round it and comes home, every 2.4 s. Rebuilt here as a React component
// rather than shipping the design's `<ambit-loader>` web component: `docs/` isn't in the image,
// and every other design in the app is rebuilt in its own components the same way.
//
// **How the motion is built.** Everything is drawn in the design's 26-unit space, in a 26 px box
// scaled to `size` — so the keyframes can say "11.5px" (the ring's radius) and mean it at every
// size. Three animations, all on one 2.4 s cycle (keyframes in globals.css):
//   - the ring's opacity breathes 0.28 ↔ 0.75 (`loader-ring`);
//   - the dot slides out to the ring and shrinks to 0.55 in the first 22%, and back in the last
//     22% (`loader-reach`);
//   - between those, its wrapper turns a full circle (`loader-orbit`) — the dot is offset, so a
//     rotating wrapper carries it round the ring.
//
// **Reduced motion plays the whole thing, on purpose** (Ben, 10-04-26 — the same call as the view
// glyph and the page turn). globals.css collapses every animation to 0.01 ms except inside
// `.motion-gentle`, so the mark span carries that class. The design also offers a `calm` variant
// (dot still, ring pulsing) for reduced motion; it is deliberately not built.
//
// The colour is `currentColor`, `text-accent` by default, so the accent knob recolours it live;
// on an accent-filled button pass `className="text-on-accent"`.

export const LOADER_SIZES = { inline: 18, block: 26, hero: 64 } as const;

/** The design's units: a 26-unit box, the ring at r 11.5, the dot at r 3.6. */
const UNITS = 26;
const RING_R = 11.5;
const DOT_R = 3.6;
/** Below this the 1.7 stroke renders under a pixel and the ring vanishes; draw it at 2. */
const SMALL_BELOW_PX = 22;

export interface LoaderProps {
  /** Rendered size in px. 18 inline (the default), 26 for a block wait, 64 hero. */
  size?: number;
  /** Visible text beside the mark, and its accessible name. */
  label?: string;
  className?: string;
}

export function Loader({
  size = LOADER_SIZES.inline,
  label,
  className,
}: LoaderProps) {
  return (
    <span
      role="status"
      aria-label={label ?? "Loading"}
      className={cn(
        "text-accent inline-flex items-center gap-[10px] align-middle",
        className,
      )}
    >
      <span
        data-loader-box
        aria-hidden="true"
        className="relative flex-none"
        style={{ width: size, height: size }}
      >
        <span
          data-loader-mark
          className="motion-gentle absolute top-0 left-0 size-[26px] origin-top-left"
          style={{ transform: `scale(${size / UNITS})` }}
        >
          <svg
            width={UNITS}
            height={UNITS}
            viewBox={`0 0 ${UNITS} ${UNITS}`}
            className="absolute inset-0 overflow-visible"
          >
            <circle
              className="animate-loader-ring"
              cx={UNITS / 2}
              cy={UNITS / 2}
              r={RING_R}
              fill="none"
              stroke="currentColor"
              strokeWidth={size < SMALL_BELOW_PX ? 2 : 1.7}
            />
          </svg>
          {/* Turns about the box's centre, which is the ring's centre; the dot rides it. */}
          <span className="animate-loader-orbit absolute inset-0">
            <span
              className="animate-loader-reach absolute rounded-full bg-current"
              style={{
                left: UNITS / 2 - DOT_R,
                top: UNITS / 2 - DOT_R,
                width: DOT_R * 2,
                height: DOT_R * 2,
              }}
            />
          </span>
        </span>
      </span>
      {label ? (
        <span className="text-ink/40 font-sans text-[14px] leading-[1.3]">
          {label}
        </span>
      ) : null}
    </span>
  );
}
```

- [ ] **Step 4: Run the component test and watch it pass**

Run: `bunx vitest run src/components/ui/loader.test.tsx`
Expected: PASS, 7 tests.

- [ ] **Step 5: Write the failing build test.** In `src/styles/globals.test.ts`, extend the `"globals.css keyframes survive the Tailwind build"` describe with a second `it`:

```ts
  // The loader's three motions (docs/LoaderAnimation/). Without them it is a static dot, and
  // nothing in jsdom would notice.
  it("emits the loader's ring, orbit and reach", async () => {
    const from = join(__dirname, "globals.css");
    const out = await postcss([tailwind()]).process(
      readFileSync(from, "utf8"),
      { from },
    );
    expect(out.css).toContain("@keyframes loader-ring");
    expect(out.css).toContain("@keyframes loader-orbit");
    expect(out.css).toContain("@keyframes loader-reach");
  }, 60_000);
```

- [ ] **Step 6: Run it and watch it fail**

Run: `bunx vitest run src/styles/globals.test.ts`
Expected: FAIL on `@keyframes loader-ring`.

- [ ] **Step 7: Add the tokens and keyframes to `src/styles/globals.css`.** In `@theme`, directly under `--animate-spinner: spinner 0.8s linear infinite;`:

```css
  /* Ben's "Reach" loader (docs/LoaderAnimation/, components/ui/loader.tsx): three motions on one
     2.4 s cycle. The ring breathes on its own ease; the orbit and the reach share the design's
     ease-in-out, so the dot accelerates away from home and settles back into it. */
  --animate-loader-ring: loader-ring 2400ms ease-in-out infinite;
  --animate-loader-orbit: loader-orbit 2400ms cubic-bezier(0.65, 0, 0.35, 1)
    infinite;
  --animate-loader-reach: loader-reach 2400ms cubic-bezier(0.65, 0, 0.35, 1)
    infinite;
```

and, directly under the `@keyframes spinner { … }` block:

```css
  @keyframes loader-ring {
    0%,
    100% {
      opacity: 0.28;
    }
    50% {
      opacity: 0.75;
    }
  }
  /* Still while the dot goes out (0–22%) and comes back (78–100%); one turn in between. */
  @keyframes loader-orbit {
    0%,
    22% {
      transform: rotate(0deg);
    }
    78%,
    100% {
      transform: rotate(360deg);
    }
  }
  /* 11.5px is the ring's radius in the mark's 26-unit space — the component scales the whole
     box, so this lands on the ring at every size. */
  @keyframes loader-reach {
    0%,
    100% {
      transform: translateX(0) scale(1);
    }
    22%,
    78% {
      transform: translateX(11.5px) scale(0.55);
    }
  }
```

(These animate `transform` on plain spans with no Tailwind `translate-*`/`rotate-*` utility on them, so the v4 `translate`-property composition trap in CLAUDE.md does not apply. Keep it that way.)

- [ ] **Step 8: Run both tests and watch them pass**

Run: `bunx vitest run src/styles/globals.test.ts src/components/ui/loader.test.tsx`
Expected: PASS.

- [ ] **Step 9: Run `bun run check` and commit**

```bash
bun run check
git add src/components/ui/loader.tsx src/components/ui/loader.test.tsx src/styles/globals.css src/styles/globals.test.ts docs/LoaderAnimation docs/PLAN_loader.md
git commit -m "feat(loader): Ben's Reach loader — the mark's dot orbits its ring

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Every wait uses the loader; the spinner goes

**Files:**
- Modify: `src/components/feed/feed-screen.tsx` (~line 311), `src/components/explore/explore-screen.tsx` (~line 221)
- Modify: `src/components/saved/saved-screen.tsx` (~156), `src/components/profile/profile-hub.tsx` (~94), `src/components/profile/profile-edit-screen.tsx` (~43), `src/components/sheets/save-to-collection-sheet.tsx` (~117), `src/components/sheets/item-sheet.tsx` (~178), `src/components/sheets/collections-sheet.tsx` (~65)
- Modify: `src/components/landing/auth-card.tsx` (~255), `src/components/landing/reset-password-card.tsx` (~123)
- Modify: `src/app/dev/tokens/page.tsx` (~46, ~469)
- Modify: `src/styles/globals.css` (remove `--animate-spinner` and `@keyframes spinner`)
- Delete: `src/components/ui/spinner.tsx`
- Test: `src/components/feed/feed-screen.test.tsx`

**Interfaces:**
- Consumes: `Loader` and `LOADER_SIZES` from `~/components/ui/loader` (Task 1).

- [ ] **Step 1: Write the failing test.** In `src/components/feed/feed-screen.test.tsx`, add this case next to `"does not stack fetches while one is already in flight"` (~line 318). It uses the file's own `loaded()` helper and `LABELS`:

```tsx
  it("waits for the next page with the Reach loader, its label as its name", () => {
    feedState.current = loaded({ hasNextPage: true, isFetchingNextPage: true });
    render(<FeedScreen appUrl="https://ambit.test" topicLabels={LABELS} />);
    const status = screen.getByRole("status", {
      name: "finding something interesting…",
    });
    expect(status.querySelector("[data-loader-mark]")).not.toBeNull();
  });
```

(If `screen` isn't imported yet, add it to the existing `@testing-library/react` import.)

- [ ] **Step 2: Run it and watch it fail**

Run: `bunx vitest run src/components/feed/feed-screen.test.tsx`
Expected: FAIL. The status is named `"Loading"` (the Spinner's), not the label.

- [ ] **Step 3: Swap the two feed tails.** In both `feed-screen.tsx` and `explore-screen.tsx`, replace

```tsx
        <div className="flex items-center justify-center gap-[10px] pt-5 pb-[26px]">
          <Spinner size={15} />
          <span className="text-ink/40 text-[14px]">
            finding something interesting…
          </span>
        </div>
```

with

```tsx
        <div className="flex items-center justify-center pt-5 pb-[26px]">
          <Loader label="finding something interesting…" />
        </div>
```

and change the import to `import { Loader } from "~/components/ui/loader";`.

- [ ] **Step 4: Swap the six block waits.** In `saved-screen.tsx`, `profile-hub.tsx`, `profile-edit-screen.tsx`, `save-to-collection-sheet.tsx`, `item-sheet.tsx` and `collections-sheet.tsx`, replace `<Spinner />` with `<Loader size={LOADER_SIZES.block} />` (these are whole-screen or whole-sheet waits, the design's 26 px "block" size). Change each import to `import { LOADER_SIZES, Loader } from "~/components/ui/loader";`. Leave the wrapping `div`s alone.

- [ ] **Step 5: Swap the two submit buttons.** In `auth-card.tsx` and `reset-password-card.tsx`, replace

```tsx
            <Spinner
              size={14}
              className="border-on-accent/35 border-t-on-accent"
            />
```

with

```tsx
            <Loader size={16} className="text-on-accent" />
```

(16 px is the design demo's in-button size; dark on the accent fill, like the old spinner's leading edge.)

- [ ] **Step 6: Swap the dev tokens page.** In `src/app/dev/tokens/page.tsx`, change the import, retitle the section, and show the three sizes plus a labelled one:

```tsx
        <Section title="Loader">
          <div className="flex flex-wrap items-center gap-6">
            <Loader size={LOADER_SIZES.inline} />
            <Loader size={LOADER_SIZES.block} />
            <Loader size={LOADER_SIZES.hero} />
            <Loader label="finding something interesting…" />
          </div>
        </Section>
```

- [ ] **Step 7: Delete the spinner.** Delete `src/components/ui/spinner.tsx`. In `globals.css`, remove the `--animate-spinner` token line and the `@keyframes spinner { … }` block. Then confirm nothing still names them:

Run: `grep -rn "Spinner\|animate-spinner\|spinner" src e2e`
Expected: no output (apart from the word "spinner" in prose comments, which you should reword to "loader" where they describe this UI, e.g. `saved-screen.tsx:113`).

- [ ] **Step 8: Run the tests**

Run: `bunx vitest run src/components/feed/feed-screen.test.tsx && bun run check`
Expected: PASS, and `check` green. If a sheet or profile test asserted on `getByRole("status", { name: "Loading" })`, it still passes: an unlabelled `Loader` keeps that name.

- [ ] **Step 9: Commit**

```bash
git add -A src
git commit -m "feat(loader): every wait uses the Reach loader; the ring spinner is gone

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Look at it in a real browser, both motion settings, then e2e

Jsdom can't run CSS animations, so this task is where Review Focus 1, 3 and 4 are actually proven.

**Files:** none changed, unless something below fails.

- [ ] **Step 1: Free port 3000 and build for production** (CLAUDE.md: Ambit must own 3000; prod build because the keyframe trap only shows there)

```bash
lsof -ti:3000   # if anything is listed, stop it (ask Ben first if it isn't an Ambit server)
bun run build && bun run start
```

- [ ] **Step 2: Look at `/dev/tokens` with Playwright MCP or Chrome DevTools MCP.** `/dev/tokens` is dev-gated; if it's a 404 under the production build, use `bun run dev` for this step only.
  - Emulate `prefers-reduced-motion: no-preference`. Take three screenshots about 300 ms apart. The dot should be in a different place on the ring in each (out, travelling, home).
  - Emulate `prefers-reduced-motion: reduce`. The dot still moves between screenshots, exactly as above. In the console, `getComputedStyle(document.querySelector('[data-loader-mark] .animate-loader-reach')).animationDuration` should be `2.4s`, not `1e-05s`.
  - Set `document.documentElement.dataset.accent = "amber"`. The loader turns amber with no reload.

- [ ] **Step 3: Look at the sign-in button mid-submit.** On `/`, open the sign-in sheet. Throttle the network in DevTools (Slow 3G) and submit. The dark loader sits left of the label, the button's height doesn't change, and nothing shifts sideways.

- [ ] **Step 4: Run the e2e suite in production shape**

Run: `bun run e2e:prod`
Expected: the same pass count as `main` (61 at the last run). No spec names the spinner, so a failure here is a real regression in a swapped screen. Read it before retrying.

- [ ] **Step 5: Log and hand over.** Add a `log.md` entry for the day (format in CLAUDE.md, with the session-spend line). Record two things: the view toggle was audited and found already shipped, and Reduce Motion plays the full Reach by Ben's call. Commit it. Don't merge or push; Ben looks first, on his phone (Reduce Motion on) and at 1440.

```bash
git add log.md
git commit -m "docs(log): the Reach loader

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Not in this plan (filed, not forgotten)

- **A loader over a still-loading hero picture** on the item screen. Today the picture just appears. The design's `hero` 64 px size exists for something like this, but adding a new loading state is new behaviour, not a swap. Ask Ben.
- **"fetching the full article…"**, the design demo's second label. Nothing in the app fetches an article body on demand yet; it arrives with the reading experience (`docs/DESIGN_writing.md`, filed for later).
- **The explore curtain** stays as it is. The overture *is* that wait, by design (`explore-screen.tsx:137`).
