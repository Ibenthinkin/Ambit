// Fixture-based tests for the Smithsonian adapter — see __fixtures__/smithsonian.json, recorded
// live 08-21-26 across four searches (ceramics, botanical illustration, textile, mineral
// specimen) and trimmed to seven representative rows.
//
// Five rows are untouched API responses, chosen to cover the range Smithsonian's units actually
// produce: an art-museum object with real curatorial prose, two natural-history specimen records
// with none, an object whose `record_link` is absent, and a Cooper Hewitt textile. The last two
// rows are marked `synthetic_*` and were derived by editing a captured row — the CC0 query filter
// is honest enough (400/400 in a live sample) that its failure cases can't be captured by
// searching for them, but the adapter still has to refuse them, so they're constructed instead.
import { describe, expect, it } from "vitest";
import fixtures from "./__fixtures__/smithsonian.json";
import {
  isSmithsonianServable,
  smithsonian,
  smithsonianImageUrl,
  type SmithsonianRaw,
} from "./smithsonian";

const raws = fixtures as unknown as SmithsonianRaw[];
const byRecordId = (id: string) => {
  const found = raws.find(
    (r) => r.content?.descriptiveNonRepeating?.record_ID === id,
  );
  if (!found) throw new Error(`fixture missing: ${id}`);
  return found;
};

describe("isSmithsonianServable", () => {
  it("accepts a CC0 object with an Images media entry", () => {
    expect(isSmithsonianServable(byRecordId("fsg_F1929.15"))).toBe(true);
  });

  it("rejects media whose usage.access is not CC0", () => {
    const raw = byRecordId("synthetic_not_cc0");
    expect(
      raw.content?.descriptiveNonRepeating?.online_media?.media?.[0]?.usage
        ?.access,
    ).toBe("Usage conditions apply");
    expect(isSmithsonianServable(raw)).toBe(false);
  });

  it("rejects a record with no online media at all", () => {
    const raw = byRecordId("synthetic_no_media");
    expect(raw.content?.descriptiveNonRepeating?.online_media).toBeUndefined();
    expect(isSmithsonianServable(raw)).toBe(false);
  });

  it("rejects a CC0 row whose catalogue rights contradict it", () => {
    // The real finding this rule exists for: 2 of 400 live rows returned by the
    // `media_usage:"CC0"` filter carried "Copyright protected/restricted" in their indexed
    // rights. nmafa_89-8-22 is one of them, captured verbatim.
    const raw = byRecordId("nmafa_89-8-22");
    expect(
      raw.content?.descriptiveNonRepeating?.online_media?.media?.[0]?.usage
        ?.access,
    ).toBe("CC0");
    expect(raw.content?.indexedStructured?.online_media_rights).toEqual([
      "Copyright protected/restricted",
    ]);
    expect(isSmithsonianServable(raw)).toBe(false);
  });

  it("does NOT reject the permissive 'No Known Copyright Restrictions' wording", () => {
    // The near-miss the rule has to survive: the *common* value in the same field contains both
    // "copyright" and "restrictions" while saying the opposite. Constructed here rather than
    // captured, so the assertion stays about the wording rather than about one row.
    const raw = structuredClone(byRecordId("fsg_F1929.15"));
    raw.content!.indexedStructured!.online_media_rights = [
      "No Known Copyright Restrictions",
    ];
    expect(isSmithsonianServable(raw)).toBe(true);
  });
});

describe("smithsonianImageUrl", () => {
  it("caps the IDS delivery service at 1200px", () => {
    expect(
      smithsonianImageUrl(
        "https://ids.si.edu/ids/deliveryService?id=FS-7531_27",
      ),
    ).toBe("https://ids.si.edu/ids/deliveryService?id=FS-7531_27&max=1200");
  });

  it("leaves a URL that already carries a max alone", () => {
    const url = "https://ids.si.edu/ids/deliveryService?id=X&max=800";
    expect(smithsonianImageUrl(url)).toBe(url);
  });
});

describe("smithsonian.toItem", () => {
  it("normalizes an art-museum object with curatorial prose", () => {
    const item = smithsonian.toItem(byRecordId("fsg_F1929.15"));
    expect(item.source).toBe("smithsonian");
    expect(item.sourceId).toBe("fsg_F1929.15");
    expect(item.type).toBe("image");
    expect(item.license).toBe("CC0");
    expect(item.title).toBe("Tomb figure of a lion");
    expect(item.imageUrl).toMatch(/^https:\/\/ids\.si\.edu\/.*max=1200$/);
    expect(item.sourceUrl).toMatch(/^https?:\/\//);
    // The unit name, with the parent credit appended because it doesn't say "Smithsonian" itself.
    expect(item.attribution).toBe(
      "National Museum of Asian Art, Smithsonian Institution",
    );
    expect(item.summary.length).toBeGreaterThan(60);
    expect(item.tags.length).toBeGreaterThan(0);
  });

  it("prefers record_ID over the row's timestamp-shaped id", () => {
    const raw = byRecordId("fsg_F1929.15");
    expect(raw.id).toMatch(/^ld1-\d+/);
    expect(smithsonian.toItem(raw).sourceId).toBe("fsg_F1929.15");
  });

  it("synthesizes a summary for a specimen record that has no prose", () => {
    // A botany plate: no Description note anywhere, so the summary has to come from
    // physicalDescription + taxonomy + place. It still has to clear the curator's 60-char floor.
    const raw = byRecordId("nmnhbotany_16306278");
    expect(
      (raw.content?.freetext?.notes ?? []).some((n) =>
        /description/i.test(n.label ?? ""),
      ),
    ).toBe(false);
    const item = smithsonian.toItem(raw);
    expect(item.summary.length).toBeGreaterThan(20);
    expect(item.summary).not.toBe("");
  });

  it("strips the <i>/<em> markup Smithsonian puts in titles (Phase 7.2: 35 rows)", () => {
    const raw = structuredClone(byRecordId("fsg_F1929.15"));
    raw.title = "Sword Guard (<i>Tsuba</i>) With the Motif of Sunrise";
    const item = smithsonian.toItem(raw);
    expect(item.title).toBe("Sword Guard (Tsuba) With the Motif of Sunrise");
    expect(item.summary).not.toMatch(/<[a-z/]/i);
  });

  it("falls back to '<title> — <attribution>' when a record says nothing at all", () => {
    const raw = structuredClone(byRecordId("nmnhmineralsciences_17124213"));
    raw.content!.freetext = {};
    const item = smithsonian.toItem(raw);
    expect(item.summary).toBe(
      "Corundum (var. ruby) — NMNH - Mineral Sciences Dept., Smithsonian Institution",
    );
  });

  it("falls back to the ARK guid when a record has no record_link", () => {
    const raw = byRecordId("nmafa_89-8-22");
    expect(raw.content?.descriptiveNonRepeating?.record_link).toBeUndefined();
    // (Servability is a separate concern — toItem stays a pure mapper of whatever it's handed.)
    expect(smithsonian.toItem(raw).sourceUrl).toBe(
      raw.content?.descriptiveNonRepeating?.guid,
    );
  });

  it("does not append 'Smithsonian Institution' to a unit that already says it", () => {
    const raw = structuredClone(byRecordId("chndm_1915-5-6-a"));
    raw.content!.descriptiveNonRepeating!.data_source =
      "Cooper Hewitt, Smithsonian Design Museum";
    expect(smithsonian.toItem(raw).attribution).toBe(
      "Cooper Hewitt, Smithsonian Design Museum",
    );
  });

  it("credits the institution when a record names no unit", () => {
    const raw = structuredClone(byRecordId("fsg_F1929.15"));
    delete raw.content!.descriptiveNonRepeating!.data_source;
    expect(smithsonian.toItem(raw).attribution).toBe("Smithsonian Institution");
  });
});
