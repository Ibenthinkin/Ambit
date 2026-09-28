// Wikipedia's reading lists (docs/PLAN_writing.md Phase 2 §3) — offline. The parsers run on a real
// slice of `Wikipedia:Did you know archive/2019/March` (fixture); the network steps are asserted
// on the requests they send, through a mocked ./http, the way wikipedia.test.ts does.
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchJson = vi.hoisted(() => vi.fn());
vi.mock("./http", () => ({ fetchJson, USER_AGENT: "test-agent" }));

import {
  cleanDykHook,
  drawOrder,
  drawTitles,
  dykArchiveMonths,
  listCandidates,
  parseDykHooks,
  parseListQuery,
  parseUnusualEntries,
  unusualSubpages,
} from "./wikipedia-lists";

beforeEach(() => fetchJson.mockReset());

const DYK = readFileSync(
  path.join(__dirname, "__fixtures__", "wikipedia-dyk.wikitext"),
  "utf-8",
);

// Two rows of `Wikipedia:Unusual articles/Food` as they stand (09-28-26): the entry is the bolded
// link opening each row, sometimes behind an FA/GA icon; the description's links are context.
const UNUSUAL_FOOD = [
  '{| class="wikitable"',
  "|-",
  "| '''[[Casu martzu]]'''",
  '| Italian "[[maggot]] cheese"{{spaced ndash}}infested with [[cheese fly]] larvae.',
  "|-",
  "| {{icon|GA}} '''[[Durian]]'''",
  "| King of fruits. King of smells?",
  "|}",
].join("\n");

describe("parseUnusualEntries", () => {
  it("takes each row's bolded entry and none of the description links", () => {
    expect(parseUnusualEntries(UNUSUAL_FOOD)).toEqual([
      "Casu martzu",
      "Durian",
    ]);
  });
});

describe("drawTitles", () => {
  it("caps a title list to n, stable for a day", () => {
    const t = Array.from({ length: 50 }, (_, i) => `T${i}`);
    const a = drawTitles(t, "2026-09-28", 10);
    expect(a).toHaveLength(10);
    expect(drawTitles(t, "2026-09-28", 10)).toEqual(a);
    expect(drawTitles(t, "2026-09-29", 10)).not.toEqual(a);
  });
});

describe("parseListQuery", () => {
  it("reads the four lists and nothing else", () => {
    expect(parseListQuery("list:unusual")).toBe("unusual");
    expect(parseListQuery("list:dyk")).toBe("dyk");
    expect(parseListQuery("list:featured")).toBe("featured");
    expect(parseListQuery("list:good")).toBe("good");
    expect(parseListQuery("list:bogus")).toBeNull();
    expect(parseListQuery("history of the telescope")).toBeNull();
  });
});

describe("parseDykHooks", () => {
  const hooks = parseDykHooks(DYK);

  it("finds every hook's bolded target — its link target, not its label", () => {
    const titles = hooks.map((h) => h.title);
    expect(titles).toContain("Christine Ferber");
    expect(titles).toContain("The Marriage (video game)");
    expect(titles).toContain("Mein Kampf in English");
    expect(titles).toContain("Battle of Ronas Voe");
    // Unbolded links are context, not the hook's subject.
    expect(titles).not.toContain("Isetan");
    expect(titles).not.toContain("Hayao Miyazaki");
  });

  it("takes every bolded target in a hook, sharing the hook", () => {
    const a = hooks.find((h) => h.title === "Sumiko Hennessy");
    const b = hooks.find((h) => h.title === "Asian Pacific Development Center");
    expect(a?.hook).toBeTruthy();
    expect(b?.hook).toBe(a?.hook);
  });

  it("skips the timestamp and image lines", () => {
    expect(hooks.every((h) => !h.hook?.includes("UTC"))).toBe(true);
    expect(hooks).toHaveLength(24);
  });
});

describe("cleanDykHook", () => {
  it("turns a hook line into plain reading text", () => {
    expect(
      cleanDykHook(
        "* ... that jams made by French [[chocolatier]] '''[[Christine Ferber]]''' ''(pictured)'' are sold in Tokyo [[Isetan]] department stores?",
      ),
    ).toBe(
      "Did you know that jams made by French chocolatier Christine Ferber are sold in Tokyo Isetan department stores?",
    );
  });

  it("uses labels, drops italics and entities", () => {
    expect(
      cleanDykHook(
        "* ... that Toronto dealer '''[[Billy Jamieson]]''' found the mummy of pharaoh [[Ramesses&nbsp;I]] in the [[Niagara Falls Museum|museum]]? ",
      ),
    ).toBe(
      "Did you know that Toronto dealer Billy Jamieson found the mummy of pharaoh Ramesses I in the museum?",
    );
  });
});

// Measured on live archives by the Phase 2 review: 3–7% of hooks carry a template, and deleting
// them wholesale stored summaries like "lost due to" and "more than people".
describe("cleanDykHook — templates", () => {
  it("expands the templates hooks actually use", () => {
    expect(
      cleanDykHook(
        "* ... that '''[[Tan Jin Sing]]'''{{`s}} farm lost {{convert|11|lb|kg}} to {{Nowrap|200 million}} ants aboard {{HMS|Victory}}?",
      ),
    ).toBe(
      "Did you know that Tan Jin Sing's farm lost 11 lb to 200 million ants aboard HMS Victory?",
    );
  });

  it("gives up on a template it cannot read — the card keeps the lede instead", () => {
    expect(
      cleanDykHook(
        "* ... that '''[[X]]''' occurred in {{start date|1979|8}}, when it rained?",
      ),
    ).toBeNull();
  });

  it("drops every (… pictured …) aside, punctuation and all", () => {
    expect(
      cleanDykHook(
        "* ... that '''[[Y]]''' ''(artist's restoration pictured)'' and [[Z]] ''(pictured, left)'' met?",
      ),
    ).toBe("Did you know that Y and Z met?");
  });

  it("parseDykHooks keeps the title and drops only the unreadable hook", () => {
    const hooks = parseDykHooks(
      "* ... that '''[[X]]''' occurred in {{start date|1979|8}}, when it rained?",
    );
    expect(hooks).toEqual([{ title: "X" }]);
  });
});

describe("unusualSubpages", () => {
  it("keeps the topical subpages and drops the root and the bookkeeping ones", () => {
    expect(
      unusualSubpages([
        "Wikipedia:Unusual articles",
        "Wikipedia:Unusual articles/Death",
        "Wikipedia:Unusual articles/Phobias",
        "Wikipedia:Unusual articles/Removed",
        "Wikipedia:Unusual articles/Questions",
        "Wikipedia:Unusual articles/Categories",
        "Wikipedia:Unusual articles/Lists",
        "Wikipedia:Unusual articles/Other pages",
      ]),
    ).toEqual([
      "Wikipedia:Unusual articles/Death",
      "Wikipedia:Unusual articles/Phobias",
    ]);
  });
});

describe("dykArchiveMonths", () => {
  it("keeps only YYYY/Month archive pages", () => {
    expect(
      dykArchiveMonths([
        "Wikipedia:Did you know archive",
        "Wikipedia:Did you know archive/2004/April",
        "Wikipedia:Did you know archive/2019/March",
        "Wikipedia:Did you know archive/Header",
      ]),
    ).toEqual([
      "Wikipedia:Did you know archive/2004/April",
      "Wikipedia:Did you know archive/2019/March",
    ]);
  });
});

describe("drawOrder", () => {
  const items = Array.from({ length: 30 }, (_, i) => ({ pageid: i + 1 }));

  it("is a permutation, stable for a day, different across days", () => {
    const a = drawOrder(items, "2026-09-28");
    expect([...a].sort((x, y) => x.pageid - y.pageid)).toEqual(items);
    expect(drawOrder(items, "2026-09-28")).toEqual(a);
    expect(drawOrder(items, "2026-09-29")).not.toEqual(a);
  });
});

describe("listCandidates", () => {
  it("featured: one categorymembers call over articles only, from a day-seeded start", async () => {
    fetchJson.mockResolvedValueOnce({
      query: {
        pages: [
          { pageid: 1, ns: 0, title: "A" },
          { pageid: 2, ns: 0, title: "B" },
        ],
      },
    });
    const out = await listCandidates("featured", "2026-09-28");
    expect(fetchJson).toHaveBeenCalledTimes(1);
    const url = fetchJson.mock.calls[0]![0] as string;
    expect(url).toContain("generator=categorymembers");
    expect(url).toContain(
      `gcmtitle=${encodeURIComponent("Category:Featured articles")}`,
    );
    expect(url).toContain("gcmnamespace=0");
    expect(url).toContain("gcmtype=page");
    expect(url).toMatch(/gcmstartsortkeyprefix=[A-Z][a-z]/);
    expect(out.map((c) => c.pageid).sort()).toEqual([1, 2]);
  });

  it("unusual: the bolded entry of each row on the topical subpages, resolved to page ids", async () => {
    fetchJson
      .mockResolvedValueOnce({
        query: {
          allpages: [
            { title: "Wikipedia:Unusual articles" },
            { title: "Wikipedia:Unusual articles/Food" },
            { title: "Wikipedia:Unusual articles/Removed" },
          ],
        },
      })
      .mockResolvedValueOnce({
        query: {
          pages: [
            {
              title: "Wikipedia:Unusual articles/Food",
              revisions: [{ slots: { main: { content: UNUSUAL_FOOD } } }],
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        query: {
          pages: [
            { pageid: 10, ns: 0, title: "Casu martzu" },
            { pageid: 11, ns: 0, title: "Durian" },
            { ns: 0, title: "Red link", missing: true },
          ],
        },
      });
    const out = await listCandidates("unusual", "2026-09-28");
    const contentUrl = fetchJson.mock.calls[1]![0] as string;
    expect(contentUrl).toContain("prop=revisions");
    expect(contentUrl).toContain(
      encodeURIComponent("Wikipedia:Unusual articles/Food"),
    );
    expect(contentUrl).not.toContain("Removed");
    const resolveUrl = decodeURIComponent(
      fetchJson.mock.calls[2]![0] as string,
    );
    expect(resolveUrl).toContain("Casu martzu");
    expect(resolveUrl).toContain("Durian");
    // A link in a description is not an entry.
    expect(resolveUrl).not.toContain("cheese fly");
    expect(out.map((c) => c.title).sort()).toEqual(["Casu martzu", "Durian"]);
  });
  it("dyk: one archive month, its hooks resolved to page ids, each carrying its hook", async () => {
    fetchJson
      .mockResolvedValueOnce({
        query: {
          allpages: [{ title: "Wikipedia:Did you know archive/2019/March" }],
        },
      })
      .mockResolvedValueOnce({ parse: { wikitext: DYK } })
      .mockResolvedValue({
        query: {
          pages: [{ pageid: 99, ns: 0, title: "Christine Ferber" }],
        },
      });
    const out = await listCandidates("dyk", "2026-09-28");
    expect(fetchJson.mock.calls[1]![0]).toContain(
      encodeURIComponent("Wikipedia:Did you know archive/2019/March"),
    );
    const resolve = fetchJson.mock.calls[2]![0] as string;
    expect(resolve).toContain("redirects=1");
    const ferber = out.find((c) => c.pageid === 99);
    expect(ferber?.hook).toMatch(/^Did you know that jams/);
  });
});

// MediaWiki answers an error with HTTP 200 and `{ error: { code } }`. Read as "no candidates",
// a rate-limited night would report zero errors and look idle; it must throw instead, so
// search() fails and ingest counts it (the Phase 0.2 lesson).
describe("listCandidates — API errors are errors", () => {
  it("throws on a MediaWiki error body", async () => {
    fetchJson.mockResolvedValueOnce({
      error: { code: "ratelimited", info: "You've exceeded your rate limit." },
    });
    await expect(listCandidates("featured", "2026-09-28")).rejects.toThrow(
      /ratelimited/,
    );
  });

  it("throws when the expected result is missing and the batch did not complete", async () => {
    fetchJson.mockResolvedValueOnce({});
    await expect(listCandidates("unusual", "2026-09-28")).rejects.toThrow();
  });

  it("an empty generator result is empty, not an error (MediaWiki omits `query`)", async () => {
    fetchJson.mockResolvedValueOnce({ batchcomplete: true });
    await expect(listCandidates("featured", "2026-09-28")).resolves.toEqual([]);
  });
});
