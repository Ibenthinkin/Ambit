"use client";

import * as React from "react";

import { DEFAULT_KNOBS, type FeedKnobs } from "~/server/services/feed-knobs";

// The dev knob panel's state (plan 09-05-26). Three responsibilities and nothing visual:
// the slider specs (one row per knob — labels, ranges and the one-line note the Phase 0.5 bench
// carried under each track), persistence in localStorage so a reload keeps a setting, and
// `toJson()` — the copy-as-JSON payload that is how a setting travels from a tuning session to a
// DEFAULT_KNOBS edit.
//
// Ranges sit INSIDE routers/feed.ts's `feedKnobsSchema` bounds on purpose: a slider must never
// be able to produce a value the server 400s.
export interface KnobSpec {
  key: keyof FeedKnobs;
  label: string;
  section: "Tier mix" | "Taste" | "Drift shape" | "Diversity" | "Grown topics";
  min: number;
  max: number;
  step: number;
  note?: string;
}

export const KNOB_SPECS: readonly KnobSpec[] = [
  {
    key: "tierCore",
    label: "CORE — your topics",
    section: "Tier mix",
    min: 0,
    max: 100,
    step: 1,
  },
  {
    key: "tierDrift",
    label: "DRIFT — adjacent topics",
    section: "Tier mix",
    min: 0,
    max: 100,
    step: 1,
  },
  {
    key: "tierJump",
    label: "JUMP — far topics",
    section: "Tier mix",
    min: 0,
    max: 100,
    step: 1,
  },
  {
    key: "tierWild",
    label: "WILD — un-homed pool",
    section: "Tier mix",
    min: 0,
    max: 100,
    step: 1,
    note: "Draws items no topic fits, weighted by your recent saves' aesthetic tags. 0 turns the tier off entirely.",
  },
  {
    key: "scoreFloor",
    label: "Curation score floor",
    section: "Taste",
    min: 1,
    max: 9,
    step: 1,
    note: "Items below this score never appear.",
  },
  {
    key: "scorePower",
    label: "Score weighting power",
    section: "Taste",
    min: 0,
    max: 3,
    step: 0.1,
    note: "0 = uniform within a topic; higher = the curator's favourites dominate.",
  },
  {
    key: "tagBoost",
    label: "Aesthetic-tag boost",
    section: "Taste",
    min: 0,
    max: 2,
    step: 0.1,
    note: "Multiplier per keyword an item shares with your profile.",
  },
  {
    key: "wildTagBoost",
    label: "WILD taste boost",
    section: "Taste",
    min: 0,
    max: 3,
    step: 0.1,
    note: "The same, for WILD cards only — where it is the slot's one personalization signal.",
  },
  {
    key: "temp",
    label: "Drift temperature",
    section: "Drift shape",
    min: 0.03,
    max: 0.6,
    step: 0.01,
    note: "Low = drift hugs the strongest bridge; high = wanders the whole row.",
  },
  {
    key: "hop2",
    label: "Second-hop chance",
    section: "Drift shape",
    min: 0,
    max: 0.8,
    step: 0.01,
    note: "Poetry → Typography → Machines instead of stopping at Typography.",
  },
  {
    key: "grownEdgeScale",
    label: "Grown-edge scale",
    section: "Grown topics",
    min: 0,
    max: 4,
    step: 0.05,
    note: "Multiplies every graph edge that touches a grown topic. Moves DRIFT and JUMP; leaves the tuned core×core rows alone.",
  },
  {
    key: "grownHopPenalty",
    label: "Grown-hop penalty",
    section: "Grown topics",
    min: 0,
    max: 1,
    step: 0.05,
    note: "Weight of a DRIFT hop landing on a grown topic. 0 = drift stays inside the sixteen.",
  },
  {
    key: "topicCap",
    label: "Per-page topic cap",
    section: "Diversity",
    min: 1,
    max: 8,
    step: 1,
  },
  {
    key: "sourceCap",
    label: "Per-page source cap",
    section: "Diversity",
    min: 1,
    max: 12,
    step: 1,
    note: "Most cards one source may have on a page, across every tier. The 'sources' readout below is what this moves.",
  },
  {
    key: "pageSize",
    label: "Page size",
    section: "Diversity",
    min: 6,
    max: 24,
    step: 1,
  },
];

export const DEV_KNOBS_STORAGE_KEY = "ambit.devKnobs.v1";

/** Only the knobs that differ from DEFAULT_KNOBS — what a human wants to read, and what a
 *  DEFAULT_KNOBS edit needs. */
export function nonDefault(knobs: FeedKnobs): Partial<FeedKnobs> {
  const out: Partial<FeedKnobs> = {};
  for (const k of Object.keys(DEFAULT_KNOBS) as (keyof FeedKnobs)[]) {
    if (knobs[k] !== DEFAULT_KNOBS[k]) out[k] = knobs[k];
  }
  return out;
}

/** DEFAULT_KNOBS overlaid with whatever `raw` (a stored JSON blob) validly carries. Only known
 *  keys, only finite numbers — a stale or hand-edited entry must not poison the query input (the
 *  server would 400 and the feed would show its error branch). */
function parse(raw: string | null): FeedKnobs {
  const out = { ...DEFAULT_KNOBS };
  if (!raw) return out;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<keyof FeedKnobs, unknown>>;
    for (const k of Object.keys(DEFAULT_KNOBS) as (keyof FeedKnobs)[]) {
      const v = parsed[k];
      if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    }
  } catch {
    /* not JSON — defaults it is */
  }
  return out;
}

// ── the store ─────────────────────────────────────────────────────────────────────────────────
// localStorage *is* the state, read through `useSyncExternalStore` — the repo's idiom for a value
// that exists only on the client (see landing-screen.tsx, install-flow.tsx). It gives the two
// things a `useState` + mount-effect version would need workarounds for: the server snapshot is
// DEFAULT_KNOBS so SSR and the hydrating render agree, and there is no setState-in-effect to
// re-render the tree on mount. The one extra fetch a saved setting costs on reload (defaults
// first, then the stored values) is a dev-tool price, and that page is forgotten like any other.
//
// `getSnapshot` must return the *same object* while nothing changed (React compares with
// Object.is), so the parsed knobs are cached against the raw string that produced them. Reading
// the raw string on every call is what keeps the cache honest when something else clears storage
// — a test's `localStorage.clear()`, a devtools "clear site data".
const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedKnobs: FeedKnobs = { ...DEFAULT_KNOBS };

function readRaw(): string | null {
  try {
    return localStorage.getItem(DEV_KNOBS_STORAGE_KEY);
  } catch {
    return null;
  }
}

function getSnapshot(): FeedKnobs {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedKnobs = parse(raw);
  }
  return cachedKnobs;
}

const getServerSnapshot = (): FeedKnobs => DEFAULT_KNOBS;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  for (const l of listeners) l();
}

function write(next: FeedKnobs) {
  try {
    const diff = nonDefault(next);
    if (Object.keys(diff).length === 0)
      localStorage.removeItem(DEV_KNOBS_STORAGE_KEY);
    else localStorage.setItem(DEV_KNOBS_STORAGE_KEY, JSON.stringify(diff));
  } catch {
    /* private mode etc. — the setting simply won't survive a reload */
  }
  notify();
}

function set(k: keyof FeedKnobs, v: number) {
  write({ ...getSnapshot(), [k]: v });
}

function reset() {
  write({ ...DEFAULT_KNOBS });
}

export function useDevKnobs() {
  const knobs = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const toJson = React.useCallback(
    () => JSON.stringify(nonDefault(knobs), null, 2),
    [knobs],
  );
  // `set` and `reset` are module-level, so they are referentially stable for free — callers can
  // put them in effect deps without a useCallback.
  return { knobs, set, reset, toJson };
}
