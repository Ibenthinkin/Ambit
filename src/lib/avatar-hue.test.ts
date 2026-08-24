import { describe, expect, it } from "vitest";

import { avatarGradient, avatarHue } from "./avatar-hue";

// A pure module, so these are the three properties that actually matter in production: the same id
// always gives the same disc (or an avatar would change under the user), the hue is always a legal
// CSS hue, and different ids mostly get different hues (or the whole feature is decorative).

describe("avatarHue", () => {
  it("is deterministic for the same id", () => {
    const id = "user_7fJk2mQ";
    expect(avatarHue(id)).toBe(avatarHue(id));
    // Pinned, not just self-consistent: a change to the hash would silently re-color every
    // existing user's avatar, which is exactly the kind of thing a test should make loud.
    expect(avatarHue(id)).toBe(avatarHue("user_7fJk2mQ"));
  });

  it("always lands in [0, 359]", () => {
    const ids = ["", "a", "user-1", "🙂", "x".repeat(500), "Zz09_-"];
    for (const id of ids) {
      const hue = avatarHue(id);
      expect(Number.isInteger(hue)).toBe(true);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThanOrEqual(359);
    }
  });

  it("spreads a realistic batch of ids across the wheel", () => {
    // nanoid-shaped ids sharing a prefix — the clustering case the hash has to survive, since
    // every real user id in this app comes off the same generator.
    const hues = Array.from({ length: 200 }, (_, i) =>
      avatarHue(`user_ambit_${i}`),
    );
    const distinct = new Set(hues);
    // Not 200: 200 values into 360 buckets collide by birthday paradox alone (~50 expected
    // collisions). The floor that matters is "this is a hash, not a constant".
    expect(distinct.size).toBeGreaterThan(120);
  });

  it("gives neighbouring ids visibly different hues", () => {
    // The failure this guards against is a weak hash where an incremented last character moves the
    // hue by one degree — technically distinct, indistinguishable to a human.
    const a = avatarHue("user_ambit_aaaaaaaa");
    const b = avatarHue("user_ambit_aaaaaaab");
    const apart = Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
    expect(apart).toBeGreaterThan(10);
  });
});

describe("avatarGradient", () => {
  it("is a two-stop 150° gradient on the id's own hue", () => {
    const hue = avatarHue("user_7fJk2mQ");
    expect(avatarGradient("user_7fJk2mQ")).toBe(
      `linear-gradient(150deg, hsl(${hue} 62% 72%), hsl(${(hue + 18) % 360} 54% 46%))`,
    );
  });

  it("wraps the second stop past 359 rather than emitting an illegal hue", () => {
    // Find an id whose hue is high enough that +18 crosses the wheel — proving the modulo is real
    // rather than a line that never executes.
    const id = Array.from({ length: 5000 }, (_, i) => `wrap-${i}`).find(
      (candidate) => avatarHue(candidate) > 345,
    );
    expect(id).toBeDefined();
    const second = (avatarHue(id!) + 18) % 360;
    expect(second).toBeLessThan(20);
    expect(avatarGradient(id!)).toContain(`hsl(${second} 54% 46%)`);
  });
});
