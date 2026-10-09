// The usage-event vocabulary (docs/DESIGN_usage.md) — a closed set, kept as config on purpose.
//
// Why a vocabulary is a file and not a free-form string: an analytics table where any client
// can write any `kind` with any `meta` slowly becomes a place personal data leaks into. Here the
// kinds, the screens and every meta key (and, where the design closes them, every meta value) are
// listed once, in code review's view. The route handler validates against this file and drops
// the rest; the client's `track()` is typed from it; the report reads from it. Widening what
// Ambit records is therefore a visible diff to this file, never a side effect.
//
// This module has NO imports: the browser bundles it, and it must not drag the server in.

export const USAGE_KINDS = [
  "visit.start",
  "visit.end",
  "screen.open",
  "item.open",
  "item.linkout",
  "item.share",
  "item.zoom",
  "item.magazine",
  "item.unsave",
  "topics.edit",
  "onboarding.step",
  "onboarding.retake",
  "pwa.install",
  "client.error",
] as const;
export type UsageKind = (typeof USAGE_KINDS)[number];

/** Route *names*, never URLs — the `screen` column holds one of these or null. */
export const SCREENS = [
  "landing",
  "explore",
  "feed",
  "item",
  "saved",
  "collection",
  "profile",
  "topics",
  "edit",
  "settings",
  "onboarding",
  "reveal",
  "offline",
] as const;
export type Screen = (typeof SCREENS)[number];

export const ONBOARDING_STEPS = { min: 1, max: 8 } as const;
export const DIGEST_MAX = 32;

/**
 * What one meta value may be. A string list is an enum (the value must be one of them); the
 * other forms are the shapes the design leaves open but bounded.
 */
export type MetaRule =
  | readonly string[]
  | "bool"
  | { readonly int: { readonly min: number; readonly max: number } }
  | { readonly string: { readonly max: number } };

/**
 * For each kind, each meta key it carries and what that key accepts — the one place that says so.
 * Keyed per kind (not per meta key) because the same name means different things: `action` is
 * add/remove/little/some/lot on `topics.edit` but answer/skip/back on `onboarding.step`.
 * Every key listed is required on its kind; a key not listed is rejected (the route's schemas
 * are `.strict()`), and a kind with `{}` rejects any meta at all.
 */
export const META_SPEC = {
  "visit.start": {
    device: ["phone", "desktop"],
    standalone: "bool",
    via: ["direct", "link", "internal"],
  },
  "visit.end": { seconds: { int: { min: 0, max: 86_400 } } },
  "screen.open": {},
  // `hang` is in the vocabulary (it is in the design table) but nothing emits it yet: the reveal's
  // hang pictures are not links.
  "item.open": {
    from: ["feed", "rail", "saved", "wander", "link", "explore", "hang"],
  },
  "item.linkout": {},
  "item.share": { method: ["share", "copy", "image"] },
  "item.zoom": {},
  "item.magazine": { on: "bool" },
  "item.unsave": {},
  "topics.edit": { action: ["add", "remove", "little", "some", "lot"] },
  "onboarding.step": {
    step: { int: ONBOARDING_STEPS },
    action: ["answer", "skip", "back"],
  },
  "onboarding.retake": {},
  "pwa.install": { how: ["prompt", "card", "appinstalled"] },
  "client.error": { digest: { string: { max: DIGEST_MAX } } },
} as const satisfies Record<UsageKind, Record<string, MetaRule>>;

/** The closed meta keys per kind — derived from `META_SPEC`, so the two cannot disagree. */
export const META_KEYS: Record<UsageKind, readonly string[]> =
  Object.fromEntries(
    USAGE_KINDS.map((kind) => [kind, Object.keys(META_SPEC[kind])]),
  ) as unknown as Record<UsageKind, readonly string[]>;

/** Most events one beacon may carry; the 51st and later are dropped. */
export const MAX_EVENTS_PER_BEACON = 50;
/** Rows older than this are removed by `usage:report --prune`. */
export const USAGE_RETENTION_DAYS = 90;
/** The client queue's timer flush interval, in ms. */
export const FLUSH_MS = 15_000;
