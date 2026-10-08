import { describe, expect, it } from "vitest";

import {
  buildTaste,
  chosenDestinations,
  parseStoredTaste,
  profileTaste,
  withKnownItems,
  tasteSchema,
  type TasteV1,
} from "./taste";

const listed = new Set(["astronomy", "moon", "botany", "eerie", "photography"]);

describe("buildTaste", () => {
  it("assembles the stored shape from the scores, destinations and opened cards", () => {
    const taste = buildTaste({
      scores: new Map([
        ["astronomy", 2],
        ["eerie", 1],
        ["photography", 0.5],
      ]),
      listed,
      destinations: chosenDestinations([
        { questionId: "destinations", keys: ["kyoto", "iceland"] },
      ]),
      opened: [
        { itemId: "i1", title: "On rain", kind: "essay", minutes: 14 },
        { itemId: "i2", title: "A tide table", kind: "archive", minutes: 4 },
      ],
      hang: ["p1", "p2", "p3"],
    });
    expect(taste.v).toBe(2);
    expect(taste.hang).toEqual(["p1", "p2", "p3"]);
    expect(taste.title).toEqual({ adjective: "Nocturnal", noun: "Orbits" });
    expect(taste.wings[0]).toBe("space");
    expect(taste.mediums).toEqual(["photography"]);
    expect(taste.compass).not.toBeNull();
    expect(taste.compass!.old).toBeCloseTo((0.8 + 0.1) / 2);
    // Kyoto's and Iceland's direct aesthetic weights (×1.5) outweigh astronomy's topic weights:
    // aesthetic 0.25 + 1.5 × (1 + 0.6) = 2.65 against thrilling 1.6 and dark 1.45.
    expect(taste.temperament.aesthetic).toBe(1);
    expect(taste.temperament.thrilling).toBeCloseTo(1.6 / 2.65);
    expect(taste.opened).toHaveLength(2);
    expect(taste.readingMinutes).toBe(9);
    expect(tasteSchema.safeParse(taste).success).toBe(true);
  });
  it("has a null compass and null reading minutes when nothing was chosen or opened", () => {
    const taste = buildTaste({
      scores: new Map(),
      listed,
      destinations: [],
      opened: [],
      hang: [],
    });
    expect(taste.compass).toBeNull();
    expect(taste.hang).toEqual([]);
    expect(taste.readingMinutes).toBeNull();
    expect(taste.opened).toEqual([]);
    expect(tasteSchema.safeParse(taste).success).toBe(true);
  });
});

describe("chosenDestinations", () => {
  it("reads the destinations answer's keys, ignoring unknown keys and a skip", () => {
    expect(
      chosenDestinations([
        { questionId: "destinations", keys: ["kyoto", "nowhere"] },
      ]).map((d) => d.id),
    ).toEqual(["kyoto"]);
    expect(
      chosenDestinations([{ questionId: "destinations", keys: ["skip"] }]),
    ).toEqual([]);
    expect(chosenDestinations([])).toEqual([]);
  });
});

describe("tasteSchema", () => {
  it("rejects an unknown wing, a temperament value over 1 and more than two opened cards", () => {
    const ok = buildTaste({
      scores: new Map(),
      listed,
      destinations: [],
      opened: [],
      hang: [],
    });
    expect(
      tasteSchema.safeParse({ ...ok, wings: ["not-a-wing"] }).success,
    ).toBe(false);
    expect(
      tasteSchema.safeParse({
        ...ok,
        temperament: { ...ok.temperament, dark: 1.5 },
      }).success,
    ).toBe(false);
    const card = { itemId: "x", title: "t", kind: "essay", minutes: 3 };
    expect(
      tasteSchema.safeParse({ ...ok, opened: [card, card, card] }).success,
    ).toBe(false);
  });

  it("rejects a v2 taste with no hang, more than six, an empty id or a repeated one", () => {
    const ok = buildTaste({
      scores: new Map(),
      listed,
      destinations: [],
      opened: [],
      hang: ["p1", "p2"],
    });
    expect(tasteSchema.safeParse(ok).success).toBe(true);
    expect(tasteSchema.safeParse({ ...ok, hang: undefined }).success).toBe(
      false,
    );
    expect(
      tasteSchema.safeParse({
        ...ok,
        hang: ["1", "2", "3", "4", "5", "6", "7"],
      }).success,
    ).toBe(false);
    expect(tasteSchema.safeParse({ ...ok, hang: [""] }).success).toBe(false);
    expect(tasteSchema.safeParse({ ...ok, hang: ["p1", "p1"] }).success).toBe(
      false,
    );
    expect(tasteSchema.safeParse({ ...ok, v: 3 }).success).toBe(false);
  });

  // Review focus 1: a row stored before taste v2 — `v: 1`, no `hang` — still parses, as a v1.
  it("parses a stored v1 row, hang and all absent", () => {
    const parsed = tasteSchema.safeParse(V1_ROW);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.v).toBe(1);
    expect(parsed.data && "hang" in parsed.data).toBe(false);
  });
});

/** A taste exactly as a bank-v2 run stored it (10-05-26 → Phase 6). */
const V1_ROW: TasteV1 = {
  v: 1,
  title: { adjective: "Quiet", noun: "Weathers" },
  wings: ["land", "growing"],
  mediums: ["photography"],
  temperament: {
    communal: 0.2,
    aesthetic: 1,
    dark: 0,
    thrilling: 0.1,
    cerebral: 0.5,
  },
  compass: { wild: 0.6, old: 0.2, still: 0.4, far: 0.1 },
  opened: [{ itemId: "i1", title: "On rain", kind: "essay", minutes: 14 }],
  readingMinutes: 14,
};

describe("profileTaste", () => {
  const card = (id: string) => ({ itemId: id, src: `/img/${id}`, title: id });
  const cards = new Map(["p1", "p2", "p3"].map((id) => [id, card(id)]));

  // Review focus 1 again, from the reading side: /profile/topics gets a shape it can render.
  it("reads a v1 row as having no hang, never throwing", () => {
    const view = profileTaste(V1_ROW, cards);
    expect(view.hang).toEqual([]);
    expect(view.v).toBe(1);
    expect(view.title).toEqual(V1_ROW.title);
    expect(view.opened).toEqual(V1_ROW.opened);
  });

  it("resolves a v2 hang in its stored order, dropping a picture that is gone", () => {
    const v2 = { ...V1_ROW, v: 2 as const, hang: ["p3", "gone", "p1"] };
    expect(profileTaste(v2, cards).hang).toEqual([card("p3"), card("p1")]);
  });

  it("shows no hang when fewer than two of its pictures are left", () => {
    const v2 = { ...V1_ROW, v: 2 as const, hang: ["p1", "gone"] };
    expect(profileTaste(v2, cards).hang).toEqual([]);
  });

  it("tolerates a malformed hang in the stored jsonb rather than throwing", () => {
    const bad = { ...V1_ROW, v: 2, hang: "p1" } as unknown as TasteV1;
    expect(profileTaste(bad, cards).hang).toEqual([]);
  });
});

// The read side of "what is stored is what the reveal showed": a row is validated when written,
// so one that no longer parses is corruption or a schema change — and the profile shows no
// exhibition rather than handing ExhibitionCard a shape it would throw on (redesign ledger 6.2).
describe("parseStoredTaste", () => {
  it("returns a stored v1 or v2 row as is", () => {
    expect(parseStoredTaste(V1_ROW)).toEqual(V1_ROW);
    const v2 = { ...V1_ROW, v: 2, hang: ["p1", "p2"] };
    expect(parseStoredTaste(v2)).toEqual(v2);
  });

  it("returns null for an unknown version or a shape the schema refuses", () => {
    expect(parseStoredTaste({ ...V1_ROW, v: 3 })).toBeNull();
    expect(parseStoredTaste({ v: 2 })).toBeNull();
    expect(parseStoredTaste("not even an object")).toBeNull();
    expect(parseStoredTaste(null)).toBeNull();
  });
});

describe("withKnownItems", () => {
  const two = [
    { itemId: "i1", title: "On rain", kind: "essay" as const, minutes: 14 },
    {
      itemId: "i2",
      title: "A tide table",
      kind: "archive" as const,
      minutes: 4,
    },
  ];
  const v2 = {
    ...V1_ROW,
    v: 2 as const,
    opened: two,
    readingMinutes: 9,
    hang: ["p1", "p2", "p3"],
  };

  it("keeps a taste whose items all exist exactly as it was", () => {
    const known = {
      items: new Set(["i1", "i2", "p1", "p2", "p3"]),
      pictures: new Set(["p1", "p2", "p3"]),
    };
    expect(withKnownItems(v2, known)).toEqual(v2);
  });

  it("drops a gone opened card and recomputes the reading minutes", () => {
    const out = withKnownItems(v2, {
      items: new Set(["i2", "p1", "p2", "p3"]),
      pictures: new Set(["p1", "p2", "p3"]),
    });
    expect(out.opened.map((o) => o.itemId)).toEqual(["i2"]);
    expect(out.readingMinutes).toBe(4);
    const none = withKnownItems(v2, {
      items: new Set(),
      pictures: new Set(["p1", "p2", "p3"]),
    });
    expect(none.opened).toEqual([]);
    expect(none.readingMinutes).toBeNull();
  });

  it("drops a hung id that is gone or not a picture, in order, and empties a hang left under two", () => {
    expect(
      withKnownItems(v2, { items: new Set(), pictures: new Set(["p1", "p3"]) }),
    ).toMatchObject({ hang: ["p1", "p3"] });
    expect(
      withKnownItems(v2, { items: new Set(), pictures: new Set(["p2"]) }),
    ).toMatchObject({ hang: [] });
  });

  it("leaves a v1 a v1, with no hang", () => {
    const out = withKnownItems(V1_ROW, {
      items: new Set(),
      pictures: new Set(),
    });
    expect(out.v).toBe(1);
    expect("hang" in out).toBe(false);
    expect(out.opened).toEqual([]);
  });
});
