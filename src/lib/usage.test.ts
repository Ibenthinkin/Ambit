import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_EVENTS_PER_BEACON, FLUSH_MS, SCREENS } from "~/config/usage";

import {
  MAPPED_SCREENS,
  VISIT_KEY,
  clampSeconds,
  createUsage,
  installUsage,
  screenFor,
  track,
  viaFor,
  type UsageBody,
} from "./usage";

function setup(opts: { stored?: string; throwingStorage?: boolean } = {}) {
  const sent: UsageBody[] = [];
  let t = 1_780_000_000_000;
  let visible = true;
  const mem = new Map<string, string>();
  if (opts.stored) mem.set(VISIT_KEY, opts.stored);
  const usage = createUsage({
    send: (b) => sent.push(b),
    now: () => t,
    storage: opts.throwingStorage
      ? {
          get: () => {
            throw new Error("denied");
          },
          set: () => {
            throw new Error("denied");
          },
        }
      : { get: (k) => mem.get(k) ?? null, set: (k, v) => void mem.set(k, v) },
    isVisible: () => visible,
    newId: () => "newvisit-12345",
  });
  return {
    usage,
    sent,
    mem,
    advance: (ms: number) => (t += ms),
    setVisible: (v: boolean) => (visible = v),
  };
}

describe("queue", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("an empty flush sends nothing", () => {
    const { usage, sent } = setup();
    usage.flush();
    expect(sent).toEqual([]);
  });

  it("batches events into one send with an ISO `at`", () => {
    const { usage, sent } = setup();
    usage.track("item.open", { itemId: "abc", meta: { from: "rail" } });
    usage.track("item.zoom");
    usage.flush();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.visit).toBe("newvisit-12345");
    expect(sent[0]!.events.map((e) => e.kind)).toEqual([
      "item.open",
      "item.zoom",
    ]);
    expect(sent[0]!.events[0]).toMatchObject({
      itemId: "abc",
      meta: { from: "rail" },
    });
    expect(new Date(sent[0]!.events[0]!.at).toISOString()).toBe(
      sent[0]!.events[0]!.at,
    );
    usage.flush();
    expect(sent).toHaveLength(1);
  });

  it("flushes by itself when the queue reaches the cap, and splits larger backlogs at 50", () => {
    const { usage, sent } = setup();
    for (let i = 0; i < MAX_EVENTS_PER_BEACON - 1; i++)
      usage.track("item.zoom");
    expect(sent).toHaveLength(0);
    usage.track("item.zoom");
    expect(sent).toHaveLength(1);
    expect(sent[0]!.events).toHaveLength(MAX_EVENTS_PER_BEACON);
  });

  it("flushes on the timer once started", () => {
    const { usage, sent } = setup();
    usage.start({ device: "phone", standalone: false, via: "direct" });
    vi.advanceTimersByTime(FLUSH_MS);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.events[0]).toMatchObject({
      kind: "visit.start",
      meta: { device: "phone", standalone: false, via: "direct" },
    });
    usage.stop();
  });

  it("swallows a throwing send", () => {
    const usage = createUsage({
      send: () => {
        throw new Error("offline");
      },
      now: () => 0,
      storage: { get: () => null, set: () => undefined },
    });
    usage.track("item.zoom");
    expect(() => usage.flush()).not.toThrow();
  });
});

describe("visit key", () => {
  it("reuses a stored key, writes a new one otherwise, survives throwing storage", () => {
    expect(setup({ stored: "existing-key-1" }).usage.track).toBeDefined();
    const a = setup({ stored: "existing-key-1" });
    a.usage.track("item.zoom");
    a.usage.flush();
    expect(a.sent[0]!.visit).toBe("existing-key-1");

    const b = setup();
    expect(b.mem.get(VISIT_KEY)).toBe("newvisit-12345");

    const c = setup({ throwingStorage: true });
    c.usage.track("item.zoom");
    c.usage.flush();
    expect(c.sent[0]!.visit).toBe("newvisit-12345");
  });
});

describe("visit clock", () => {
  const entry = { device: "desktop", standalone: true, via: "link" } as const;

  it("counts only visible time and reports it as visit.end", () => {
    const h = setup();
    h.usage.start({ ...entry, screen: "feed" });
    h.advance(10_000);
    h.setVisible(false);
    h.usage.end(); // 10 s visible
    h.advance(600_000); // ten hidden minutes: not counted
    h.setVisible(true);
    h.usage.resume();
    h.advance(5_000);
    h.setVisible(false);
    h.usage.end(); // +5 s
    const kinds = h.sent.flatMap((b) => b.events);
    const ends = kinds.filter((e) => e.kind === "visit.end");
    expect(ends.map((e) => e.meta)).toEqual([{ seconds: 10 }, { seconds: 5 }]);
    expect(kinds[0]).toMatchObject({ kind: "visit.start", screen: "feed" });
  });

  it("does not send a second zero-second visit.end when pagehide follows hidden", () => {
    const h = setup();
    h.usage.start(entry);
    h.advance(3_000);
    h.usage.end();
    h.usage.end();
    const ends = h.sent
      .flatMap((b) => b.events)
      .filter((e) => e.kind === "visit.end");
    expect(ends).toHaveLength(1);
  });

  it("a visit that starts hidden accrues nothing until it is shown", () => {
    const h = setup();
    h.setVisible(false);
    h.usage.start(entry);
    h.advance(60_000);
    h.usage.end();
    expect(
      h.sent.flatMap((b) => b.events).some((e) => e.kind === "visit.end"),
    ).toBe(false);
  });

  it("clamps to 0..86400", () => {
    expect(clampSeconds(-5)).toBe(0);
    expect(clampSeconds(2_000_000_000)).toBe(86_400);
    expect(clampSeconds(1_499)).toBe(1);
  });
});

describe("singleton", () => {
  it("track is a no-op without a provider and forwards once installed", () => {
    installUsage(null); // clears anything buffered by earlier tests
    expect(() => track("item.zoom")).not.toThrow();
    installUsage(null);
    const h = setup();
    installUsage(h.usage);
    track("item.open", { meta: { from: "feed" } });
    h.usage.flush();
    installUsage(null);
    expect(h.sent[0]!.events[0]!.kind).toBe("item.open");
  });

  it("buffers events tracked before install and replays them in order with their own time", () => {
    installUsage(null);
    track("item.open", { itemId: "a", meta: { from: "feed" } });
    track("item.zoom", { itemId: "a" });
    const h = setup();
    h.advance(60_000);
    installUsage(h.usage);
    h.usage.flush();
    installUsage(null);
    const events = h.sent[0]!.events;
    expect(events.map((e) => e.kind)).toEqual(["item.open", "item.zoom"]);
    expect(Date.parse(events[0]!.at)).toBeLessThan(Date.now() + 1000);
  });

  it("caps the pre-install buffer, keeping the oldest, and never sends with no provider", () => {
    installUsage(null);
    for (let i = 0; i < MAX_EVENTS_PER_BEACON + 10; i++)
      track("item.open", { itemId: `i${i}`, meta: { from: "feed" } });
    const h = setup();
    installUsage(h.usage);
    h.usage.flush();
    installUsage(null);
    const ids = h.sent.flatMap((b) => b.events.map((e) => e.itemId));
    expect(ids).toHaveLength(MAX_EVENTS_PER_BEACON);
    expect(ids[0]).toBe("i0");
  });

  it("uninstalling clears the buffer so it cannot leak into the next install", () => {
    installUsage(null);
    track("item.zoom", { itemId: "a" });
    installUsage(null);
    const h = setup();
    installUsage(h.usage);
    h.usage.flush();
    installUsage(null);
    expect(h.sent).toEqual([]);
  });

  it("is typed from META_SPEC", () => {
    const noop = () => {
      track("item.open", { itemId: "x", meta: { from: "rail" } });
      // @ts-expect-error not an allowed value
      track("item.open", { meta: { from: "nope" } });
      // @ts-expect-error item.zoom carries no meta
      track("item.zoom", { meta: { a: 1 } });
      // @ts-expect-error item.share requires its meta
      track("item.share");
    };
    expect(noop).toBeTypeOf("function");
  });
});

describe("screenFor / viaFor", () => {
  it("maps every route-backed screen; reveal is not a route", () => {
    const cases: [string, string, string][] = [
      ["/", "", "landing"],
      ["/explore", "", "explore"],
      ["/feed", "", "feed"],
      ["/i/abc123", "", "item"],
      ["/saved", "", "saved"],
      ["/saved", "?collection=c1", "collection"],
      ["/profile", "", "profile"],
      ["/profile/topics", "", "topics"],
      ["/profile/edit", "", "edit"],
      ["/profile/settings", "", "settings"],
      ["/onboarding", "", "onboarding"],
      ["/~offline", "", "offline"],
    ];
    const seen = new Set(cases.map(([p, s]) => screenFor(p, s)));
    for (const [p, s, want] of cases) expect(screenFor(p, s)).toBe(want);
    for (const screen of SCREENS) {
      if (screen === "reveal") expect(MAPPED_SCREENS).not.toContain(screen);
      else expect(seen).toContain(screen);
    }
    expect(MAPPED_SCREENS).toHaveLength(SCREENS.length - 1);
  });

  it("unknown paths give null", () => {
    expect(screenFor("/dev/feed")).toBeNull();
    expect(screenFor("/reset-password")).toBeNull();
    expect(screenFor("/g/abc")).toBeNull();
  });

  it("classifies the referrer without sending its host", () => {
    expect(viaFor("", "https://a.io")).toBe("direct");
    expect(viaFor("https://a.io/feed", "https://a.io")).toBe("internal");
    expect(viaFor("https://news.example/x", "https://a.io")).toBe("link");
    expect(viaFor("garbage", "https://a.io")).toBe("link");
  });
});

describe("visit.end whole seconds", () => {
  it("sub-second sends nothing and stays banked", () => {
    const h = setup();
    h.usage.start({ device: "phone", standalone: false, via: "direct" });
    h.advance(400);
    h.usage.end();
    h.usage.resume();
    h.advance(700);
    h.usage.end();
    const ends = h.sent
      .flatMap((b) => b.events)
      .filter((e) => e.kind === "visit.end");
    expect(ends.map((e) => e.meta)).toEqual([{ seconds: 1 }]);
  });
});
