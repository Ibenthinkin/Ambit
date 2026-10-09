import { describe, expect, it } from "vitest";

import {
  FLUSH_MS,
  MAX_EVENTS_PER_BEACON,
  META_KEYS,
  META_SPEC,
  SCREENS,
  USAGE_KINDS,
  USAGE_RETENTION_DAYS,
} from "./usage";

// The design's vocabulary table (docs/DESIGN_usage.md), restated by hand: a change to the
// config must be a change to this test, which is what makes the vocabulary a deliberate act.
const DESIGN: Record<string, string[]> = {
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

describe("usage vocabulary", () => {
  it("has exactly the design's fourteen kinds", () => {
    expect([...USAGE_KINDS].sort()).toEqual(Object.keys(DESIGN).sort());
    expect(USAGE_KINDS).toHaveLength(14);
  });

  it("closes each kind's meta keys to the design's", () => {
    expect(Object.keys(META_KEYS).sort()).toEqual([...USAGE_KINDS].sort());
    for (const kind of USAGE_KINDS) {
      expect([...META_KEYS[kind]].sort()).toEqual([...DESIGN[kind]!].sort());
    }
  });

  it("lists the design's screens", () => {
    expect(SCREENS).toEqual([
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
    ]);
  });

  it("closes each kind's meta values to the design's", () => {
    expect(META_SPEC["item.open"].from).toEqual([
      "feed",
      "rail",
      "saved",
      "wander",
      "link",
      "explore",
      "hang",
    ]);
    expect(META_SPEC["topics.edit"].action).toEqual([
      "add",
      "remove",
      "little",
      "some",
      "lot",
    ]);
    // `action` is a different set on onboarding.step — which is why the spec is keyed per kind.
    expect(META_SPEC["onboarding.step"].action).toEqual([
      "answer",
      "skip",
      "back",
    ]);
    expect(META_SPEC["onboarding.step"].step).toEqual({
      int: { min: 1, max: 8 },
    });
    expect(META_SPEC["item.share"].method).toEqual(["share", "copy", "image"]);
    expect(META_SPEC["pwa.install"].how).toEqual([
      "prompt",
      "card",
      "appinstalled",
    ]);
    expect(META_SPEC["visit.start"].device).toEqual(["phone", "desktop"]);
    expect(META_SPEC["visit.start"].via).toEqual([
      "direct",
      "link",
      "internal",
    ]);
    expect(META_SPEC["visit.start"].standalone).toBe("bool");
    expect(META_SPEC["item.magazine"].on).toBe("bool");
    // A sitting longer than a day is not a sitting: bounded so nobody can poison active-time sums.
    expect(META_SPEC["visit.end"].seconds).toEqual({
      int: { min: 0, max: 86_400 },
    });
    expect(META_SPEC["client.error"].digest).toEqual({ string: { max: 32 } });
  });

  it("META_KEYS is exactly the keys of each kind's spec", () => {
    for (const kind of USAGE_KINDS) {
      expect([...META_KEYS[kind]].sort()).toEqual(
        Object.keys(META_SPEC[kind]).sort(),
      );
    }
  });

  it("pins the transport constants", () => {
    expect(MAX_EVENTS_PER_BEACON).toBe(50);
    expect(USAGE_RETENTION_DAYS).toBe(90);
    expect(FLUSH_MS).toBe(15_000);
  });
});
