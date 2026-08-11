// Loaded once before every test file (see vitest.config.ts's `test.setupFiles`). Registers
// jest-dom's matchers (`toBeInTheDocument()`, `toHaveClass()`, etc.) globally so component tests
// can use them without a per-file import. The `/vitest` subpath (not the bare package, and not
// the old Jest-specific `/extend-expect` path) is jest-dom's Vitest-native entry point.
import "@testing-library/jest-dom/vitest";

// React Testing Library's own `afterEach(cleanup)` registers itself automatically as long as
// `test.globals: true` is set in vitest.config.ts — no manual cleanup call needed here.
