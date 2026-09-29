import { describe, expect, it } from "vitest";

import { READING_PHRASES } from "./reading-phrases";
import { ERA_TOPICS, TOPIC_FACETS } from "./topic-facets";
import { PERIOD_TOPICS, TOPICS } from "./topics";

// The vocabulary a tied phrase may name: every faceted topic (what db:seed applies on every boot,
// so what production has) plus the sixteen originals.
const KNOWN = new Set([
  ...Object.keys(TOPIC_FACETS),
  ...TOPICS.map((t) => t.id),
]);

describe("READING_PHRASES", () => {
  const tied = READING_PHRASES.filter(
    (p): p is { topic: string; phrase: string; limit?: number } =>
      "topic" in p && typeof p.topic === "string",
  );

  it("ties phrases only to real, classifiable topics", () => {
    for (const p of tied) {
      expect(KNOWN.has(p.topic), p.topic).toBe(true);
      expect(p.topic in PERIOD_TOPICS, p.topic).toBe(false);
      expect(ERA_TOPICS.has(p.topic), p.topic).toBe(false);
    }
  });

  it("gives each of the sixteen originals at least one phrase — they replace its wikipedia cell", () => {
    const covered = new Set(tied.map((p) => p.topic));
    for (const t of TOPICS) expect(covered.has(t.id), t.id).toBe(true);
  });

  it("has positive whole limits, non-empty phrases, and no repeats", () => {
    const seen = new Set<string>();
    for (const p of READING_PHRASES) {
      if (p.limit !== undefined) {
        expect(Number.isInteger(p.limit) && p.limit > 0).toBe(true);
      }
      const key =
        "list" in p ? `list:${p.list}` : p.phrase.trim().toLowerCase();
      expect(key.length).toBeGreaterThan(0);
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
  });

  it("draws from all four lists", () => {
    const lists = READING_PHRASES.flatMap((p) => ("list" in p ? [p.list] : []));
    expect(lists.sort()).toEqual(["dyk", "featured", "good", "unusual"]);
  });
});
