// Fixture-based tests for the archive adapter — see __fixtures__/archive.json, recorded live
// 08-21-26 against the "botanical illustration" search on the local service (:3001, limit 5).
//
// There is far less to test here than in any museum adapter, and that absence is the point: the
// archive normalizes on its own side, so this file's job is not to check synthesis logic but to
// pin the two literals toItem() invents (`attribution`, and `sourceUrl` = the image URL) plus the
// wire guarantees the projection leans on. If the archive's contract ever drifts — a summary
// under 60 chars, a license that isn't "unknown" — the contract test below is where Ambit finds
// out, rather than ingest quietly dropping rows at the structural floor.
//
// No search() test, consistent with every other adapter: I/O is not the unit-test surface.
import { describe, expect, it } from "vitest";
import fixtures from "./__fixtures__/archive.json";
import { archive, type ArchiveRaw } from "./archive";

const raws = fixtures as unknown as ArchiveRaw[];
const byId = (id: string) => {
  const found = raws.find((r) => r.id === id);
  if (!found) throw new Error(`fixture missing: ${id}`);
  return found;
};

describe("archive fixture contract", () => {
  // The three guarantees ambit-archive SPEC §8 makes, asserted over every recorded row. Ambit's
  // structural floor drops items with thin summaries; the archive prompts and enforces >= 60
  // chars precisely so that never happens to this source.
  it("holds for every recorded row: >=60-char summary, license unknown, absolute .webp image", () => {
    expect(raws).toHaveLength(5);
    for (const raw of raws) {
      expect(raw.summary.length).toBeGreaterThanOrEqual(60);
      expect(raw.license).toBe("unknown");
      expect(raw.imageUrl).toMatch(/^https?:\/\/.+\/img\/[0-9a-f]{64}\.webp$/);
      expect(Array.isArray(raw.tags)).toBe(true);
    }
  });
});

describe("archive.toItem", () => {
  it("projects every field, with attribution and license as adapter-side constants", () => {
    const item = archive.toItem(byId("NXyx9eXl6BU7Z4cKNIKW6"));
    expect(item.source).toBe("archive");
    expect(item.sourceId).toBe("NXyx9eXl6BU7Z4cKNIKW6");
    expect(item.type).toBe("image");
    expect(item.title).toBe(
      "Detailed botanical illustration of pitcher plants",
    );
    expect(item.summary).toBe(
      "A colorful botanical illustration depicts multiple pitcher plants with intricate red, " +
        "pink, orange, and green pitchers and curling vines. The composition is arranged " +
        "centrally on a cream-colored background with text printed at the top and bottom edges. " +
        "The palette features vibrant natural tones with fine detailing on the leaves and traps.",
    );
    expect(item.body).toBeNull();
    expect(item.imageUrl).toBe(
      "http://localhost:3001/img/6837cb229f5b77235e3e4e410303130fcd3e0cb69dd1a52c222228522bb73b23.webp",
    );
    expect(item.sourceUrl).toBe(
      "http://localhost:3001/img/6837cb229f5b77235e3e4e410303130fcd3e0cb69dd1a52c222228522bb73b23.webp",
    );
    // Not from the wire — the archive returns no attribution field at all. See archive.ts.
    expect(item.attribution).toBe("Personal archive");
    expect(item.license).toBe("unknown");
    expect(item.tags).toEqual([
      "botanical illustration",
      "pitcher plants",
      "lithograph",
      "scientific plate",
      "floral print",
    ]);
  });

  it("points sourceUrl at the image itself, because archive items have no landing page", () => {
    // Pinning a judgment call, not a mechanism (ambit-archive docs/SEED.md §5): "view at source"
    // has nowhere else to go until the archive grows a per-item page. If this test ever fails,
    // the question to ask is whether that page now exists — not how to make the assertion pass.
    for (const raw of raws) {
      expect(archive.toItem(raw).sourceUrl).toBe(raw.imageUrl);
    }
  });
});
