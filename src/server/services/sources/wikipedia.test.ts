// Fixture-based tests for the Wikipedia adapter — no live HTTP here (see __fixtures__/wikipedia.json,
// recorded once against the real API on 08-07-26). Covers toItem()'s normalization and the two pure
// predicates that gate what search()/toItem() are willing to keep: isLowValueTitle (search-result
// filtering) and isFreeImageLicense (the per-image license resolution decided in docs/PHASE3_PLAN.md).
import { describe, expect, it, vi } from "vitest";
import fixtures from "./__fixtures__/wikipedia.json";
import {
  fetchBody,
  isFreeImageLicense,
  isLowValueTitle,
  wikipedia,
  type WikipediaRaw,
} from "./wikipedia";

// The one place the adapter is exercised through its HTTP layer rather than a fixture: what
// matters about fetchBody is the *shape of the request it sends*, which no recorded response can
// show. Mocking ./http keeps that assertion honest and still offline.
const fetchJson = vi.hoisted(() => vi.fn());
vi.mock("./http", () => ({
  fetchJson,
  USER_AGENT: "test-agent",
}));

const raws = fixtures as unknown as WikipediaRaw[];
const byTitle = (title: string) => {
  const found = raws.find((r) => r.page.title === title);
  if (!found) throw new Error(`fixture missing: ${title}`);
  return found;
};

describe("wikipedia.toItem", () => {
  it("normalizes a free-licensed-image article into a full NormalizedItem", () => {
    const item = wikipedia.toItem(byTitle("Astronomy"));
    expect(item.source).toBe("wikipedia");
    expect(item.sourceId).toBe("50650");
    expect(item.type).toBe("article");
    expect(item.title).toBe("Astronomy");
    expect(item.summary).toContain("Astronomy is a natural science");
    expect(item.imageUrl).toBe(
      "https://upload.wikimedia.org/wikipedia/commons/0/06/Titan_in_front_of_the_ring_and_Saturn.jpg",
    );
    expect(item.sourceUrl).toBe("https://en.wikipedia.org/?curid=50650");
    expect(item.tags).toEqual(["Astronomy", "Solar System"]); // "Category:" prefix stripped
    expect(item.attribution).toBe('Wikipedia contributors, "Astronomy"');
    expect(item.license).toBe("CC BY-SA 4.0 (text); image: Public domain");
    expect(item.body).toBeNull();
  });

  it("keeps a free image under a differently-shaped license string", () => {
    const item = wikipedia.toItem(byTitle("Botany"));
    expect(item.imageUrl).not.toBeNull();
    expect(item.license).toBe("CC BY-SA 4.0 (text); image: CC BY-SA 3.0");
  });

  it("goes text-only when the page has no lead image at all", () => {
    const item = wikipedia.toItem(byTitle("Epistemology"));
    expect(item.imageUrl).toBeNull();
    expect(item.license).toBe("CC BY-SA 4.0 (text)"); // no "; image: ..." suffix
  });

  it("goes text-only when the lead image resolves to a non-free license", () => {
    const item = wikipedia.toItem(
      byTitle("Abbey Road (fictional fair-use test)"),
    );
    // `original.source` IS present on the raw page — the point of this case is that toItem()
    // must still null it out because imageLicense came back null (non-free).
    expect(item.imageUrl).toBeNull();
    expect(item.license).toBe("CC BY-SA 4.0 (text)");
  });

  it("carries the full body when one was fetched, and defaults type to article", () => {
    const item = wikipedia.toItem(byTitle("Halley's Comet"));
    expect(item.type).toBe("article");
    expect(item.body).toContain("Edmond Halley understood");
    expect(item.body?.length).toBeGreaterThan(item.summary.length);
  });
});

describe("isLowValueTitle", () => {
  it("rejects navigational/list-style titles", () => {
    expect(isLowValueTitle("List of asteroids")).toBe(true);
    expect(isLowValueTitle("Index of physics articles")).toBe(true);
    expect(isLowValueTitle("Outline of astronomy")).toBe(true);
    expect(isLowValueTitle("Timeline of the universe")).toBe(true);
    expect(isLowValueTitle("Glossary of astronomy")).toBe(true);
  });

  it("rejects disambiguation pages", () => {
    expect(isLowValueTitle("Mercury (disambiguation)")).toBe(true);
  });

  it("accepts an ordinary article title", () => {
    expect(isLowValueTitle("Astronomy")).toBe(false);
    expect(isLowValueTitle("Halley's Comet")).toBe(false);
  });
});

describe("isFreeImageLicense", () => {
  it("accepts free/open licenses", () => {
    expect(isFreeImageLicense("Public domain")).toBe(true);
    expect(isFreeImageLicense("CC0")).toBe(true);
    expect(isFreeImageLicense("CC BY 4.0")).toBe(true);
    expect(isFreeImageLicense("CC BY-SA 3.0")).toBe(true);
    expect(isFreeImageLicense("No restrictions")).toBe(true);
    expect(isFreeImageLicense("PD-US")).toBe(true);
  });

  it("rejects non-free licenses", () => {
    expect(isFreeImageLicense("Fair use")).toBe(false);
    expect(isFreeImageLicense("Copyrighted")).toBe(false);
    expect(isFreeImageLicense("Non-free use rationale")).toBe(false);
  });

  it("rejects null/undefined (unresolved license)", () => {
    expect(isFreeImageLicense(null)).toBe(false);
    expect(isFreeImageLicense(undefined)).toBe(false);
  });
});

describe("wikipedia.fetchBody", () => {
  const body = (extract: string) => ({
    query: { pages: { "50650": { extract } } },
  });

  // The whole point of 5.7's flip: `wiki` keeps `== Section ==` markers in the extract, which is
  // the only structure `parseReaderBlocks` (src/lib/reader-blocks.ts) has to work with. `plain`
  // strips them and the reader page renders one undivided slab.
  it("asks for section markers, not a flattened extract", async () => {
    fetchJson.mockResolvedValueOnce(body("== Orbit ==\nIt goes around."));

    const result = await fetchBody(50650);

    expect(result).toBe("== Orbit ==\nIt goes around.");
    const url = fetchJson.mock.calls[0]?.[0] as string;
    expect(url).toContain("exsectionformat=wiki");
    expect(url).not.toContain("exsectionformat=plain");
    expect(url).toContain("pageids=50650");
  });

  it("truncates a runaway article at 50 000 characters", async () => {
    fetchJson.mockResolvedValueOnce(body("x".repeat(60_000)));

    expect((await fetchBody(50650))?.length).toBe(50_000);
  });

  it("returns null when the page has no extract", async () => {
    fetchJson.mockResolvedValueOnce({ query: { pages: {} } });

    expect(await fetchBody(50650)).toBeNull();
  });
});
