import { describe, expect, it } from "vitest";

import { QUESTIONS } from "./bank";
import { EITHER, SKIP } from "./config";
import { faceKey, type QuestionFaces } from "./faces";
import { HANG_MIN, HANG_SIZE, hangFrom, heroesFor } from "./hang";
import type { Question } from "./types";

const face = (topic: string) => ({ topic });
const BANK: Question[] = [
  {
    id: "door",
    kind: "choice",
    prompt: "",
    options: [
      { key: "space", label: "Space", face: face("astronomy"), effects: [] },
      { key: "growing", label: "Growing", face: face("botany"), effects: [] },
      { key: "words", label: "No picture", effects: [] },
    ],
  },
  {
    id: "pair",
    kind: "pair",
    prompt: "",
    options: [
      { key: "a", label: "Photograph", face: face("birds"), effects: [] },
      { key: "b", label: "Painting", face: face("birds"), effects: [] },
    ],
  },
  {
    id: "keep",
    kind: "multi",
    prompt: "",
    options: ["k1", "k2", "k3", "k4", "k5", "k6", "k7"].map((key) => ({
      key,
      label: key.toUpperCase(),
      face: face("abstract"),
      effects: [],
    })),
  },
  {
    id: "read",
    kind: "choice",
    prompt: "",
    options: [
      {
        key: "essay",
        label: "Essay",
        always: true,
        face: { topic: "literature", writing: { kind: "essay", nth: 0 } },
        effects: [],
      },
    ],
  },
];

/** A picture for every pictured card, its item id the face key itself. */
function facesFor(bank: readonly Question[]): QuestionFaces {
  const faces: QuestionFaces = {};
  for (const q of bank)
    for (const o of q.options) {
      if (!o.face) continue;
      const key = faceKey(q.id, o.key);
      faces[key] = o.face.writing
        ? {
            itemId: key,
            src: `/img/${key}`,
            title: `Item ${key}`,
            writing: {
              title: "T",
              dek: "",
              minutes: 5,
              kind: o.face.writing.kind,
              topicIds: [],
            },
          }
        : { itemId: key, src: `/img/${key}`, title: `Item ${key}` };
    }
  return faces;
}
const FACES = facesFor(BANK);
const ids = (hang: { itemId: string }[]) => hang.map((p) => p.itemId);

describe("hangFrom", () => {
  it("hangs six at most, two at least", () => {
    expect(HANG_SIZE).toBe(6);
    expect(HANG_MIN).toBe(2);
  });

  it("hangs the keeps first, in the order kept, then the picks newest first", () => {
    const hang = hangFrom({
      bank: BANK,
      faces: FACES,
      answers: [
        { questionId: "door", keys: ["space"] },
        { questionId: "pair", keys: ["b"] },
        { questionId: "keep", keys: ["k3", "k1"] },
      ],
    });
    expect(ids(hang)).toEqual(["keep/k3", "keep/k1", "pair/b", "door/space"]);
    // The caption is the item's own title; the option's label is the alt.
    expect(hang[2]).toEqual({
      key: "pair/b",
      itemId: "pair/b",
      src: "/img/pair/b",
      title: "Item pair/b",
      label: "Painting",
    });
  });

  it("stops at six, keeps before picks", () => {
    const hang = hangFrom({
      bank: BANK,
      faces: FACES,
      answers: [
        { questionId: "door", keys: ["space"] },
        {
          questionId: "keep",
          keys: ["k1", "k2", "k3", "k4", "k5", "k6", "k7"],
        },
      ],
    });
    expect(ids(hang)).toEqual([
      "keep/k1",
      "keep/k2",
      "keep/k3",
      "keep/k4",
      "keep/k5",
      "keep/k6",
    ]);
  });

  it("counts no picture for a skip, an Either, a text option or an article card", () => {
    const hang = hangFrom({
      bank: BANK,
      faces: FACES,
      answers: [
        { questionId: "door", keys: ["words"] },
        { questionId: "pair", keys: [EITHER] },
        { questionId: "keep", keys: [SKIP] },
        { questionId: "read", keys: ["essay"] },
      ],
    });
    expect(hang).toEqual([]);
  });

  it("fills from the doors when the answers hold fewer than six, and only then", () => {
    const heroes = heroesFor(BANK, ["growing", "space", "nowhere"]);
    expect(heroes).toEqual([
      { questionId: "door", optionKey: "growing" },
      { questionId: "door", optionKey: "space" },
    ]);
    expect(
      ids(
        hangFrom({
          bank: BANK,
          faces: FACES,
          heroes,
          answers: [
            { questionId: "pair", keys: ["a"] },
            { questionId: "keep", keys: ["k2"] },
          ],
        }),
      ),
    ).toEqual(["keep/k2", "pair/a", "door/growing", "door/space"]);
    expect(
      ids(
        hangFrom({
          bank: BANK,
          faces: FACES,
          heroes,
          answers: [
            { questionId: "keep", keys: ["k1", "k2", "k3", "k4", "k5", "k6"] },
          ],
        }),
      ),
    ).toEqual([
      "keep/k1",
      "keep/k2",
      "keep/k3",
      "keep/k4",
      "keep/k5",
      "keep/k6",
    ]);
  });

  it("hangs nothing rather than one picture alone", () => {
    expect(
      hangFrom({
        bank: BANK,
        faces: FACES,
        answers: [{ questionId: "keep", keys: ["k1"] }],
      }),
    ).toEqual([]);
  });

  it("never hangs one picture twice, and leaves out a card whose picture is missing", () => {
    const faces: QuestionFaces = {
      ...FACES,
      // The pair's picture is the door's (a thin corpus), and one keep has no picture at all.
      "pair/a": { itemId: "door/space", src: "/img/door/space", title: "T" },
      "keep/k1": { itemId: "keep/k1", title: "T" },
    };
    expect(
      ids(
        hangFrom({
          bank: BANK,
          faces,
          answers: [
            { questionId: "door", keys: ["space"] },
            { questionId: "pair", keys: ["a"] },
            { questionId: "keep", keys: ["k1", "k2"] },
          ],
        }),
      ),
    ).toEqual(["keep/k2", "door/space"]);
  });

  it("finds a door for each of the real bank's wings", () => {
    const heroes = heroesFor(QUESTIONS, ["space", "growing", "stage"]);
    expect(heroes.map((h) => h.questionId)).toEqual([
      "wings-1",
      "wings-2",
      "wings-3",
    ]);
  });
});
