# Landing Under Reduced Motion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A reader whose OS asks for reduced motion gets the landing's overture as a plain fade and the reel as slow cross-fades — no collapse, no zoom, no hard cuts — instead of today's single still with the sheet up.

**Architecture:** One new tempo, `gentle` (the dissolve without drift, and a first frame that fades in from black), selected on the client when `prefers-reduced-motion` matches. The overture takes a `gentle` prop that swaps its clip-and-drift collapse for an opacity fade of the whole line, then re-fades the wordmark alone. The app's global reduced-motion rule (`globals.css`, which collapses every duration to 0.01 ms) gains one opt-out class, `motion-gentle`, carried by the reel's and the overture's roots — the only two subtrees whose motion is opacity-only by construction. Nothing about hydration changes: the preference is still read after the hydration boundary (D8), and the server still renders the overture at phase `in`, which is now what every reader sees first.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4, Vitest + Testing Library (jsdom), Playwright.

**Spec:** `docs/DESIGN_landing-redo.md` (D4 overture, D5 tempos, D6 reduced motion, D8 hydration) — D6's reduced-motion bullet is what this plan changes; Task 7 rewrites it. The diagnosis that led here is in `log.md` under 09-26-26.

**Branch:** `fix/landing-orientation` (unmerged landing work; this sits on top of it). Plain branch, no worktree.

## Why (read before touching anything)

Ben saw "no text animation or slideshow at all" on both his phone and his Mac. Reproduced 09-26-26: on his Mac, an un-emulated Chrome reports `matchMedia("(prefers-reduced-motion: reduce)").matches === true` — the macOS Accessibility "Reduce motion" setting, which Firefox, Chrome and Safari all follow; the phone has the same signature. The build did exactly what D6 said: `isStatic = mode === "static" || reduce` → one still, sheet up, no overture. With the preference overridden off, the same server played the whole show. Ben chose the gentle version over keeping the still or ignoring the preference.

## Global Constraints

- **Motion under reduced motion is opacity only.** No `transform`, no `clip-path` transitions, no `reel-drift`, no hard cuts (the first frame fades in from black). Copied from the decision: "overture as a plain fade, reel as slow cross-fades with no zoom and no hard cuts".
- **The reduced-motion answer never reaches the server's markup** (D8). It is read only through `useMediaQuery` after hydration. The server renders phase `in` for every `cycle` reader, and that render must be byte-identical for a reduced-motion reader and a full-motion one.
- **The global reduced-motion rule keeps collapsing everything else** — sheets, toasts, rise-ins. Only the reel root and the overture root opt out. `AuthSheet` is *not* inside either.
- **`cut` stays under WCAG 2.3.1** (`1000 / frameMs < 3`) and is never served to a reduced-motion reader.
- **`?tempo=` still resolves server-side under the dev gate only** (D5); a reduced-motion reader gets `gentle` whatever the query says. To compare `cut`/`dissolve` on a device, Reduce Motion must be off on that device.
- Tests: Vitest for every hook/component change, the e2e reduced-motion test rewritten, `bun run check` green. The e2e suite runs against a production build: `bun run e2e:prod`. **Port 3000 must be Ambit's** — as of 09-26 09:05 it is held by `~/Dev/ambit-topic-groups`'s `next start` + Playwright run; `lsof -ti:3000` and clear it first.
- Commit after each task; conventional messages; end every commit with the attribution lines the session reminder gives.

## Review Focus

Inputs the spec implies but no existing test exercises, most likely to bite first:

1. **Reduce Motion + Save-Data together** — expected: the overture fades, one picture, the sheet still rises on its own (the one-picture reel re-arms its frame counter). Pinned in Task 5.
2. **A reduced-motion reader's hydration must not fetch the whole reel** — on the hydration commit every client-only store reads its server snapshot (`reduce` false → the cut tempo → `Infinity` ahead). Expected: nothing is requested before the corrective render, and then one ahead (two pictures), never twelve. Pinned in Task 5 (it is exactly the "only the preloads were fetched" evidence the diagnosis rested on, inverted).
3. **`/reset-password` (static mode) under reduced motion** — expected: unchanged, one still, sheet up, no overture, no gentle fades. Pinned in Task 5.
4. **Collapsing the sheet under reduced motion** — expected: the reel restarts from picture 0 with a *fade* in from black (not a cut), and the glyph reopens the sheet. Pinned in Task 5 and the e2e test in Task 6.
5. **The global 0.01 ms rule actually letting the landing through** — a selector mistake would silently make every gentle fade instant and the build would look exactly like the bug being fixed. Pinned by computed-style assertions in the e2e test (Task 6) and a text pin on the stylesheet (Task 2).

---

### Task 1: The `gentle` tempo and `softStart`

**Files:**
- Modify: `src/components/landing/tempos.ts`
- Test: `src/components/landing/tempos.test.ts`

**Interfaces:**
- Produces: `TempoId = "cut" | "dissolve" | "gentle"`; `Tempo.softStart: boolean`; `TEMPOS.gentle`. Later tasks read `tempo.softStart` (Task 4) and `TEMPOS.gentle` (Task 5).

- [ ] **Step 1: Write the failing tests**

In `src/components/landing/tempos.test.ts`, replace the two existing `toEqual` pins (they gain a field) and add the gentle ones. The file's `describe("tempos", …)` becomes:

```ts
import { describe, expect, it } from "vitest";

import { DEFAULT_TEMPO, resolveTempo, TEMPOS, wantedAhead } from "./tempos";

// docs/DESIGN_landing-redo.md D5's table, pinned. Change the design before you change these.
describe("tempos", () => {
  it("cut: 350 ms hard cuts, 12 before the sheet, 4 decoded to start, relaxes to dissolve", () => {
    expect(TEMPOS.cut).toEqual({
      id: "cut",
      frameMs: 350,
      fadeMs: 0,
      firstPass: 12,
      gateFrames: 4,
      drift: false,
      softStart: false,
      behindSheet: "dissolve",
    });
  });

  it("dissolve: 6 s frames, 2.5 s fade, 2 before the sheet, 1 decoded to start, drifts", () => {
    expect(TEMPOS.dissolve).toEqual({
      id: "dissolve",
      frameMs: 6000,
      fadeMs: 2500,
      firstPass: 2,
      gateFrames: 1,
      drift: true,
      softStart: false,
      behindSheet: "dissolve",
    });
  });

  // The reduced-motion tempo (D6, 09-26-26): the dissolve with no drift and no hard cut anywhere —
  // the first frame fades in from black too. Opacity is the only thing that moves.
  it("gentle: the dissolve without drift, and a soft start; it is its own gear behind the sheet", () => {
    expect(TEMPOS.gentle).toEqual({
      id: "gentle",
      frameMs: 6000,
      fadeMs: 2500,
      firstPass: 2,
      gateFrames: 1,
      drift: false,
      softStart: true,
      behindSheet: "gentle",
    });
  });

  it("cut stays under WCAG 2.3.1's three flashes a second", () => {
    expect(1000 / TEMPOS.cut.frameMs).toBeLessThan(3);
  });

  it("resolveTempo honours the param only when overrides are allowed, and never resolves gentle", () => {
    expect(resolveTempo("dissolve", true).id).toBe("dissolve");
    expect(resolveTempo("dissolve", false).id).toBe(DEFAULT_TEMPO);
    expect(resolveTempo("gentle", true).id).toBe(DEFAULT_TEMPO);
    expect(resolveTempo("nonsense", true).id).toBe(DEFAULT_TEMPO);
    expect(resolveTempo(undefined, true).id).toBe(DEFAULT_TEMPO);
  });

  it("wantedAhead: cut prefetches the whole reel, dissolve and gentle one ahead", () => {
    expect(wantedAhead(TEMPOS.cut)).toBe(Infinity);
    expect(wantedAhead(TEMPOS.dissolve)).toBe(1);
    expect(wantedAhead(TEMPOS.gentle)).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run test -- src/components/landing/tempos.test.ts`
Expected: FAIL — `cut` and `dissolve` pins fail on the missing `softStart`; `TEMPOS.gentle` is undefined.

- [ ] **Step 3: Implement**

In `src/components/landing/tempos.ts`:

```ts
export type TempoId = "cut" | "dissolve" | "gentle";
```

Add to `Tempo`, after `drift`:

```ts
  /** The first frame fades in from black instead of cutting (D4's hard cut is itself motion). */
  softStart: boolean;
```

Add `softStart: false` to `cut` and `dissolve`, and the third entry:

```ts
  // The reduced-motion tempo (D6, 09-26-26): what a reader whose OS asks for less movement gets
  // in place of either of the above. The dissolve's clock with nothing but opacity moving — no
  // drift, and no hard cut into the first frame. Its own gear behind the sheet: relaxing to
  // `dissolve` would bring the drift back.
  gentle: {
    id: "gentle",
    frameMs: 6000,
    fadeMs: 2500,
    firstPass: 2,
    gateFrames: 1,
    drift: false,
    softStart: true,
    behindSheet: "gentle",
  },
```

`resolveTempo` is untouched — its `param === "cut" || param === "dissolve"` check already refuses `gentle`, which is a preference's answer, not a choice. Update the comment above `TEMPOS` ("Ben is choosing between these…") to add one line: *"`gentle` is not a candidate: it is what reduced motion gets (D6)."*

- [ ] **Step 4: Run to verify it passes**

Run: `bun run test -- src/components/landing/tempos.test.ts`
Expected: PASS (6 tests). Then `bun run typecheck` (or `bunx tsc --noEmit`) — `landing-screen.test.tsx` builds `Tempo` objects only through `TEMPOS`, so nothing else should break; if a test file constructs a `Tempo` literal by hand, add `softStart: false` to it.

- [ ] **Step 5: Commit**

```bash
git add src/components/landing/tempos.ts src/components/landing/tempos.test.ts
git commit -m "feat(landing): gentle tempo — the dissolve without drift, soft start, for reduced motion"
```

---

### Task 2: The global reduced-motion rule gets an opt-out

**Files:**
- Modify: `src/styles/globals.css:355-372` (the `@media (prefers-reduced-motion: reduce)` block)
- Create: `src/styles/globals.test.ts`

**Interfaces:**
- Produces: the class name `motion-gentle`. Tasks 3 and 4 put it on the overture root and the reel root.

- [ ] **Step 1: Write the failing test**

`src/styles/globals.test.ts` — a text pin, because the real proof is computed style in Task 6's e2e and a unit test cannot compute CSS:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// The global reduced-motion rule collapses every duration in the app to 0.01 ms. The landing's
// reel and overture opt out (docs/DESIGN_landing-redo.md D6, 09-26-26): their reduced-motion
// version is opacity-only fades that *are* the accessible behaviour, and a selector slip here would
// make them instant — indistinguishable from the bug it replaced. Task 6's e2e test measures the
// computed durations; this pins the selector so a stylesheet edit can't drop it unnoticed.
describe("globals.css reduced motion", () => {
  const css = readFileSync(join(__dirname, "globals.css"), "utf8");
  const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));

  it("exempts the .motion-gentle subtrees from the 0.01 ms collapse", () => {
    expect(block).toContain(":not(.motion-gentle, .motion-gentle *)");
    expect(block).toContain(":not(.motion-gentle, .motion-gentle *)::before");
    expect(block).toContain(":not(.motion-gentle, .motion-gentle *)::after");
    expect(block).not.toMatch(/^\s*\*,\s*$/m);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run test -- src/styles/globals.test.ts`
Expected: FAIL — the block's selector is still `*, *::before, *::after`.

- [ ] **Step 3: Implement**

In `src/styles/globals.css`, replace the block (keep the comment above it, and extend it):

```css
/* Honor the OS "reduce motion" setting everywhere at once. The design system is animation-heavy
   by nature (rise-in on nearly every screen, sheets, toasts, the gallery's chrome cycle), and all
   of it is decorative — no animation in this app conveys information that isn't also in the DOM,
   so collapsing every duration to ~0 is safe and is the accessible default. Deliberately a
   Phase 5.4 addition beyond the handoff, which specifies no reduced-motion behavior.

   One opt-out (09-26-26, docs/DESIGN_landing-redo.md D6): the landing's reel and overture carry
   `.motion-gentle`. Under reduced motion they run the `gentle` tempo — opacity-only cross-fades,
   no drift, no cuts — which *is* their reduced-motion version; collapsing those fades to 0.01 ms
   would turn them back into the hard cuts the preference asked not to see. Nothing else opts out:
   the sheet is outside both subtrees and still collapses. */
@media (prefers-reduced-motion: reduce) {
  :not(.motion-gentle, .motion-gentle *),
  :not(.motion-gentle, .motion-gentle *)::before,
  :not(.motion-gentle, .motion-gentle *)::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

`:not()` with a selector list is supported everywhere this PWA runs (Safari 9+, Chrome 88+, Firefox 84+). Its specificity is `(0,1,0)` instead of `*`'s `(0,0,0)`; every declaration is `!important`, so only other `!important` declarations could be affected, and there are none for these properties (`grep -n '!important' src/styles/globals.css` to confirm before committing).

- [ ] **Step 4: Run to verify it passes**

Run: `bun run test -- src/styles/globals.test.ts` — PASS. Then `bun run check` — Prettier/ESLint must be clean on the CSS.

- [ ] **Step 5: Commit**

```bash
git add src/styles/globals.css src/styles/globals.test.ts
git commit -m "style: reduced-motion collapse exempts .motion-gentle — the landing's opacity-only version"
```

---

### Task 3: The overture's gentle collapse

**Files:**
- Modify: `src/components/landing/overture.tsx`
- Test: `src/components/landing/overture.test.tsx`

**Interfaces:**
- Consumes: nothing new (`OVERTURE`, `OverturePhase` from `./use-overture` as today).
- Produces: `OvertureProps.gentle?: boolean` (default `false`). Task 5 passes it.

**Behaviour to build.** With `gentle`:
- `in`: identical to today — the line fades in over `OVERTURE.fadeInMs` via the `overture-in` animation. (This is the server render for everyone.)
- `collapse`: the *whole line* fades out — the root gets `opacity: 0` with `transition: opacity ${OVERTURE.collapseMs}ms ease`. The mark gets no transform and the tail no clip. **The root's `overture-in` animation must be removed in this phase** (`animation: "none"`): a finished `both`-filled animation keeps holding `opacity: 1` and beats inline styles in the cascade, so the inline `0` would never paint. Removing it changes nothing visible — the animation ended 900 ms earlier at `1`, which is also the property's natural value — and the transition then runs from 1 to 0.
- `done`: the tail unmounts and the root is **re-keyed** (`key="mark"` instead of `"line"`), so it remounts centred on the wordmark alone and the `overture-in` animation plays again: the wordmark fades back in over 500 ms while the reel's first frame fades in behind it (Task 4). No element moves.
- The `useLayoutEffect` that measures the tail for `--drift` is skipped when `gentle`.
- `motion-reduce:hidden` is **removed** from the root — the reduced-motion reader now gets the line. The root gains `motion-gentle` (Task 2's opt-out) unconditionally: the non-gentle collapse only runs when the preference is off, where the global rule is inert anyway.

- [ ] **Step 1: Write the failing tests**

In `src/components/landing/overture.test.tsx`, replace the last test (`"is hidden by CSS for reduced-motion readers…"`) with these:

```ts
  // Reduced motion (D6, 09-26-26): the line is for every reader now. The server renders phase
  // `in` for all of them (D8), and a reduced-motion reader gets it as a plain fade — so nothing
  // may hide it from first paint, and the root must opt out of the global 0.01 ms collapse.
  it("is no longer hidden for reduced-motion readers, and opts out of the global collapse", () => {
    render(<Overture phase="in" />);
    const line = screen.getByTestId("overture");
    expect(line.className).not.toContain("motion-reduce:hidden");
    expect(line.className).toContain("motion-gentle");
  });

  it("gentle collapse: the whole line fades on opacity alone — no clip, no drift, and the fade-in animation is dropped so the inline opacity can paint", () => {
    const { rerender } = render(<Overture phase="in" gentle />);
    const tail = screen.getByTestId("overture-tail");
    Object.defineProperty(tail, "getBoundingClientRect", {
      value: () => ({ width: 300 }),
    });
    rerender(<Overture phase="collapse" gentle />);
    const line = screen.getByTestId("overture");
    expect(line.style.opacity).toBe("0");
    expect(line.style.transition).toContain("opacity 2200ms");
    expect(line.style.animation).toBe("none");
    const mark = screen.getByTestId("overture-mark");
    expect(mark.style.transform).toBe("none");
    expect(mark.style.getPropertyValue("--drift")).toBe("");
    expect(tail.style.getPropertyValue("clip-path")).toBe("inset(0)");
    expect(tail.style.opacity).toBe("1");
  });

  it("gentle done: the tail is gone and the wordmark remounts, fading in again on its own", () => {
    const { rerender } = render(<Overture phase="collapse" gentle />);
    const before = screen.getByTestId("overture");
    rerender(<Overture phase="done" gentle />);
    const after = screen.getByTestId("overture");
    expect(after).not.toBe(before);
    expect(screen.queryByTestId("overture-tail")).not.toBeInTheDocument();
    expect(after.style.animation).toContain("overture-in 500ms");
    expect(after.style.opacity).toBe("");
  });

  it("full motion is unchanged by the prop's default: collapse still clips and drifts", () => {
    const { rerender } = render(<Overture phase="in" />);
    const tail = screen.getByTestId("overture-tail");
    Object.defineProperty(tail, "getBoundingClientRect", {
      value: () => ({ width: 300 }),
    });
    rerender(<Overture phase="collapse" />);
    expect(tail.style.getPropertyValue("clip-path")).toBe("inset(0 100% 0 0)");
    expect(screen.getByTestId("overture").style.opacity).toBe("");
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run test -- src/components/landing/overture.test.tsx`
Expected: FAIL on all four new tests (`motion-reduce:hidden` present, no `gentle` prop).

- [ ] **Step 3: Implement**

`src/components/landing/overture.tsx` — the component becomes:

```tsx
export interface OvertureProps {
  phase: OverturePhase;
  /** The sheet is up: nothing renders. */
  hidden?: boolean;
  /**
   * Reduced motion (D6): the collapse is a plain fade of the whole line, then the wordmark alone
   * fades back in. Opacity is the only property that moves. Read after hydration, so `in` must
   * render identically with and without it — it does: the prop only matters from `collapse` on.
   */
  gentle?: boolean;
}

const EASE = "cubic-bezier(.4,0,.2,1)";
const FADE_IN = `overture-in ${OVERTURE.fadeInMs}ms ease both`;

export function Overture({
  phase,
  hidden = false,
  gentle = false,
}: OvertureProps) {
  const markRef = React.useRef<HTMLSpanElement>(null);
  const tailRef = React.useRef<HTMLSpanElement>(null);

  React.useLayoutEffect(() => {
    if (gentle || phase !== "collapse" || !tailRef.current || !markRef.current)
      return;
    const half = tailRef.current.getBoundingClientRect().width / 2;
    markRef.current.style.setProperty("--drift", `${half}px`);
  }, [phase, gentle]);

  if (hidden) return null;
  const collapsing = phase === "collapse";
  // The gentle collapse fades the *line*; the full one moves its parts.
  const lineFading = gentle && collapsing;
  const partsMoving = !gentle && collapsing;
  // Gentle `done` remounts the root: the wordmark re-centres and the fade-in plays again for it
  // alone. Full motion keeps the element — its transform is dropped in the same frame the tail
  // unmounts, so nothing visibly moves (see the top of the file).
  const gentleDone = gentle && phase === "done";

  return (
    <div
      key={gentleDone ? "mark" : "line"}
      data-testid="overture"
      aria-hidden
      className={cn(
        inter.className,
        // The blend lives here, on the fixed layer: `fixed` + z-index makes this its own stacking
        // context, and a blended child would only blend against this empty group — never the
        // pictures behind it. White in `difference` is the reference's inverting wordmark.
        "pointer-events-none fixed inset-0 z-20 flex items-center justify-center text-white mix-blend-difference",
        // Opts out of globals.css's reduced-motion collapse: under the preference this line's
        // fades *are* the reduced version (D6), and 0.01 ms fades would be flashes.
        "motion-gentle",
        "text-[clamp(15px,2vw,25px)] font-normal whitespace-nowrap",
      )}
      style={{
        // Dropped once the line starts fading: a finished `both`-filled animation keeps holding
        // opacity 1 and beats inline styles in the cascade, so the 0 below would never paint.
        // Nothing visible changes — it ended 900 ms ago at 1, the property's natural value.
        animation: phase === "in" || gentleDone ? FADE_IN : "none",
        opacity: lineFading ? 0 : undefined,
        transition: lineFading
          ? `opacity ${OVERTURE.collapseMs}ms ease`
          : undefined,
      }}
    >
      <span
        ref={markRef}
        data-testid="overture-mark"
        className="inline-block tracking-[.32em]"
        style={{
          transform: partsMoving ? "translateX(var(--drift, 0px))" : "none",
          transition: partsMoving
            ? `transform ${OVERTURE.collapseMs}ms ${EASE}`
            : "none",
          willChange: "transform",
        }}
      >
        {WORDMARK}
      </span>
      {phase !== "done" ? (
        <span
          ref={tailRef}
          data-testid="overture-tail"
          className="inline-block tracking-[.02em] whitespace-pre"
          style={{
            clipPath: partsMoving ? "inset(0 100% 0 0)" : "inset(0)",
            opacity: partsMoving ? 0 : 1,
            transition: partsMoving
              ? `clip-path ${OVERTURE.collapseMs}ms ${EASE}, opacity ${OVERTURE.tailFadeMs}ms ease`
              : "none",
          }}
        >
          {TAGLINE}
        </span>
      ) : null}
    </div>
  );
}
```

Also update the file's header comment: after the paragraph ending "…so nothing visibly moves.", add:

```
// **Under reduced motion** (`gentle`, D6 as of 09-26-26) none of that runs: the whole line fades
// out over the same 2.2 s, and on `done` the root is re-keyed so the wordmark remounts centred and
// fades back in by itself. Opacity is the only property that ever changes. The old
// `motion-reduce:hidden` is gone with it — the reduced-motion reader is meant to see this line now.
```

Note that `animation` for the *full-motion* `collapse`/`done` phases also becomes `"none"` (it was kept before). That is deliberate and invisible — same reasoning as the comment — and keeps one expression instead of two.

- [ ] **Step 4: Run to verify it passes**

Run: `bun run test -- src/components/landing/overture.test.tsx`
Expected: PASS (9 tests). The pre-existing "collapse clips and fades…" and "done: the tail is gone…" tests must still pass untouched.

- [ ] **Step 5: Commit**

```bash
git add src/components/landing/overture.tsx src/components/landing/overture.test.tsx
git commit -m "feat(landing): overture's gentle collapse — a plain fade of the line, for reduced motion"
```

---

### Task 4: The reel's soft start and opt-out

**Files:**
- Modify: `src/components/landing/landing-reel.tsx`
- Test: `src/components/landing/landing-reel.test.tsx`

**Interfaces:**
- Consumes: `Tempo.softStart` (Task 1), `TEMPOS.gentle`.
- Produces: nothing new; `LandingReelProps` is unchanged.

- [ ] **Step 1: Write the failing tests**

Add to `describe("LandingReel", …)` in `src/components/landing/landing-reel.test.tsx`:

```tsx
  // The reduced-motion tempo (D6, 09-26-26): a cut into the first frame is motion too.
  it("gentle: the first frame fades in from black instead of cutting", () => {
    render(
      <LandingReel
        pictures={pics}
        index={0}
        prev={null}
        tempo={TEMPOS.gentle}
        started
      />,
    );
    const first = imgs()[0]!;
    expect(first.style.opacity).toBe("1");
    expect(first.style.transition).toContain("opacity 2500ms");
  });

  it("gentle: cross-fades without drift — nothing but opacity moves", () => {
    render(
      <LandingReel
        pictures={pics}
        index={2}
        prev={1}
        tempo={TEMPOS.gentle}
        started
      />,
    );
    const [leaving, current] = imgs();
    expect(current!.style.transition).toContain("opacity 2500ms");
    expect(current!.style.animation).toBe("");
    expect(leaving!.style.animation).toBe("");
  });

  it("opts out of the global reduced-motion collapse: its fades are the reduced version", () => {
    render(
      <LandingReel
        pictures={pics}
        index={0}
        prev={null}
        tempo={TEMPOS.gentle}
        started
      />,
    );
    expect(screen.getByTestId("landing-reel").className).toContain(
      "motion-gentle",
    );
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run test -- src/components/landing/landing-reel.test.tsx`
Expected: FAIL — the first frame's transition is `none`; no `motion-gentle` class.

- [ ] **Step 3: Implement**

In `src/components/landing/landing-reel.tsx`:

```ts
  // No fade while nothing is leaving: the first frame after the overture (and after a restart) is
  // the reference's hard cut out of black under either tempo (D4). Only picture-to-picture changes
  // take the tempo's fade — unless the tempo asks for a soft start (`gentle`, D6): under reduced
  // motion the cut into the first frame is motion too, so it fades in from black.
  const cut = tempo.fadeMs === 0 || (leaving === null && !tempo.softStart);
```

and the root:

```tsx
      // `motion-gentle`: opts out of globals.css's reduced-motion collapse. Under the preference
      // this reel runs the gentle tempo, whose 2.5 s opacity fades *are* the reduced version (D6);
      // collapsed to 0.01 ms they would be the hard cuts the reader asked not to see.
      className="motion-gentle fixed inset-0 overflow-hidden"
```

The existing test `"dissolve: the first frame after the overture is a hard cut too (D4)"` keeps passing — `dissolve.softStart` is `false`.

- [ ] **Step 4: Run to verify it passes**

Run: `bun run test -- src/components/landing/landing-reel.test.tsx` — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/landing/landing-reel.tsx src/components/landing/landing-reel.test.tsx
git commit -m "feat(landing): reel soft start under the gentle tempo; reel root opts out of the motion collapse"
```

---

### Task 5: The screen serves `gentle` to reduced-motion readers

**Files:**
- Modify: `src/components/landing/landing-screen.tsx:86-136,194`
- Test: `src/components/landing/landing-screen.test.tsx` (the `"LandingScreen — reduced motion"` describe, and one hydration test)

**Interfaces:**
- Consumes: `TEMPOS.gentle` (Task 1), `Overture`'s `gentle` prop (Task 3).
- Produces: nothing new — `LandingScreenProps` is unchanged.

**Behaviour to build.** `reduce` no longer makes the screen static. It selects the tempo (`TEMPOS.gentle` in place of whatever the server resolved), and it is passed to the overture. `isStatic` is `mode === "static"` alone; `useOverture(mode === "cycle")` — the reduced-motion reader gets the overture. Everything downstream (`effectiveTempo`, `wantedAhead`, the gate, the first pass, the sheet) already follows the tempo. Hydration is unchanged: on the hydration commit `reduce` reads `false` (server snapshot) so the tempo is the server's for one render, but `usePictures` gets `NO_PICTURES` until `hydrated`, and the corrective render — where `reduce` is true — happens before anything is requested.

- [ ] **Step 1: Write the failing tests**

Replace the whole `describe("LandingScreen — reduced motion", …)` block in `src/components/landing/landing-screen.test.tsx` with:

```tsx
// Reduced motion (D6, 09-26-26): not a still any more. The overture plays as a plain fade, the
// reel runs the gentle tempo, and the sheet rises on the gentle tempo's first pass. Diagnosed on
// Ben's own devices, both with Reduce Motion on: the old "one still" path was the whole bug.
describe("LandingScreen — reduced motion", () => {
  it("plays the overture in gentle mode, then runs the gentle tempo and raises the sheet on its first pass", async () => {
    stubEnvironment({ reduce: true });
    await renderScreen("cycle", TEMPOS.cut);
    // The overture is there, and it is the gentle one: at collapse the line itself fades.
    expect(screen.getByTestId("overture")).toBeInTheDocument();
    expect(sheet()).toHaveAttribute("data-open", "false");
    advance(OVERTURE_MS - 1);
    expect(screen.getByTestId("overture").style.opacity).toBe("0");
    expect(screen.getByTestId("overture-mark").style.transform).toBe("none");
    // The reel cuts in on the gentle tempo, not the server's cut: the first frame fades in.
    advance(1);
    await act(async () => {
      await Promise.resolve();
    });
    expect(currentId()).toBe("p0");
    const first = document.querySelector<HTMLImageElement>(
      "[data-testid='landing-reel'] img[data-id='p0']",
    )!;
    expect(first.style.transition).toContain("opacity 2500ms");
    expect(first.style.animation).toBe("");
    // Gentle frames are 6 s, not 350 ms.
    advance(TEMPOS.cut.frameMs * 2);
    expect(currentId()).toBe("p0");
    steps(1, TEMPOS.gentle.frameMs);
    expect(currentId()).toBe("p1");
    expect(sheet()).toHaveAttribute("data-open", "false");
    // Sheet after the gentle first pass (2 frames), not the cut's 12.
    steps(1, TEMPOS.gentle.frameMs);
    expect(sheet()).toHaveAttribute("data-open", "true");
    expect(screen.queryByTestId("overture")).not.toBeInTheDocument();
  });

  it("the disc collapses the sheet and the reel restarts with a fade, ←/→ step, the glyph reopens", async () => {
    stubEnvironment({ reduce: true });
    await renderScreen("cycle", TEMPOS.cut);
    advance(OVERTURE_MS);
    await act(async () => {
      await Promise.resolve();
    });
    act(() => screen.getByRole("button", { name: "Open sign-in" }).click());
    expect(sheet()).toHaveAttribute("data-open", "true");
    act(() =>
      screen.getByRole("button", { name: "Back to the slideshow" }).click(),
    );
    expect(sheet()).toHaveAttribute("data-open", "false");
    expect(currentId()).toBe("p0");
    key("ArrowRight");
    expect(currentId()).toBe("p1");
    key("ArrowLeft");
    expect(currentId()).toBe("p0");
    act(() => screen.getByRole("button", { name: "Open sign-in" }).click());
    expect(sheet()).toHaveAttribute("data-open", "true");
  });

  // Review focus 1: both preferences at once. Save-Data still wins on bytes (one picture); the
  // overture still plays; the one-picture reel still owes the sheet its cue.
  it("with Save-Data too: the overture plays, one picture, and the sheet still rises on its own", async () => {
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { saveData: true },
    });
    stubEnvironment({ reduce: true });
    await renderScreen("cycle", TEMPOS.cut);
    expect(screen.getByTestId("overture")).toBeInTheDocument();
    advance(OVERTURE_MS);
    await act(async () => {
      await Promise.resolve();
    });
    expect(currentId()).toBe("p0");
    expect(
      document.querySelectorAll("[data-testid='landing-reel'] img"),
    ).toHaveLength(1);
    steps(2, TEMPOS.gentle.frameMs);
    expect(sheet()).toHaveAttribute("data-open", "true");
  });

  // Review focus 3: the reset-password screen is static by route, and stays a still.
  it("static mode is unchanged by the preference: one still, no overture, sheet up", async () => {
    stubEnvironment({ reduce: true });
    await renderScreen("static");
    expect(screen.queryByTestId("overture")).not.toBeInTheDocument();
    expect(currentId()).toBe("p0");
    expect(sheet()).toHaveAttribute("data-open", "true");
    advance(60_000);
    key("ArrowRight");
    expect(currentId()).toBe("p0");
  });
});
```

Then add a second test inside the existing `describe("LandingScreen — hydration", …)`, after the Save-Data one, using the same shape (read that test in full first — it hydrates real server markup with `renderToString` + `hydrateRoot`; copy its setup exactly, changing only the environment and the assertion):

```tsx
  // Review focus 2: a reduced-motion reader hydrates with `reduce` false (the server snapshot),
  // i.e. the cut tempo and `Infinity` ahead. The tracker must wait for the corrective render, where
  // the tempo is gentle and one-ahead: two pictures requested, never twelve. This is the
  // "only the preloads were fetched" signature the 09-26 diagnosis read in the dev log, inverted.
  it("a reduced-motion reader's hydration requests one picture ahead, not the whole reel", async () => {
    stubEnvironment({ reduce: true });
    let requested = 0;
    vi.stubGlobal(
      "Image",
      class {
        src = "";
        srcset = "";
        sizes = "";
        constructor() {
          requested += 1;
        }
        decode = () => Promise.resolve();
      },
    );
    // …identical hydrate-real-markup setup to the Save-Data test above…
    expect(requested).toBe(2);
  });
```

(`stubEnvironment` must run before `vi.stubGlobal("Image", …)` here, or its own `Image` stub overwrites the counting one.)

- [ ] **Step 2: Run to verify it fails**

Run: `bun run test -- src/components/landing/landing-screen.test.tsx`
Expected: FAIL — under `reduce` the overture is absent and the sheet opens at once.

- [ ] **Step 3: Implement**

In `src/components/landing/landing-screen.tsx`, replace lines 86–119 (from `const reduce = …` through `const effectiveTempo = …`) with:

```ts
  const reduce = useMediaQuery(REDUCED_MOTION);
  const saveData = React.useSyncExternalStore(
    subscribeToNothing,
    readSaveData,
    onServer,
  );
  const isStatic = mode === "static";
  // A phone held upright draws the tall reel, anything wider the wide one (09-25-26): a wide
  // picture covering a tall screen is scaled to its height and cropped to a blurry middle.
  const portrait = useMediaQuery(
    "(orientation: portrait)",
    initialShape === "portrait",
  );
  const pictures = portrait ? reels.portrait : reels.landscape;

  // The reader's own say about the sheet, once they've had one — the first pass raising it, the
  // glyph, a collapse. Until then (`null`) the mode decides: static arrives with it up.
  const [opened, setOpened] = React.useState<boolean | null>(null);
  const open = hydrated && (opened ?? isStatic);

  // Static readers get one still. Save-Data readers get the overture and the first picture, and
  // then nothing more is downloaded: to the reel hook it is one picture long.
  const shown = React.useMemo(
    () => (isStatic || saveData ? pictures.slice(0, 1) : pictures),
    [isStatic, saveData, pictures],
  );

  // Every `cycle` reader gets the overture (the server renders its `in` phase for all of them, D8);
  // a reduced-motion reader gets it gentle — a plain fade — through the prop below.
  const { phase } = useOverture(mode === "cycle");

  // Reduced motion picks the tempo (D6, 09-26-26): the gentle one — the dissolve with nothing but
  // opacity moving — in place of whatever the server resolved. Read after hydration like `saveData`
  // (D8); for the hydration render the tempo is the server's, and nothing is fetched on that
  // render (see the `hydrated` gate on `usePictures`), so no reader pays for the wrong tempo.
  const baseTempo = reduce ? TEMPOS.gentle : tempo;
  // Behind the sheet the reel changes gear (D5): the same hook, the gentler tempo.
  const effectiveTempo = open ? TEMPOS[baseTempo.behindSheet] : baseTempo;
```

And the overture's JSX (line 194) becomes:

```tsx
      {!isStatic ? (
        <Overture phase={phase} hidden={open} gentle={reduce} />
      ) : null}
```

Update the file's header comment: the sentence "What still must not reach the server's markup is the reader's reduced-motion answer and `saveData` (D8)" stays true; add after it: *"Reduced motion is a tempo, not a mode, as of 09-26-26 — the reader gets the show, gently (D6)."*

The `useOverture` hook's `enabled` no longer changes after hydration for a `cycle` reader; leave the hook's adjust-on-change logic in place (it is what `/reset-password`'s static mode and the hook's own tests rely on).

- [ ] **Step 4: Run to verify it passes**

Run: `bun run test -- src/components/landing/` — every landing test PASS. If the first reduced-motion test's `advance(OVERTURE_MS - 1)` / `advance(1)` split fails because the reducer's gate and the timers settle on different ticks, follow the pattern of the existing `"cuts into the reel when the overture ends"` test in the `cycle` describe (read it) and match its `advance`/`act` sequence rather than inventing a new one.

Then `bun run test` (the whole suite) and `bun run check`.

- [ ] **Step 5: Commit**

```bash
git add src/components/landing/landing-screen.tsx src/components/landing/landing-screen.test.tsx
git commit -m "feat(landing): reduced motion is a tempo, not a still — gentle overture and reel for readers who ask for less"
```

---

### Task 6: The e2e reduced-motion test measures the gentle version

**Files:**
- Modify: `e2e/home.spec.ts:104-129` (the `"the sheet's disc collapses it back to the reel, reduced motion included"` test)

**Interfaces:**
- Consumes: the `visibleId` helper already in the file; test ids `overture`, `overture-tail`, `landing-reel`.

- [ ] **Step 1: Rewrite the test**

Replace the test and its leading comment with:

```ts
// Reduced motion (D6, 09-26-26). Emulated, because that reader is exactly the one two earlier bugs
// reached: the 09-10 hydration regression (an inert collapse disc), and the 09-26 finding that the
// old "one still" path was what Ben — Reduce Motion on, on both his devices — saw as "no
// animation at all". Meaningful only against a production build. The computed durations are the
// proof that globals.css's 0.01 ms collapse lets the landing through.
test("reduced motion: the overture fades, the reel cross-fades without drift, and the sheet's disc collapses it back", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  // The line is there for this reader now, at its real fade-in — not 0.01 ms.
  const overture = page.getByTestId("overture");
  await expect(overture).toBeVisible();
  expect(
    await overture.evaluate((el) => getComputedStyle(el).animationDuration),
  ).toBe("0.5s");
  // The gentle collapse: the tail unmounts on the frame the reel cuts in (~3.6 s).
  await expect(page.getByTestId("overture-tail")).toHaveCount(0, {
    timeout: 10_000,
  });
  // The first frame fades in from black; once it is fully there, no layer drifts and the
  // current one carries the gentle fade at its real duration.
  await expect.poll(() => visibleId(page), { timeout: 12_000 }).not.toBeNull();
  const layers = await page
    .locator("[data-testid='landing-reel'] img")
    .evaluateAll((imgs) =>
      imgs.map((i) => ({
        animation: getComputedStyle(i).animationName,
        transition: getComputedStyle(i).transitionDuration,
        opacity: getComputedStyle(i).opacity,
      })),
    );
  expect(layers.every((l) => l.animation === "none")).toBe(true);
  expect(layers.find((l) => l.opacity === "1")?.transition).toBe("2.5s");

  // The glyph, rather than waiting the gentle first pass (~16 s): the sheet's round trip is
  // what this test is for.
  await page.getByRole("button", { name: "Open sign-in" }).click();
  await expect(page.getByPlaceholder("you@example.com")).toBeInViewport();
  await page.getByRole("button", { name: "Back to the slideshow" }).click();
  await expect(
    page.getByRole("button", { name: "Open sign-in" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open sign-in" }).click();
  await expect(page.getByPlaceholder("you@example.com")).toBeInViewport();

  expect(consoleErrors).toEqual([]);
});
```

- [ ] **Step 2: Free port 3000 and run the suite against a production build**

```bash
lsof -ti:3000            # if anything is listed, find out whose it is before killing it:
ps -o pid,command -p $(lsof -ti:3000)
```

If it is `~/Dev/ambit-topic-groups`'s `next start`/Playwright (as on 09-26 morning), it is a stale run of another session — kill it (`kill $(lsof -ti:3000)`) and note it in the log entry. Then:

```bash
bun run e2e:prod
```

Expected: the whole suite green, on both Playwright projects (`chromium` at 402 × 874 and `desktop` at 1440 × 900). The rewritten test's first assertion (`"0.5s"`) is the one that would fail if Task 2's selector were wrong; `"2.5s"` likewise.

If `e2e:prod` reports red tests *other* than this one, check `CLAUDE.md`'s local-dev notes before debugging (fixture races, busy machine) — those are known.

- [ ] **Step 3: Commit**

```bash
git add e2e/home.spec.ts
git commit -m "test(e2e): reduced motion measures the gentle overture and reel at their real durations"
```

---

### Task 7: The design doc says what ships, and the log records the diagnosis

**Files:**
- Modify: `docs/DESIGN_landing-redo.md` — D5's tempo table (add the row), D6's reduced-motion bullet, the 09-25-26 amendment's last paragraph ("Reduced motion is unchanged…")
- Modify: `log.md` — extend the existing `### [[09-26-26 Sat]]` entry (never a second heading for the same day)
- Modify: `CLAUDE.md` — one sentence in the 8.3 paragraph of "Repository status"

- [ ] **Step 1: D5 — the tempo table**

Wherever D5 tabulates `cut` and `dissolve` (frame, fade, first pass, gate, drift), add a `gentle` row: 6000 / 2500 / 2 / 1 / no drift / **soft start**, with the note: *"Not a candidate. What a reduced-motion reader gets in place of either (D6). Its own gear behind the sheet, because relaxing to `dissolve` would bring the drift back."* Add `softStart` to the `Tempo` field list if D5 lists the fields.

- [ ] **Step 2: D6 — replace the reduced-motion bullet**

```markdown
- **Reduced motion (rewritten 09-26-26):** the reader gets the show, gently. The overture plays as
  a plain fade — the line fades in, holds, fades out as a whole, and the wordmark alone fades back
  in over the reel; nothing clips or translates. The reel runs the `gentle` tempo (D5): the
  dissolve's 6 s / 2.5 s clock with no drift and a soft start, so even the first frame fades in
  from black. Opacity is the only property that moves. The sheet rises on the gentle first pass
  (two frames). Still read after hydration through `useMediaQuery`, never in the server render
  (D8): the server renders phase `in` for everyone, which is now what every reader sees first,
  and the preference only changes what happens from the collapse on. `globals.css`'s 0.01 ms
  collapse exempts the reel and overture roots (`.motion-gentle`) and nothing else — the sheet
  still collapses. *History:* until 09-26 this bullet said "one still, sheet up"; that was what Ben
  saw on both his devices (Reduce Motion on) and reported as "no animation at all".
```

- [ ] **Step 3: The 09-25-26 amendment**

Replace its last paragraph's sentence "Reduced motion is unchanged — still one still with the sheet up — pending Ben checking whether his phone has Reduce Motion on (the evidence says it does: his visits fetched only the preloads)." with: "Reduced motion was the cause of the 'no motion' reports on both his devices, confirmed 09-26-26; D6 is rewritten — the gentle version — and `docs/PLAN_landing-reduced-motion.md` built it."

- [ ] **Step 4: `CLAUDE.md`**

In the "Repository status" paragraph that begins "**8.3, the landing redo, was built 09-25-26…**", after the sentence ending "see the design's 09-25-26 amendment.", add: *"**Reduced motion is a tempo, not a still, since 09-26-26** — Ben's 'no animation on phone or computer' was Reduce Motion on at the OS level on both; a reader who asks for less now gets the overture as a plain fade and the reel as drift-free cross-fades (`TEMPOS.gentle`), and `globals.css`'s 0.01 ms collapse exempts only `.motion-gentle`."*

- [ ] **Step 5: `log.md`**

Extend the `### [[09-26-26 Sat]]` entry (it already has the diagnosis and Ben's decision, added by the planning session) with a `**Shipped:**` block naming the seven commits' substance in three or four lines, and end with a spend line from `python3 ~/.claude/scripts/session-spend.py --session <this session's uuid>` — pasted verbatim, omitted if the script exits non-zero.

- [ ] **Step 6: Verify and commit**

```bash
bun run check && bun run test
git add docs/DESIGN_landing-redo.md CLAUDE.md log.md
git commit -m "docs(8.3): reduced motion is the gentle tempo — D5/D6 rewritten, CLAUDE.md, log"
```

Do not push and do not merge: `fix/landing-orientation` is Ben's to review on the phone (Reduce Motion still on — that is now the point) and then merge with the rest of the landing work.

---

## Self-review

- **Spec coverage:** decision → gentle overture (T3), gentle reel (T1, T4), selection by preference (T5), the global collapse letting it through (T2, proven T6), D6/D5 rewritten (T7). Hydration constraint (D8) unchanged and re-pinned (T5 hydration test). Static mode unchanged (T5).
- **Placeholders:** the one elision is the hydration test's setup, which the plan tells the implementer to copy from the adjacent test in the same file rather than retyping ~30 lines that would drift; the assertion is given.
- **Type consistency:** `softStart: boolean` (T1) ← read in T4 as `tempo.softStart`; `TEMPOS.gentle` (T1) ← T5; `gentle?: boolean` on `OvertureProps` (T3) ← `<Overture gentle={reduce} />` (T5); class `motion-gentle` (T2) ← T3, T4; `TempoId` includes `"gentle"` so `behindSheet: "gentle"` type-checks.
- **Review focus:** each of the five lines names its task; all five have test code above.
