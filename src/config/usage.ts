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

/** The closed meta keys per kind. Anything else in `meta` is dropped by the route. */
export const META_KEYS: Record<UsageKind, readonly string[]> = {
  "visit.start": ["device", "standalone", "via"],
  "visit.end": ["seconds"],
  "screen.open": [],
  "item.open": ["from"],
  "item.linkout": [],
  "item.share": ["method"],
  "item.zoom": [],
  "item.magazine": ["on"],
  "item.unsave": [],
  "topics.edit": ["action"],
  "onboarding.step": ["step", "action"],
  "onboarding.retake": [],
  "pwa.install": ["how"],
  "client.error": ["digest"],
};

/**
 * The allowed values for the enumerated meta keys, shared by the server's zod schema and the
 * client's call sites. Keyed by meta key name — except `stepAction`, because `action` means two
 * different sets (`topics.edit` vs `onboarding.step`); a schema builder maps
 * onboarding.step's `action` to `stepAction`.
 * Not enumerated here (their shape is the validator's job): `step` is an int 1..8, `seconds`
 * an int, `standalone` / `on` booleans, `digest` a string of at most 32 characters.
 */
export const META_VALUES = {
  device: ["phone", "desktop"],
  via: ["direct", "link", "internal"],
  from: ["feed", "rail", "saved", "wander", "link", "explore", "hang"],
  method: ["share", "copy", "image"],
  action: ["add", "remove", "little", "some", "lot"],
  stepAction: ["answer", "skip", "back"],
  how: ["prompt", "card", "appinstalled"],
} as const;

export const ONBOARDING_STEPS = { min: 1, max: 8 } as const;
export const DIGEST_MAX = 32;

/** Most events one beacon may carry; the 51st and later are dropped. */
export const MAX_EVENTS_PER_BEACON = 50;
/** Rows older than this are removed by `usage:report --prune`. */
export const USAGE_RETENTION_DAYS = 90;
/** The client queue's timer flush interval, in ms. */
export const FLUSH_MS = 15_000;
