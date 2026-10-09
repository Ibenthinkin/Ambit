// The usage client (docs/DESIGN_usage.md, "Transport"): a small in-memory queue of events that
// is flushed to POST /api/usage, plus the "visit clock" that measures how long a reader was
// actually looking at the page.
//
// Everything that touches the browser (`send`, `now`, `storage`, `isVisible`, `newId`) is
// injected, so the queue and the clock are plain functions of their inputs and the tests drive
// them with a fake clock. `browserSend` / `browserStorage` are the real wiring, used only by the
// provider.
import {
  FLUSH_MS,
  MAX_EVENTS_PER_BEACON,
  SCREENS,
  type META_SPEC,
  type MetaRule,
  type Screen,
  type UsageKind,
} from "~/config/usage";

// ---------------------------------------------------------------- typed `track`

type RuleValue<R> = R extends readonly (infer S)[]
  ? S
  : R extends "bool"
    ? boolean
    : R extends { readonly int: unknown }
      ? number
      : R extends { readonly string: unknown }
        ? string
        : never;

/** The meta object a kind carries, derived from `META_SPEC` so the two cannot drift apart. */
export type MetaOf<K extends UsageKind> = {
  -readonly [P in keyof (typeof META_SPEC)[K]]: RuleValue<
    (typeof META_SPEC)[K][P]
  >;
};

/** A kind with no meta keys takes no `meta`; a kind with keys requires all of them. */
export type TrackProps<K extends UsageKind> = {
  screen?: Screen;
  itemId?: string;
  topicId?: string;
} & (keyof (typeof META_SPEC)[K] extends never
  ? { meta?: undefined }
  : { meta: MetaOf<K> });

export type Track = <K extends UsageKind>(
  kind: K,
  ...props: keyof (typeof META_SPEC)[K] extends never
    ? [props?: TrackProps<K>]
    : [props: TrackProps<K>]
) => void;

type WireEvent = {
  kind: UsageKind;
  at: string;
  screen?: Screen;
  itemId?: string;
  topicId?: string;
  meta?: Record<string, unknown>;
};
export type UsageBody = { visit: string; events: WireEvent[] };

// Compile-time check that the rule type above stays in step with the config shape.
type _RuleCheck =
  (typeof META_SPEC)[UsageKind] extends Record<string, MetaRule> ? true : never;
export const _ruleCheck: _RuleCheck = true;

// ---------------------------------------------------------------- the queue + clock

export type UsageStorage = {
  get(key: string): string | null;
  set(key: string, value: string): void;
};

export type UsageDeps = {
  send: (body: UsageBody) => void;
  /** Epoch milliseconds. */
  now: () => number;
  storage: UsageStorage;
  /** Is the page being looked at right now? (`document.visibilityState === "visible"`) */
  isVisible?: () => boolean;
  newId?: () => string;
  /** Timer hooks, injectable; default to the globals. */
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
};

export type VisitEntry = {
  screen?: Screen;
  device: "phone" | "desktop";
  standalone: boolean;
  via: "direct" | "link" | "internal";
};

export type Usage = {
  track: Track;
  flush(): void;
  start(entry: VisitEntry): void;
  /** The page was hidden: report active seconds since the last report, and flush. */
  end(): void;
  /** The page is visible again: the same visit continues; the clock restarts. */
  resume(): void;
  stop(): void;
};

export const VISIT_KEY = "ambit.visit";
const MAX_SECONDS = 86_400;

/** `0 <= s <= 86_400` integer — what the server accepts for `visit.end{seconds}`. */
export function clampSeconds(ms: number): number {
  return Math.min(MAX_SECONDS, Math.max(0, Math.round(ms / 1000)));
}

export function createUsage(deps: UsageDeps): Usage {
  const { send, now, storage } = deps;
  const isVisible = deps.isVisible ?? (() => true);
  const setTimer =
    deps.setInterval ?? ((fn, ms) => globalThis.setInterval(fn, ms));
  const clearTimer =
    deps.clearInterval ??
    ((h) => globalThis.clearInterval(h as ReturnType<typeof setInterval>));

  // The visit key. sessionStorage, not localStorage: it is per tab and dies with the tab, so a
  // "visit" is one sitting and the key cannot be used to follow a person from day to day. Every
  // storage call is guarded because private modes throw; then the key lives in memory only.
  let visit = "";
  try {
    visit = storage.get(VISIT_KEY) ?? "";
  } catch {
    /* in-memory fallback below */
  }
  if (visit.length < 8 || visit.length > 32) {
    visit = (deps.newId ?? (() => Math.random().toString(36).slice(2, 12)))();
    try {
      storage.set(VISIT_KEY, visit);
    } catch {
      /* keep the in-memory key */
    }
  }

  let queue: WireEvent[] = [];
  let timer: unknown = null;

  // The visibility accumulator. `activeSince` is when the page last became visible (null while
  // hidden); `accruedMs` is visible time already banked since the last `visit.end`. A tab that
  // sits hidden for an hour adds nothing — that is the whole point of not using wall time.
  let activeSince: number | null = null;
  let accruedMs = 0;

  function bank() {
    if (activeSince !== null) {
      accruedMs += Math.max(0, now() - activeSince);
      activeSince = null;
    }
  }

  function flush() {
    // Successive batches of at most MAX_EVENTS_PER_BEACON; the server drops the 51st and later.
    while (queue.length > 0) {
      const events = queue.slice(0, MAX_EVENTS_PER_BEACON);
      queue = queue.slice(MAX_EVENTS_PER_BEACON);
      try {
        send({ visit, events });
      } catch {
        /* fire-and-forget: a failed send is lost, never retried, never thrown */
      }
    }
  }

  const track: Track = (kind, ...rest) => {
    const props = (rest[0] ?? {}) as TrackProps<UsageKind>;
    const event: WireEvent = { kind, at: new Date(now()).toISOString() };
    if (props.screen) event.screen = props.screen;
    if (props.itemId) event.itemId = props.itemId;
    if (props.topicId) event.topicId = props.topicId;
    if (props.meta) event.meta = props.meta;
    queue.push(event);
    if (queue.length >= MAX_EVENTS_PER_BEACON) flush();
  };

  return {
    track,
    flush,
    start(entry) {
      if (timer === null) timer = setTimer(flush, FLUSH_MS);
      if (isVisible()) activeSince = now();
      track("visit.start", {
        screen: entry.screen,
        meta: {
          device: entry.device,
          standalone: entry.standalone,
          via: entry.via,
        },
      });
    },
    end() {
      bank();
      // pagehide and visibilitychange→hidden both fire on a tab close; the second finds nothing
      // banked and must not send a second `visit.end` of 0 seconds.
      if (accruedMs > 0) {
        track("visit.end", { meta: { seconds: clampSeconds(accruedMs) } });
        accruedMs = 0;
      }
      flush();
    },
    resume() {
      if (activeSince === null && isVisible()) activeSince = now();
    },
    stop() {
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
  };
}

// ---------------------------------------------------------------- the singleton

let current: Usage | null = null;

/** The provider installs its instance here; `null` uninstalls (unmount, tests). */
export function installUsage(usage: Usage | null) {
  current = usage;
}

/** Module-level so any component can call it without prop drilling; a no-op with no provider. */
export const track: Track = (kind, ...rest) => {
  current?.track(kind, ...rest);
};

// ---------------------------------------------------------------- pure helpers

/**
 * Route → screen name. Unknown paths (dev tools, reset-password, redirects) give `null`: no event.
 * `search` is only consulted for `/saved`, where `?collection=` is the collection screen.
 * The reveal is a step inside `/onboarding`, not a route, so it cannot be produced here — Task 9
 * emits `screen.open{screen:"reveal"}` from the onboarding component when the reveal mounts.
 */
export function screenFor(pathname: string, search = ""): Screen | null {
  if (pathname === "/") return "landing";
  if (pathname === "/explore") return "explore";
  if (pathname === "/feed") return "feed";
  if (pathname.startsWith("/i/")) return "item";
  if (pathname === "/saved") {
    return new URLSearchParams(search).has("collection")
      ? "collection"
      : "saved";
  }
  if (pathname === "/profile") return "profile";
  if (pathname === "/profile/topics") return "topics";
  if (pathname === "/profile/edit") return "edit";
  if (pathname === "/profile/settings") return "settings";
  if (pathname === "/onboarding") return "onboarding";
  if (pathname === "/~offline") return "offline";
  return null;
}

/** Every screen the map can produce — the test compares this to `SCREENS`. */
export const MAPPED_SCREENS: readonly Screen[] = SCREENS.filter(
  (s) => s !== "reveal",
);

/** `""` → direct, same origin → internal, anything else → link. The host is never sent. */
export function viaFor(referrer: string, origin: string): VisitEntry["via"] {
  if (!referrer) return "direct";
  try {
    return new URL(referrer).origin === origin ? "internal" : "link";
  } catch {
    return "link";
  }
}

// ---------------------------------------------------------------- browser wiring

/**
 * `sendBeacon` is the one call the browser promises to finish after the page is gone, which is
 * exactly when the last batch (`pagehide`) goes out; a plain `fetch` is cancelled with the page
 * (`keepalive` is the fallback that asks it not to be). The body is a `Blob` with an explicit JSON
 * type because a string body is sent as `text/plain`, and the route wants `application/json`.
 */
export function browserSend(body: UsageBody) {
  const json = JSON.stringify(body);
  try {
    if (
      typeof navigator.sendBeacon === "function" &&
      navigator.sendBeacon(
        "/api/usage",
        new Blob([json], { type: "application/json" }),
      )
    ) {
      return;
    }
    void fetch("/api/usage", {
      method: "POST",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: json,
    }).catch(() => undefined);
  } catch {
    /* never throw from analytics */
  }
}

export const browserStorage: UsageStorage = {
  get: (k) => window.sessionStorage.getItem(k),
  set: (k, v) => window.sessionStorage.setItem(k, v),
};
