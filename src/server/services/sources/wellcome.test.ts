// Fixture-based tests for the Wellcome adapter — see __fixtures__/wellcome.json, recorded live
// 08-07-26 against the "anatomy" search. License is per-item and heterogeneous (unlike CMA's
// blanket CC0), so the fixture set covers pdm, cc-by, in-copyright, and no-thumbnail-at-all cases.
import { describe, expect, it } from "vitest";
import fixtures from "./__fixtures__/wellcome.json";
import {
  isWellcomeServable,
  wellcome,
  wellcomeImageUrl,
  type WellcomeRaw,
} from "./wellcome";

const raws = fixtures as unknown as WellcomeRaw[];
const byId = (id: string) => {
  const found = raws.find((r) => r.id === id);
  if (!found) throw new Error(`fixture missing: ${id}`);
  return found;
};

describe("isWellcomeServable", () => {
  it("accepts a work with a thumbnail under an open license (pdm)", () => {
    expect(isWellcomeServable(byId("r32p4n5s"))).toBe(true);
  });

  it("accepts cc-by as well as pdm", () => {
    expect(isWellcomeServable(byId("uk9hd5q7"))).toBe(true);
  });

  it("rejects a thumbnail whose license is in-copyright", () => {
    expect(byId("yn7vhade").thumbnail?.license?.id).toBe("inc");
    expect(isWellcomeServable(byId("yn7vhade"))).toBe(false);
  });

  it("rejects a work with no thumbnail at all", () => {
    expect(byId("a3nduy6v").thumbnail).toBeUndefined();
    expect(isWellcomeServable(byId("a3nduy6v"))).toBe(false);
  });
});

describe("wellcomeImageUrl", () => {
  it("rewrites the !200,200 thumbnail size to !800,800", () => {
    const url = wellcomeImageUrl(
      "https://iiif.wellcomecollection.org/thumbs/b22396147_0003.jp2/full/!200,200/0/default.jpg",
    );
    expect(url).toBe(
      "https://iiif.wellcomecollection.org/thumbs/b22396147_0003.jp2/full/!800,800/0/default.jpg",
    );
  });

  it("also rewrites the plain-width form (no leading !, height segment empty)", () => {
    // Real fixture example (uk9hd5q7): a live sample found this shape roughly as common as the
    // bracket form (47 of 80 across four searches, 08-07-26). Live-verified against Wellcome's
    // own IIIF server that a wider plain-width request 200s with a genuinely larger file —
    // unlike AIC, whose server 403s the equivalent — so it's safe to widen this shape too,
    // rather than leaving it stuck at whatever default width the API happened to return.
    const url = wellcomeImageUrl(
      "https://iiif.wellcomecollection.org/image/L0004482/full/300,/0/default.jpg",
    );
    expect(url).toBe(
      "https://iiif.wellcomecollection.org/image/L0004482/full/!800,800/0/default.jpg",
    );
  });

  it("is a no-op on a URL with no /full/.../ segment at all", () => {
    const url = wellcomeImageUrl(
      "https://example.com/some-other-path/image.jpg",
    );
    expect(url).toBe("https://example.com/some-other-path/image.jpg");
  });
});

describe("wellcome.toItem", () => {
  it("normalizes a work with rich metadata (contributors, production date, subjects)", () => {
    const item = wellcome.toItem(byId("r32p4n5s"));
    expect(item.source).toBe("wellcome");
    expect(item.sourceId).toBe("r32p4n5s");
    expect(item.type).toBe("image");
    expect(item.summary).toBe(
      "National Political Union; Royal College of Surgeons of England. 1832. " +
        "24 pages ; 23 cm. Books. Anatomy, education, Dissection, legislation & jurisprudence, Cadaver",
    );
    expect(item.imageUrl).toBe(
      "https://iiif.wellcomecollection.org/thumbs/b22396147_0003.jp2/full/!800,800/0/default.jpg",
    );
    expect(item.sourceUrl).toBe(
      "https://wellcomecollection.org/works/r32p4n5s",
    );
    expect(item.attribution).toBe(
      "National Political Union; Royal College of Surgeons of England. Wellcome Collection",
    );
    expect(item.license).toBe("Public Domain Mark");
    expect(item.body).toBeNull();
  });

  it("strips the <i> markup Wellcome puts in titles and notes (Phase 7.2: 3 rows)", () => {
    const raw = structuredClone(byId("r32p4n5s"));
    raw.title =
      "<i>Journal of proceedings of the Linnean Society</i>: contents";
    raw.notes = [
      {
        noteType: { label: "Description" },
        contents: ["Figure 1 from Head <i>et al</i>., <i>Science</i>, 2009."],
      },
    ];
    const item = wellcome.toItem(raw);
    expect(item.title).toBe(
      "Journal of proceedings of the Linnean Society: contents",
    );
    expect(item.summary).toContain("Head et al., Science, 2009.");
    expect(item.summary).not.toMatch(/<[a-z/]/i);
  });

  it("normalizes a sparse work (empty production/contributors/subjects/notes) without stray artifacts", () => {
    const item = wellcome.toItem(byId("uk9hd5q7"));
    expect(item.summary).toBe("Digital Images"); // only workType.label survives
    expect(item.attribution).toBe("Wellcome Collection"); // no contributors, no stray ". "
    expect(item.license).toBe("CC BY 4.0");
  });
});
