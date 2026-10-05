import { describe, expect, it } from "vitest";

import { rankOptions, shown } from "./show";
import type { Question } from "./types";

const q: Question = {
  id: "playoff",
  kind: "choice",
  prompt: "Which would you look at longer?",
  show: { top: 2 },
  options: [
    {
      key: "a",
      label: "A",
      effects: [{ topics: ["astronomy", "moon"], score: 1 }],
    },
    { key: "b", label: "B", effects: [{ topics: ["botany"], score: 1 }] },
    {
      key: "c",
      label: "C",
      effects: [{ topics: ["music", "sound", "dance"], score: 1 }],
    },
    {
      key: "d",
      label: "D",
      effects: [{ topics: ["unlisted-topic"], score: 1 }],
    },
  ],
};
const listed = new Set([
  "astronomy",
  "moon",
  "botany",
  "music",
  "sound",
  "dance",
]);

describe("rankOptions", () => {
  it("ranks by the MEAN positive score over each option's listed targets, then shows the top N", () => {
    // a: (1 + 0) / 2 = 0.5 · b: 2 / 1 = 2 · c: (3 + 0 + 0) / 3 = 1 → b, c
    const scores = new Map([
      ["astronomy", 1],
      ["botany", 2],
      ["music", 3],
    ]);
    expect(rankOptions(q, scores, listed).map((o) => o.key)).toEqual([
      "b",
      "c",
    ]);
  });

  it("ignores negative scores and breaks ties in bank order", () => {
    const scores = new Map([
      ["music", -5],
      ["botany", 0],
    ]);
    expect(rankOptions(q, scores, listed).map((o) => o.key)).toEqual([
      "a",
      "b",
    ]);
  });

  it("returns what exists when fewer than `top` options survive — never pads, never throws", () => {
    const one: Question = { ...q, options: q.options.slice(0, 1) };
    expect(rankOptions(one, new Map(), listed).map((o) => o.key)).toEqual([
      "a",
    ]);
    expect(rankOptions({ ...q, options: [] }, new Map(), listed)).toEqual([]);
  });

  it("an option with no listed target scores 0 and sorts by bank order among the zeros", () => {
    const scores = new Map([["botany", 1]]);
    const ranked = rankOptions({ ...q, show: { top: 4 } }, scores, listed);
    expect(ranked.map((o) => o.key)).toEqual(["b", "a", "c", "d"]);
  });

  it("leaves a question without `show` alone", () => {
    const plain = { ...q, show: undefined };
    expect(shown(plain, new Map([["botany", 9]]), listed)).toBe(plain);
    expect(rankOptions(plain, new Map(), listed).map((o) => o.key)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("`shown` is the question with only the ranked options", () => {
    const s = shown(q, new Map([["botany", 2]]), listed);
    expect(s.options.map((o) => o.key)).toEqual(["b", "a"]);
    expect(s.id).toBe("playoff");
  });
});
