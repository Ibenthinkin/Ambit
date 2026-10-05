#!/usr/bin/env bun
/**
 * Turn the First Exhibition prototype's pictures into hand picks the questionnaire can use
 * (docs/DESIGN_first-exhibition.md §8). Read-only: it writes nothing to the database.
 *
 *   bun run scripts/first-exhibition-faces.ts            # against .env's DATABASE_URL
 *   bun run scripts/first-exhibition-faces.ts --json     # the resolved list as JSON instead
 *
 * Why it's needed: the prototype was built from Ben's local image caches, so each picture is
 * known only by its **local** item id (a nanoid, different in every database). The questionnaire's
 * faces are keyed by the stable `(source, sourceId)` pair (`Option.face.pick`, and
 * services/question-faces.ts looks them up). This reads docs/first-exhibition/faces.json, finds
 * each id in the database it's pointed at, and prints, per role, the pick to paste into the bank:
 *
 *   wing:creatures:door   Spoonbill, in an old book    { source: "pdr", sourceId: "…" }
 *
 * Run it against the **local** database the caches were filled from. An id it can't find is
 * listed at the end — that picture came from a different checkout's database, or was deleted.
 */
import { readFile } from "node:fs/promises";

import { inArray } from "drizzle-orm";

import { db } from "~/server/db/client";
import { item } from "~/server/db/schema";

interface FacePicture {
  k: number;
  itemId: string;
  caption: string;
  wing: string | null;
  tags: string[];
  roles: string[];
}

const FILE = "docs/first-exhibition/faces.json";

async function main() {
  const asJson = process.argv.includes("--json");
  const { pictures } = JSON.parse(await readFile(FILE, "utf8")) as {
    pictures: FacePicture[];
  };

  const ids = pictures.map((p) => p.itemId);
  const rows = await db
    .select({
      id: item.id,
      source: item.source,
      sourceId: item.sourceId,
      title: item.title,
      score: item.curationScore,
    })
    .from(item)
    .where(inArray(item.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r]));

  const resolved = pictures.flatMap((p) => {
    const row = byId.get(p.itemId);
    return row
      ? [
          {
            ...p,
            source: row.source,
            sourceId: row.sourceId,
            title: row.title,
            score: row.score,
          },
        ]
      : [];
  });
  const missing = pictures.filter((p) => !byId.has(p.itemId));

  if (asJson) {
    console.log(JSON.stringify({ resolved, missing }, null, 2));
  } else {
    // Roles first (what the bank needs), then everything else (keep-or-pass candidates).
    const withRole = resolved.flatMap((p) =>
      p.roles.filter((r) => r !== "keep-or-pass").map((role) => ({ role, p })),
    );
    withRole.sort((a, b) => a.role.localeCompare(b.role));
    for (const { role, p } of withRole) {
      console.log(
        `${role.padEnd(28)} ${p.caption.padEnd(44)} { source: "${p.source}", sourceId: "${p.sourceId}" }  score ${p.score}`,
      );
    }
    console.log(
      `\n${resolved.length} of ${pictures.length} pictures found; ${withRole.length} role assignments.`,
    );
    if (missing.length) {
      console.log(`\nNot in this database (${missing.length}):`);
      for (const p of missing)
        console.log(`  k=${p.k}  ${p.itemId}  ${p.caption}`);
    }
  }
  process.exit(0);
}

void main();
