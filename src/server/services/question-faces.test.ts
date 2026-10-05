import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Question } from "~/lib/interview/types";

const { topFacesForTopics, facePicks, topWritingForKinds } = vi.hoisted(() => ({
  topFacesForTopics: vi.fn(),
  facePicks: vi.fn(),
  topWritingForKinds: vi.fn(),
}));
vi.mock("~/server/db/items", () => ({
  topFacesForTopics,
  facePicks,
  topWritingForKinds,
}));

import {
  FACES_TTL_MS,
  faceKey,
  getQuestionFaces,
  pickWriting,
  resetQuestionFacesForTests,
} from "./question-faces";

const pair = (
  id: string,
  a: Question["options"][number]["face"],
  b: Question["options"][number]["face"],
): Question => ({
  id,
  kind: "pair",
  prompt: "?",
  options: [
    { key: "a", label: "A", effects: [], face: a },
    { key: "b", label: "B", effects: [], face: b },
  ],
});

const BANK: Question[] = [
  { id: "words", kind: "text", prompt: "?", options: [] },
  pair("one", { topic: "astronomy" }, { topic: "botany" }),
];

const row = (
  topicId: string,
  id: string,
  imageUrl = `https://m.test/${id}.jpg`,
) => ({
  topicId,
  id,
  imageUrl,
});

beforeEach(() => {
  vi.useFakeTimers();
  resetQuestionFacesForTests();
  topFacesForTopics
    .mockReset()
    .mockResolvedValue([
      row("astronomy", "a1"),
      row("astronomy", "a2"),
      row("botany", "b1"),
    ]);
  facePicks.mockReset().mockResolvedValue([]);
  topWritingForKinds.mockReset().mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

describe("getQuestionFaces", () => {
  it("gives each picture answer the top image of its face topic, as a proxied 960 rendition", async () => {
    const faces = await getQuestionFaces(BANK);
    expect(faces[faceKey("one", "a")]).toEqual({
      itemId: "a1",
      src: "/api/img/a1?w=960",
    });
    expect(faces[faceKey("one", "b")]).toEqual({
      itemId: "b1",
      src: "/api/img/b1?w=960",
    });
    expect(topFacesForTopics).toHaveBeenCalledWith(["astronomy", "botany"], 2);
  });

  it("passes a data: URL through untouched — the e2e corpus has nothing to proxy", async () => {
    topFacesForTopics.mockResolvedValue([
      row("astronomy", "a1", "data:image/png;base64,AAAA"),
    ]);
    const faces = await getQuestionFaces(BANK);
    expect(faces[faceKey("one", "a")]!.src).toBe("data:image/png;base64,AAAA");
  });

  it("leaves out an answer whose topic has no picture — the card falls back to text", async () => {
    topFacesForTopics.mockResolvedValue([row("astronomy", "a1")]);
    const faces = await getQuestionFaces(BANK);
    expect(faceKey("one", "b") in faces).toBe(false);
  });

  it("never shows one picture twice: a shared top image goes to the first answer, the next takes its second", async () => {
    // One item is the best picture in both topics.
    topFacesForTopics.mockResolvedValue([
      row("astronomy", "shared"),
      row("botany", "shared"),
      row("botany", "b2"),
    ]);
    const faces = await getQuestionFaces(BANK);
    expect(faces[faceKey("one", "a")]!.itemId).toBe("shared");
    expect(faces[faceKey("one", "b")]!.itemId).toBe("b2");
  });

  it("prefers a hand pick, and falls back to the topic when the pick is not in this database", async () => {
    const bank = [
      pair(
        "one",
        { topic: "astronomy", pick: { source: "met", sourceId: "123" } },
        { topic: "botany", pick: { source: "aic", sourceId: "gone" } },
      ),
    ];
    facePicks.mockResolvedValue([
      {
        source: "met",
        sourceId: "123",
        id: "picked",
        imageUrl: "https://m.test/p.jpg",
      },
    ]);
    const faces = await getQuestionFaces(bank);
    expect(facePicks).toHaveBeenCalledWith([
      { source: "met", sourceId: "123" },
      { source: "aic", sourceId: "gone" },
    ]);
    expect(faces[faceKey("one", "a")]!.itemId).toBe("picked");
    expect(faces[faceKey("one", "b")]!.itemId).toBe("b1");
  });

  it("memoises for ten minutes", async () => {
    await getQuestionFaces(BANK);
    await getQuestionFaces(BANK);
    expect(topFacesForTopics).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(FACES_TTL_MS + 1);
    await getQuestionFaces(BANK);
    expect(topFacesForTopics).toHaveBeenCalledTimes(2);
  });

  it("never memoises an empty result", async () => {
    topFacesForTopics.mockResolvedValue([]);
    expect(await getQuestionFaces(BANK)).toEqual({});
    await getQuestionFaces(BANK);
    expect(topFacesForTopics).toHaveBeenCalledTimes(2);
  });

  it("answers with no faces, not an error, when the query fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    topFacesForTopics.mockRejectedValue(new Error("db down"));
    expect(await getQuestionFaces(BANK)).toEqual({});
  });
});

describe("writing faces", () => {
  const cand = (
    id: string,
    kind: "essay" | "archive",
    minutes: number,
    imageUrl: string | null = null,
  ) => ({
    kind,
    id,
    imageUrl,
    title: `T ${id}`,
    summary: `First line of ${id}.\nSecond.`,
    readingMinutes: minutes,
    topicIds: ["literature", "books"],
  });

  it("pickWriting prefers a short piece for nth 0 and a long one for nth 1, never the same item twice", () => {
    const cs = [
      cand("a", "essay", 15),
      cand("b", "essay", 5),
      cand("c", "essay", 20),
    ];
    const used = new Set<string>();
    const first = pickWriting(cs, "essay", 0, used)!;
    expect(first.id).toBe("b");
    used.add(first.id);
    const second = pickWriting(cs, "essay", 1, used)!;
    expect(second.id).toBe("a"); // best-scored long one (candidates arrive score-ordered)
    used.add(second.id);
    expect(
      pickWriting([cand("a", "essay", 15)], "essay", 0, used),
    ).toBeUndefined();
  });

  it("falls back to the best unused candidate when none fits the length", () => {
    expect(
      pickWriting([cand("a", "essay", 9)], "essay", 0, new Set())!.id,
    ).toBe("a");
    expect(
      pickWriting([cand("a", "essay", 9)], "essay", 1, new Set())!.id,
    ).toBe("a");
  });

  it("a writing face carries the card copy, minutes, kind and memberships; src only when there is a picture", async () => {
    topFacesForTopics.mockResolvedValue([]);
    facePicks.mockResolvedValue([]);
    topWritingForKinds.mockResolvedValue([
      cand("e1", "essay", 4, "https://m.test/e1.jpg"),
      cand("r1", "archive", 3),
    ]);
    const bank: Question[] = [
      {
        id: "read-1",
        kind: "choice",
        prompt: "?",
        options: [
          {
            key: "essay",
            label: "Essay",
            always: true,
            effects: [],
            face: { topic: "literature", writing: { kind: "essay", nth: 0 } },
          },
          {
            key: "archive",
            label: "Archive",
            always: true,
            effects: [],
            face: { topic: "literature", writing: { kind: "archive", nth: 0 } },
          },
        ],
      },
    ];
    const faces = await getQuestionFaces(bank);
    expect(faces[faceKey("read-1", "essay")]).toEqual({
      itemId: "e1",
      src: "/api/img/e1?w=960",
      writing: {
        title: "T e1",
        dek: "First line of e1.",
        minutes: 4,
        kind: "essay",
        topicIds: ["literature", "books"],
      },
    });
    expect(faces[faceKey("read-1", "archive")]!.src).toBeUndefined();
    expect(faces[faceKey("read-1", "archive")]!.writing?.kind).toBe("archive");
  });

  it("a kind with no candidate is simply absent — the card renders as text", async () => {
    topFacesForTopics.mockResolvedValue([]);
    facePicks.mockResolvedValue([]);
    topWritingForKinds.mockResolvedValue([]);
    const faces = await getQuestionFaces([
      {
        id: "read-1",
        kind: "choice",
        prompt: "?",
        options: [
          {
            key: "essay",
            label: "Essay",
            always: true,
            effects: [],
            face: { topic: "literature", writing: { kind: "essay", nth: 0 } },
          },
        ],
      },
    ]);
    expect(faces).toEqual({});
  });
});
