// Loaded once before every test file (see vitest.config.ts's `test.setupFiles`). Registers
// jest-dom's matchers (`toBeInTheDocument()`, `toHaveClass()`, etc.) globally so component tests
// can use them without a per-file import. The `/vitest` subpath (not the bare package, and not
// the old Jest-specific `/extend-expect` path) is jest-dom's Vitest-native entry point.
import "@testing-library/jest-dom/vitest";

// React Testing Library's own `afterEach(cleanup)` registers itself automatically as long as
// `test.globals: true` is set in vitest.config.ts — no manual cleanup call needed here.

// jsdom implements no `IntersectionObserver` (it has no layout engine, so there's nothing for one
// to observe). Without a stub, merely *rendering* any component that constructs one — the feed's
// infinite-scroll sentinel, from 5.6 — throws `IntersectionObserver is not defined` before the
// test can assert anything at all.
//
// This one is deliberately inert: it records nothing and never fires. That's the right default,
// because "the sentinel is off-screen" is the state almost every test wants. A test that needs to
// *drive* an intersection overrides it for itself with `vi.stubGlobal("IntersectionObserver", ...)`
// capturing the constructor callback, and restores this via `vi.unstubAllGlobals()` in `afterEach`.
//
// Guarded on `undefined` rather than assigned unconditionally so it never shadows a real
// implementation — the node-environment test files don't have one, but a future browser-mode or
// happy-dom run would, and silently replacing a working API with a no-op is a nasty way to lose an
// afternoon.
if (typeof globalThis.IntersectionObserver === "undefined") {
  class NoopIntersectionObserver implements IntersectionObserver {
    readonly root: Element | Document | null = null;
    readonly rootMargin: string = "0px";
    readonly thresholds: readonly number[] = [];
    observe(): void {
      // nothing is ever observed to intersect in jsdom
    }
    unobserve(): void {
      // no-op
    }
    disconnect(): void {
      // no-op
    }
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  globalThis.IntersectionObserver = NoopIntersectionObserver;
}
