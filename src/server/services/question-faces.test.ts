import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Question } from "~/lib/interview/types";

const { topFacesForTopics, facePicks } = vi.hoisted(() => ({
  topFacesForTopics: vi.fn(),
  facePicks: vi.fn(),
}));
vi.mock("~/server/db/items", () => ({ topFacesForTopics, facePicks }));

import {
  FACES_TTL_MS,
  faceKey,
  getQuestionFaces,
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
