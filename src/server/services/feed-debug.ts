// The dev-affordance gate (SPEC §9): are client-supplied feed knobs honored, and does each card
// carry its `debug` payload? One function, so the feed engine, the gallery rail, the
// `feed.forgetSince` mutation and the `/dev/feed` route can never disagree about the answer.
//
// The rule: `FEED_DEBUG=true|false` wins when set; otherwise development is on and everything
// else is off. It is NOT baked into env.js's schema on purpose — env.js validates strings, and
// the NODE_ENV-aware default is a policy, not a parse (see env.js's comment above FEED_DEBUG).
//
// Dynamic import, same as every other server module here: `~/env` throws at import when env
// vars are missing (CI's `bun run test`), and a static import would take every pure feed test
// down with it. Tests that need to flip the gate mock `~/env` via vi.hoisted — see
// feed.test.ts's `mockEnv`.
export async function feedDebugEnabled(): Promise<boolean> {
  const { env } = await import("~/env");
  return env.FEED_DEBUG ?? env.NODE_ENV === "development";
}
