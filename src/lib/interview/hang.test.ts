import { describe, expect, it } from "vitest";

import { QUESTIONS } from "./bank";
import { EITHER, SKIP } from "./config";
import { faceKey, type QuestionFaces } from "./faces";
import { hangFrom, heroesFor } from "./hang";
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
    options: ["k1", "k2", "k3", "k4"].map((key) => ({
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
            writing: {
              title: "T",
              dek: "",
              minutes: 5,
              kind: o.face.writing.kind,
              topicIds: [],
            },
          }
        : { itemId: key, src: `/img/${key}` };
    }
  return faces;
}
const FACES = facesFor(BANK);
const ids = (hang: { itemId: string }[]) => hang.map((p) => p.itemId);

describe("hangFrom", () => {
  it("hangs the last picks first, newest first, then the keeps in the order kept", () => {
    const hang = hangFrom({
      bank: BANK,
      faces: FACES,
      answers: [
        { questionId: "door", keys: ["space"] },
        { questionId: "pair", keys: ["b"] },
        { questionId: "keep", keys: ["k3", "k1"] },
      ],
    });
    expect(ids(hang)).toEqual(["pair/b", "door/space", "keep/k3"]);
    expect(hang[0]).toEqual({
      key: "pair/b",
      itemId: "pair/b",
      src: "/img/pair/b",
      label: "Painting",
    });
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

  it("fills from the heroes when the answers hold fewer than three, and only then", () => {
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
          answers: [{ questionId: "pair", keys: ["a"] }],
        }),
      ),
    ).toEqual(["pair/a", "door/growing", "door/space"]);
    expect(
      ids(
        hangFrom({
          bank: BANK,
          faces: FACES,
          heroes,
          answers: [{ questionId: "keep", keys: ["k1", "k2", "k3", "k4"] }],
        }),
      ),
    ).toEqual(["keep/k1", "keep/k2", "keep/k3"]);
  });

  it("never hangs one picture twice, and leaves out a card whose picture is missing", () => {
    const faces: QuestionFaces = {
      ...FACES,
      // The pair's picture is the door's (a thin corpus), and one keep has no picture at all.
      "pair/a": { itemId: "door/space", src: "/img/door/space" },
      "keep/k1": { itemId: "keep/k1" },
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
    ).toEqual(["door/space", "keep/k2"]);
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
