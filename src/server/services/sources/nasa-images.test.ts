// Fixture-based tests for the NASA Image & Video Library adapter — see __fixtures__/nasa-images.json,
// recorded live 08-21-26 across six searches (nebula, rocket, earth observation, aurora, volcano,
// aircraft) and trimmed to five real rows plus two synthetics.
//
// The real rows were chosen to cover the rendition ladder's live coverage gaps: PIA14417 has a
// `~medium`, PIA04216 does not (that combination is 486 vs 600 across the survey). The other three
// cover the credit fields — `secondary_creator` present, `photographer` instead, and neither — and
// the markup that has to be cleaned out of `description`.
import { describe, expect, it } from "vitest";
import fixtures from "./__fixtures__/nasa-images.json";
import {
  isNasaServable,
  nasaAttribution,
  nasaImageUrl,
  nasaImages,
  type NasaRaw,
} from "./nasa-images";

const raws = fixtures as unknown as NasaRaw[];
const byId = (id: string) => {
  const found = raws.find((r) => r.data?.[0]?.nasa_id === id);
  if (!found) throw new Error(`fixture missing: ${id}`);
  return found;
};

describe("nasaImageUrl", () => {
  it("prefers the ~medium rendition when one exists", () => {
    expect(nasaImageUrl(byId("PIA14417"))).toBe(
      "https://images-assets.nasa.gov/image/PIA14417/PIA14417~medium.jpg",
    );
  });

  it("falls down the ladder when ~medium is absent", () => {
    // 114 of 600 sampled items have no ~medium; ~small (640px) is the next best real rendition,
    // and it is chosen over ~orig even though ~orig is bigger — bigger is not better for a feed.
    const raw = byId("PIA04216");
    expect(raw.links?.some((l) => l.href?.includes("~medium."))).toBe(false);
    expect(nasaImageUrl(raw)).toBe(
      "https://images-assets.nasa.gov/image/PIA04216/PIA04216~small.jpg",
    );
  });

  it("returns null when an item carries no links at all", () => {
    expect(nasaImageUrl(byId("synthetic_no_links"))).toBeNull();
  });
});

describe("isNasaServable", () => {
  it("accepts a normal image item", () => {
    expect(isNasaServable(byId("PIA14417"))).toBe(true);
  });

  it("rejects an item with no usable image link", () => {
    expect(isNasaServable(byId("synthetic_no_links"))).toBe(false);
  });
});

describe("nasaAttribution", () => {
  it("passes NASA's own credit line through untouched", () => {
    expect(nasaAttribution(byId("PIA14417"))).toBe(
      "NASA/JPL-Caltech/Harvard-Smithsonian CfA",
    );
  });

  it("uses the photographer field when there is no secondary_creator", () => {
    const raw = byId("carina_nebula");
    expect(raw.data?.[0]?.secondary_creator).toBeUndefined();
    expect(nasaAttribution(raw)).toBe("NASA ESA CSA STScI");
  });

  it("falls back to the originating center", () => {
    const raw = byId("iss058e005282");
    expect(raw.data?.[0]?.secondary_creator).toBeUndefined();
    expect(raw.data?.[0]?.photographer).toBeUndefined();
    expect(nasaAttribution(raw)).toBe(`NASA / ${raw.data![0]!.center}`);
  });

  it("prefixes a credit that doesn't already name the agency", () => {
    // The survey's two outliers ("2MASS", a person's name) are the case this covers: NASA's
    // library credits them without saying NASA, and an unprefixed attribution would read as if
    // the image came from nowhere.
    const raw = structuredClone(byId("PIA14417"));
    raw.data![0]!.secondary_creator = "2MASS";
    expect(nasaAttribution(raw)).toBe("NASA / 2MASS");
  });
});

describe("nasaImages.toItem", () => {
  it("normalizes a standard image item", () => {
    const item = nasaImages.toItem(byId("PIA14417"));
    expect(item.source).toBe("nasa-images");
    expect(item.sourceId).toBe("PIA14417");
    expect(item.type).toBe("image");
    expect(item.body).toBeNull();
    expect(item.sourceUrl).toBe("https://images.nasa.gov/details/PIA14417");
    expect(item.license).toBe("Public domain (NASA)");
    expect(item.summary).toMatch(/Dumbbell nebula/);
    expect(item.tags).toContain("JPL");
  });

  it("strips markup and decodes entities out of the description", () => {
    const raw = byId("GSFC_20171208_Archive_e001465");
    const description = raw.data![0]!.description!;
    expect(description).toMatch(/&quot;/);
    const item = nasaImages.toItem(raw);
    expect(item.summary).not.toMatch(/&quot;|&amp;/);
    expect(item.summary).not.toMatch(/<[a-z/]/i);
  });

  it("keeps markup out of the title, and out of a summary synthesized from it (Phase 7.2: 1 row)", () => {
    const raw = structuredClone(byId("synthetic_no_description"));
    raw.data![0]!.title = "Hubble views <i>Messier 51</i>";
    const item = nasaImages.toItem(raw);
    expect(item.title).toBe("Hubble views Messier 51");
    expect(item.summary).not.toMatch(/<[a-z/]/i);
  });

  it("synthesizes a summary when the description is empty", () => {
    const item = nasaImages.toItem(byId("synthetic_no_description"));
    expect(item.summary.length).toBeGreaterThan(20);
    expect(item.summary).toMatch(/Weighing in on the Dumbbell Nebula/);
  });

  it("tolerates an item with no keywords", () => {
    const raw = byId("iss058e005282");
    expect(raw.data?.[0]?.keywords).toBeUndefined();
    // Still tagged with the originating center — never an empty-for-no-reason tag list.
    expect(nasaImages.toItem(raw).tags).toEqual([raw.data![0]!.center]);
  });
});
