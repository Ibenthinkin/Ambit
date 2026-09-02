// Fixture tests for the Public Domain Review walker — see __fixtures__/pdr.json: six collections
// and four essays recorded 09-02-26 from Gatsby's page-data JSON (docs/PLAN_publicdomainreview.md
// §0.7 says why each one is there), trimmed to the fields toItem reads.
//
// Pinned here: the two item shapes (a collection is an image item that also carries its body
// essay; an essay is an article when PDR licenses its text and a link card when it doesn't), the
// blurb rules, the rights policy, the license strings, attribution, and that PDR's Markdown/HTML
// dialect never reaches a reader. No walk() test — I/O is not the unit-test surface; `bun run
// probe:walk pdr` is the live check. The cache helpers ARE tested, on a temp dir, because a cache
// that silently misses would cost 1.5 GB a night.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { PDR_CARD_LICENSE, PDR_ESSAY_LICENSE } from "~/server/config/pdr";
import fixtures from "./__fixtures__/pdr.json";
import {
  bodyText,
  cachePath,
  collectionAttribution,
  collectionLicense,
  essayAttribution,
  essayIsOpen,
  imageUrlFor,
  leadParagraph,
  nextCursor,
  parseCursor,
  passesRightsPolicy,
  pdr,
  plainText,
  readCached,
  writeCached,
  type PdrRaw,
} from "./pdr";

const raws = fixtures as unknown as PdrRaw[];
const collection = (slug: string) => {
  const found = raws.find(
    (r) => r.kind === "collection" && r.collection.Slug === slug,
  );
  if (!found || found.kind !== "collection")
    throw new Error(`fixture missing: collection/${slug}`);
  return found;
};
const essay = (slug: string) => {
  const found = raws.find((r) => r.kind === "essay" && r.essay.Slug === slug);
  if (!found || found.kind !== "essay")
    throw new Error(`fixture missing: essay/${slug}`);
  return found;
};

describe("plainText", () => {
  it("strips PDR's Markdown emphasis and links, HTML tags and entities, and collapses whitespace", () => {
    expect(plainText("Karel Čapek’s *Letters from England* (1925)")).toBe(
      "Karel Čapek’s Letters from England (1925)",
    );
    expect(plainText("Behold:\n‘Abd al-Sūfī’s **Book** (ca. 1430)")).toBe(
      "Behold: ‘Abd al-Sūfī’s Book (ca. 1430)",
    );
    expect(
      plainText(
        'found in the <a href="http://x" target="_blank">Library of Congress</a>.',
      ),
    ).toBe("found in the Library of Congress.");
    expect(
      plainText("Holly Metz [reports](https://x.pdf) that &amp; more"),
    ).toBe("Holly Metz reports that & more");
    expect(
      plainText(
        "Before {image\n\tpath={/a.jpg}\n  alt={x}\n  caption={y}\nendimage} after[^1]",
      ),
    ).toBe("Before after");
  });
});

describe("bodyText", () => {
  it("keeps paragraphs apart, turns block HTML into breaks, rewrites ## headings as wiki markers", () => {
    const markup = [
      '## Panel 1: *Verflucht*</br><p class="left-pad">Sanatorium Bellevue<br/>Michaelistag, 1922</p>',
      "",
      "First <i>real</i> paragraph.[^1]",
      "",
      "{image\n  path={/a.jpg}\n  alt={x}\n  caption={A caption that must not survive.}\nendimage}",
      "",
      "<blockquote>I declare that the earth is hollow.</blockquote>",
      "",
      "### A subsection",
      "",
      "Last one.",
    ].join("\n");
    expect(bodyText(markup)).toBe(
      [
        "== Panel 1: Verflucht ==",
        "Sanatorium Bellevue",
        "Michaelistag, 1922",
        "First real paragraph.",
        "I declare that the earth is hollow.",
        "=== A subsection ===",
        "Last one.",
      ].join("\n\n"),
    );
    expect(bodyText("")).toBe("");
  });
});

describe("leadParagraph", () => {
  it("returns the first paragraph of at least 60 plain characters, lede-cut at 400", () => {
    const preamble = collection("presidents-and-turkeys").collection.Preamble!;
    const lead = leadParagraph(preamble);
    expect(lead).toMatch(
      /^The pictures below are from the National Thanksgiving Turkey Presentation/,
    );
    expect(lead!.length).toBeLessThanOrEqual(400);
  });
  it("is undefined when no paragraph reaches the floor", () => {
    expect(leadParagraph("Happy Thanksgiving!\n\nShort.")).toBeUndefined();
    expect(leadParagraph("")).toBeUndefined();
  });
});

describe("rights, attribution, license", () => {
  it("keeps PD, Unclear, null and Attribution copies; drops a Non-commercial one", () => {
    expect(
      passesRightsPolicy(collection("atlantic-city-sand-sculpture").collection),
    ).toBe(true);
    expect(passesRightsPolicy(collection("marnameh").collection)).toBe(true);
    expect(
      passesRightsPolicy(collection("presidents-and-turkeys").collection),
    ).toBe(true);
    expect(passesRightsPolicy(collection("fixed-stars").collection)).toBe(
      false,
    );
  });
  it("credits a collection's umbrella institution, deduped, and PDR only when none is named", () => {
    expect(
      collectionAttribution(
        collection("atlantic-city-sand-sculpture").collection,
      ),
    ).toBe("Library of Congress");
    expect(collectionAttribution(collection("marnameh").collection)).toBe(
      "Public Library of India · Internet Archive",
    );
    expect(
      collectionAttribution({
        ...collection("marnameh").collection,
        Sources: null,
      }),
    ).toBe("The Public Domain Review");
  });
  it("states both regimes on a collection: the work's PD profile and PDR's CC BY-SA text", () => {
    expect(
      collectionLicense(collection("atlantic-city-sand-sculpture").collection),
    ).toBe(
      "Public domain — PD Worldwide · text CC BY-SA 4.0 (The Public Domain Review)",
    );
    expect(
      collectionLicense({
        ...collection("marnameh").collection,
        Rights_Profiles: null,
      }),
    ).toBe("Public domain · text CC BY-SA 4.0 (The Public Domain Review)");
  });
  it("opens an essay only on an explicit CC-BY-SA label, and credits its authors", () => {
    expect(essayIsOpen(essay("stories-of-a-hollow-earth").essay)).toBe(true);
    expect(essayIsOpen(essay("ars-notoria").essay)).toBe(false); // "Custom License"
    expect(essayIsOpen(essay("sharing-photographs").essay)).toBe(false); // null
    expect(essayAttribution(essay("sharing-photographs").essay)).toBe(
      "Dr. Antje Schmidt, Dr. Esther Ruelfs",
    );
    expect(
      essayAttribution({ ...essay("ars-notoria").essay, Contributors: null }),
    ).toBe("The Public Domain Review");
  });
});

describe("imageUrlFor", () => {
  it("resolves against the host and encodes only what needs encoding", () => {
    const host = "https://pdr-assets.b-cdn.net";
    expect(imageUrlFor(host, "/collections/a/sand-sculptor-thumb.jpg")).toBe(
      "https://pdr-assets.b-cdn.net/collections/a/sand-sculptor-thumb.jpg",
    );
    expect(
      imageUrlFor(
        host,
        "/collections/a/postcard of a snowman%2C 1918-thumb.jpg",
      ),
    ).toBe(
      "https://pdr-assets.b-cdn.net/collections/a/postcard%20of%20a%20snowman%2C%201918-thumb.jpg",
    );
    expect(imageUrlFor(host, "/collections/a/Fool's_Cap.jpg")).toBe(
      "https://pdr-assets.b-cdn.net/collections/a/Fool's_Cap.jpg",
    );
    expect(imageUrlFor(host, null)).toBeNull();
  });
});

describe("cursors", () => {
  it("parses <phase>:<offset>, starting at the collections phase", () => {
    expect(parseCursor(undefined)).toEqual({ phase: 0, offset: 0 });
    expect(parseCursor("c:50")).toEqual({ phase: 0, offset: 50 });
    expect(parseCursor("e:0")).toEqual({ phase: 1, offset: 0 });
    expect(parseCursor("k:20")).toEqual({ phase: 3, offset: 20 });
    expect(() => parseCursor("z:0")).toThrow(/pdr: bad cursor/);
    expect(() => parseCursor("c:-1")).toThrow(/pdr: bad cursor/);
    expect(() => parseCursor("50")).toThrow(/pdr: bad cursor/);
  });
  it("advances within a phase, rolls into the next phase at its end, ends after the last", () => {
    expect(nextCursor(0, 0, 50, 1255)).toBe("c:50");
    expect(nextCursor(0, 1250, 5, 1255)).toBe("e:0");
    expect(nextCursor(0, 0, 0, 0)).toBe("e:0"); // an empty index still moves on
    expect(nextCursor(2, 0, 21, 21)).toBe("k:0");
    expect(nextCursor(3, 0, 29, 29)).toBeUndefined();
  });
});

describe("record cache", () => {
  let dir: string;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("round-trips a record by kind, misses on absence, and treats a torn file as a miss", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "pdr-cache-"));
    const raw = collection("marnameh");
    expect(await readCached(dir, "collection", "marnameh")).toBeNull();
    await writeCached(dir, "collection", "marnameh", raw);
    expect(await readCached(dir, "collection", "marnameh")).toEqual(raw);
    expect(await readCached(dir, "essay", "marnameh")).toBeNull(); // kinds never collide
    await writeFile(cachePath(dir, "collection", "torn"), "{not json");
    expect(await readCached(dir, "collection", "torn")).toBeNull();
  });

  it("refuses a slug that could escape the directory", () => {
    expect(() => cachePath("/tmp/x", "essay", "../etc/passwd")).toThrow(
      /pdr: unsafe slug/,
    );
    expect(() => cachePath("/tmp/x", "essay", "a/b")).toThrow(
      /pdr: unsafe slug/,
    );
    expect(() => cachePath("/tmp/x", "essay", "")).toThrow(/pdr: unsafe slug/);
    // The one real non-ASCII slug in the index is fine — it is a name, not a path.
    expect(
      cachePath("/tmp/x", "collection", "russian-lubki-18th–19th-century"),
    ).toBe("/tmp/x/collection/russian-lubki-18th–19th-century.json");
  });
});

describe("pdr.toItem — collections", () => {
  it("maps a collection to an image item carrying its body essay, institution credit", () => {
    const item = pdr.toItem(collection("atlantic-city-sand-sculpture"));
    expect(item.source).toBe("pdr");
    expect(item.sourceId).toBe("collection/atlantic-city-sand-sculpture");
    expect(item.type).toBe("image");
    expect(item.title).toBe(
      "Photographs of Atlantic City Sand Sculpture (ca. 1880–1920)",
    );
    expect(item.summary).toBe(
      "Photographs from when Atlantic City beaches featured artists ornately sculpting sand.",
    );
    // The Preamble, as plain paragraphs — this is what the item page renders under the picture.
    expect(item.body).toMatch(
      /^New Jersey’s Atlantic City emerged as a booming Edwardian seaside destination/,
    );
    expect(item.body!.split("\n\n").length).toBeGreaterThanOrEqual(3);
    expect(item.imageUrl).toBe(
      "https://pdr-assets.b-cdn.net/collections/atlantic-city-sand-sculpture/sand-sculptor-thumb.jpg",
    );
    expect(item.sourceUrl).toBe(
      "https://publicdomainreview.org/collection/atlantic-city-sand-sculpture/",
    );
    expect(item.attribution).toBe("Library of Congress");
    expect(item.license).toBe(
      "Public domain — PD Worldwide · text CC BY-SA 4.0 (The Public Domain Review)",
    );
    expect(item.tags).toEqual(
      expect.arrayContaining([
        "images",
        "music & arts",
        "photography",
        "20th century",
        "sand",
      ]),
    );
    expect(new Set(item.tags).size).toBe(item.tags.length);
    for (const t of item.tags) expect(t).toBe(t.trim().toLowerCase());
  });

  it("strips Markdown emphasis from a title", () => {
    expect(pdr.toItem(collection("marnameh")).title).toBe(
      "“The Persian Mâr-Nâmeh or, The Book for Taking Omens from Snakes” (1892)",
    );
  });

  it("falls back to the Preamble's first substantial paragraph when the Excerpt is empty", () => {
    const item = pdr.toItem(collection("presidents-and-turkeys"));
    expect(item.summary).toMatch(
      /^The pictures below are from the National Thanksgiving/,
    );
    expect(item.summary.length).toBeGreaterThanOrEqual(60);
  });

  it("throws on a collection with no featured image, naming it", () => {
    expect(() => pdr.toItem(collection("hands-1944"))).toThrow(
      /pdr: collection "hands-1944" has no featured image/,
    );
  });
});

describe("pdr.toItem — essays", () => {
  it("maps a CC-BY-SA essay to an article with the essay as body, authors as attribution", () => {
    const item = pdr.toItem(essay("stories-of-a-hollow-earth"));
    expect(item.type).toBe("article");
    expect(item.sourceId).toBe("essay/stories-of-a-hollow-earth");
    expect(item.title).toBe("Stories of a Hollow Earth");
    expect(item.summary).toMatch(
      /^In 1741 the Norwegian-Danish author Ludvig Holberg published Klimii Iter Subterraneum,/,
    );
    expect(item.body).toMatch(
      /^In 1818 John Cleves Symmes, Jr, issued his “Circular Number 1,”/,
    );
    // The <blockquote> became its own paragraph.
    expect(item.body).toMatch(
      /\n\nI declare that the earth is hollow and habitable within/,
    );
    expect(item.imageUrl).toBe(
      "https://pdr-assets.b-cdn.net/essays/stories-of-a-hollow-earth/nielsklimsjourne00holb_0139-540.jpg",
    );
    expect(item.sourceUrl).toBe(
      "https://publicdomainreview.org/essay/stories-of-a-hollow-earth/",
    );
    expect(item.attribution).toBe("Peter Fitting");
    expect(item.license).toBe(PDR_ESSAY_LICENSE);
    expect(item.tags).toEqual(
      expect.arrayContaining(["books", "literature", "hollow earth"]),
    );
  });

  it("rewrites a Markdown heading as a wiki marker and tags a series piece with its series", () => {
    const item = pdr.toItem(essay("warburgs-werewolf-an-anamnesis"));
    expect(item.type).toBe("article");
    expect(item.body).toMatch(
      /^== Panel 1: Verflucht ==\n\nSanatorium Bellevue, Kreuzlingen, Switzerland\n\nMichaelistag, 1922\n\n/,
    );
    expect(item.tags).toContain("conjectures");
    expect(item.attribution).toBe("Kevin Dann");
  });

  it("makes a link card of a Custom License essay: image item, Intro as blurb, no body", () => {
    const item = pdr.toItem(essay("ars-notoria"));
    expect(item.type).toBe("image");
    expect(item.body).toBeNull();
    expect(item.title).toBe(
      "Artificial Intelligence: Ars Notoria and the Promise of Instant Knowledge",
    );
    expect(item.summary).toMatch(
      /^Centuries before Neo instantly mastered Kung Fu in The Matrix, medieval scholars/,
    );
    expect(item.attribution).toBe("Anne Lawrence-Mathers");
    expect(item.license).toBe(PDR_CARD_LICENSE);
  });

  it("treats an unlabelled essay as a link card too", () => {
    const item = pdr.toItem(essay("sharing-photographs"));
    expect(item.type).toBe("image");
    expect(item.body).toBeNull();
    expect(item.license).toBe(PDR_CARD_LICENSE);
    expect(item.tags).toEqual(
      expect.arrayContaining(["photography", "curator’s choice"]),
    );
  });
});

describe("pdr.toItem — safety, every fixture row", () => {
  it("never lets HTML or Markdown through in title, summary or body", () => {
    for (const raw of raws) {
      let item;
      try {
        item = pdr.toItem(raw);
      } catch {
        continue; // hands-1944
      }
      for (const field of [item.title, item.summary, item.body ?? ""]) {
        expect(field).not.toMatch(/<[^>]+>|&[#a-z0-9]+;|\]\(|\{image|\[\^/i);
      }
      expect(item.body ?? "").not.toMatch(/\*[^*\n]+\*/);
    }
  });
});
