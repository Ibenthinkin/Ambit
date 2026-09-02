// The Public Domain Review as a corpus-walk source (sources round 2, 09-02-26;
// docs/HANDOFF_publicdomainreview.md is the probe, docs/PLAN_publicdomainreview.md the design).
// The third walker family after WordPress REST (wp-rest.ts) and Tumblr (things-organized-neatly.ts):
// ONE-SHOT INDEXES plus PER-RECORD HYDRATION, over two kinds of record.
//
// **The API that isn't one.** publicdomainreview.org is a static Gatsby build. Gatsby writes, for
// every route `/foo/`, a sibling `/page-data/foo/page-data.json` holding exactly the props the page
// was rendered with — so the site's own build output is a structured JSON API nobody has to
// maintain. Four listing pages hand over the whole archive in four requests (1,255 collections;
// 343 essays; the Conjectures and Curator's Choice series, 21 + 29, which the essays listing does
// not include); every record's own page-data carries its full text and rights fields — inside a
// 0.5–1.2 MB envelope, because Gatsby also embeds the site's whole index and institution list in
// each one.
//
// **Hence the cache.** Hydrating everything is ~1.7 GB from Netlify's CDN; doing that nightly
// would be a real bandwidth bill on a non-profit. So each hydrated record (the 8–30 KB we need, not
// the envelope) is written to `.cache/pdr/<kind>/<slug>.json` the first time and read from disk
// forever after — the same cache-aside shape as the curator's `.cache/curation` (and, in
// production, the same persistent `/app/.cache` volume). A nightly walk is then four index fetches
// plus detail fetches for the handful of new pieces. There is no revalidation: the indexes carry
// no modified date, and Netlify's ETags change on every detail whenever *anything* is published
// (the embedded index changes), so conditional GETs would not help. `rm -rf .cache/pdr` is the
// refresh, and it costs one polite fifteen-minute walk.
//
// **What one item is — two kinds, one source.**
//   - A COLLECTION → one `image` item, whatever its Medium (Ben's decision: Images, Books, Film,
//     Audio, Animated GIF, Class of..., Mixed — the featured image is a poster or cover for the
//     non-image media). PDR's one-sentence Excerpt is the blurb (the Preamble's first substantial
//     paragraph stands in when the Excerpt is empty or thin), and the Preamble itself — PDR's own
//     text, CC BY-SA 4.0 — is stored as `body` and rendered on the item page UNDER the picture
//     (components/item/image-item-body.tsx). The item stays an image item so it keeps its place
//     in the gallery and the wander rail. A collection whose digital copy an institution marks
//     Non-commercial is dropped in walk() by passesRightsPolicy() (~5%, all Bibliothèque nationale
//     de France in the planning sample).
//   - An ESSAY → an `article` item whose `body` is the essay when PDR labels it `CC-BY-SA` (28 of
//     32 sampled), else a LINK CARD — an `image` item with the Intro as blurb and no body — the
//     same posture as a designated blog, because a book excerpt's text is not ours to reproduce.
//     Footnotes, bibliography and the inline image blocks (with their captions) are dropped: the
//     link-out reaches all of it.
//
// **Etiquette.** robots.txt (absent — 404, Ben's decision) is checked at the start of every walk;
// requests are 500 ms apart and sequential; a 401/403 ends the walk on the first response.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { PDR, PDR_CARD_LICENSE, PDR_ESSAY_LICENSE } from "~/server/config/pdr";
import { fetchJson } from "./http";
import { htmlToText, toLede, uniqueTags } from "./normalize";
import { assertCrawlAllowed } from "./robots";
import type {
  CorpusWalkAdapter,
  FetchOpts,
  NormalizedItem,
  WalkPage,
} from "./types";

/** Records hydrated per walk() page. 50 detail fetches at 500 ms is ~25 s a page, uncached. */
const PAGE_SIZE = 50;
const DELAY_MS = 500;
/** structuralFloor's thin-summary line (curator.ts): an Excerpt shorter than this would floor,
 *  so toItem reaches for the Preamble instead. */
const EXCERPT_MIN = 60;
/** How much of a Preamble paragraph becomes a blurb. */
const LEAD_MAX = 400;
/** Where hydrated records live. Relative to the process's cwd like the curator's cache — the
 *  project root in dev, `/app` (the persistent volume) in production. */
export const PDR_CACHE_DIR = path.join(process.cwd(), ".cache", "pdr");

// ── the wire shapes, as much of them as toItem reads ─────────────────────────────────────────

export type PdrKind = "collection" | "essay";

/** One institution named on a collection, with PDR's rights taxonomy for it. */
export interface PdrSourceData {
  Title: string | null;
  Umbrella_Title: string[] | null;
  Rights_Summary: string | null;
  Rights_Details_Group: string | null;
  Rights_License_URL: string | null;
  Rights_Prose: string | null;
}

/** `result.data.collection.data` from a collection's detail page — Airtable-style field names,
 *  kept as-is so the cache on disk and the fixture are the same shape as the wire. */
export interface PdrCollection {
  Title: string;
  Slug: string;
  Excerpt: string | null;
  Preamble: string | null;
  Featured_Image_Path: string | null;
  Medium: string | null;
  Theme: string[] | null;
  Style: string[] | null;
  Epoch: string[] | null;
  Sources: { data: PdrSourceData }[] | null;
  Rights_Profiles: { data: { Group: string; Label: string } }[] | null;
  Tags: { data: { Label: string } }[] | null;
  Published_Date: string | null;
}

/** `result.data.essay.data` from an essay's detail page. */
export interface PdrEssay {
  Title: string;
  Slug: string;
  Intro: string | null;
  Body: string | null;
  /** "CC-BY-SA" | "Custom License" | null — the only value that opens the text is the first. */
  Publication_Rights: string | null;
  License_Note: string | null;
  Featured_Image_Path: string | null;
  Categories: string[] | null;
  Series: string | null;
  Tags: { data: { Label: string } }[] | null;
  Contributors: { data: { Name: string | null; Slug: string | null } }[] | null;
  Published_Date: string | null;
}

/**
 * What walk() returns and the cache stores: the record plus the image host it resolves against,
 * so toItem() is a pure projection with nothing left to look up. A DISCRIMINATED UNION: `kind`
 * is the tag, and narrowing on it (`if (raw.kind === "essay") raw.essay…`) is how TypeScript lets
 * one adapter carry two record shapes without casts.
 */
export type PdrRaw =
  | { kind: "collection"; imageHost: string; collection: PdrCollection }
  | { kind: "essay"; imageHost: string; essay: PdrEssay };

/** The walk's phases, in order. Each is one listing page whose rows carry a Slug, and the kind
 *  of detail page those slugs hydrate from. The essays listing does not include the two series,
 *  so they are phases of their own. */
const PHASES = [
  {
    key: "c",
    kind: "collection",
    url: "/page-data/collections/page-data.json",
    list: "collections",
  },
  {
    key: "e",
    kind: "essay",
    url: "/page-data/essays/page-data.json",
    list: "allAirtable",
  },
  {
    key: "x",
    kind: "essay",
    url: "/page-data/series/conjectures/page-data.json",
    list: "essays",
  },
  {
    key: "k",
    kind: "essay",
    url: "/page-data/series/curators-choice/page-data.json",
    list: "essays",
  },
] as const;

type PdrIndexPage = {
  result: {
    data: Record<string, { edges: { node: { data: { Slug: string } } }[] }>;
  };
};

interface PdrDetailPage {
  result: {
    data: {
      site: { siteMetadata: { imageHost: string | null } };
      collection?: { data: PdrCollection };
      essay?: { data: PdrEssay };
    };
  };
}

// ── pure helpers (the unit-test surface) ─────────────────────────────────────────────────────

/**
 * Pure: PDR's text as one line of plain text. PDR writes a house dialect — Markdown emphasis and
 * links, `{image … endimage}` embed tokens, footnote markers — *and* inline HTML, sometimes in the
 * same sentence. The Markdown goes first (a link's text survives, its URL does not; an emphasis
 * pair drops its stars), then htmlToText() does what it does for every adapter: tags out,
 * entities decoded, whitespace collapsed. Order matters: htmlToText would leave the stars.
 */
export function plainText(s: string): string {
  return htmlToText(
    s
      .replace(/\{image[\s\S]*?endimage\}/g, " ")
      .replace(/\[\^[^\]]+\]/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      // `*x*` or `**x**` → `x`. The backreference (\1) makes the closing marker match the opening
      // one, so a lone asterisk in prose is left alone.
      .replace(/(\*{1,2})(\S(?:[^*\n]*?\S)?)\1/g, "$2"),
  );
}

/**
 * Pure: a body (Preamble or essay) as plain paragraphs separated by blank lines — the shape
 * src/lib/reader-blocks.ts already typesets. Three moves, in this order:
 *   1. block-level HTML (`<p>`, `<blockquote>`, `<br>`) becomes a paragraph break, so a quotation
 *      stands on its own and a `<p>` glued to a heading line is pried off it;
 *   2. a Markdown `## Heading` becomes the reader parser's `== Heading ==` (deeper levels `===`),
 *      which is the only heading form the app stores;
 *   3. every paragraph goes through plainText() — which also removes the image blocks, since
 *      their captions describe pictures the reader view cannot show.
 * Returns "" for an empty body, so callers can store null without a special case.
 */
export function bodyText(markup: string): string {
  return markup
    .replace(/\{image[\s\S]*?endimage\}/g, "\n\n")
    .replace(/<\/?blockquote\b[^>]*>|<\/?p\b[^>]*>|<br\s*\/?>|<\/br>/gi, "\n\n")
    .split(/\n\s*\n/)
    .map((p) => {
      const heading = /^\s*(#{1,6})\s+(.+?)\s*#*\s*$/.exec(p);
      if (heading) {
        const [, hashes = "", text = ""] = heading;
        const marks = hashes.length <= 2 ? "==" : "===";
        return `${marks} ${plainText(text)} ${marks}`;
      }
      return plainText(p);
    })
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Pure: the first paragraph of a Preamble that is at least `min` plain characters, cut to a lede.
 * "Happy Thanksgiving!" is a real first paragraph on one collection; the second one is the blurb.
 */
export function leadParagraph(
  preamble: string,
  min = EXCERPT_MIN,
): string | undefined {
  const paragraph = bodyText(preamble)
    .split("\n\n")
    .find((p) => !p.startsWith("==") && p.length >= min);
  return paragraph ? toLede(paragraph, LEAD_MAX) : undefined;
}

/**
 * Pure: the rights policy for collections. The underlying work is public domain on every PDR
 * collection (that is the site's premise, and its Rights_Profiles say so per collection); what
 * varies is the DIGITAL COPY, which an institution may mark Non-commercial. Ambit's bar is public
 * domain or openly licensed, so those are excluded. "Unclear" (an aggregator that does not mark
 * its copies) and a null summary are kept — PDR has already judged the work PD, and that is the
 * judgment Ambit is borrowing.
 */
export function passesRightsPolicy(c: PdrCollection): boolean {
  return !(c.Sources ?? []).some(
    (s) =>
      s.data.Rights_Summary === "Non-commercial" ||
      s.data.Rights_Details_Group === "Non-Commercial",
  );
}

/** Pure: the holding institution(s) — the umbrella name where PDR records one ("Library of
 *  Congress" over "Library of Congress (Prints+Photos+Maps)"), deduped, ` · `-joined — or PDR's
 *  own name when a collection lists no source, in which case the credit line already says it
 *  and image-item-body.tsx suppresses the duplicate maker line. */
export function collectionAttribution(c: PdrCollection): string {
  const names = uniqueTags(
    (c.Sources ?? []).map((s) => s.data.Umbrella_Title?.[0] ?? s.data.Title),
  );
  return names.length ? names.join(" · ") : PDR.label;
}

/** Pure: one honest string for two regimes — the work's PD profile (PDR's own label for it:
 *  "PD Worldwide", "PD U.S.", "PD GOV", "PD 70 Years") and PDR's CC BY-SA 4.0 grant on the text. */
export function collectionLicense(c: PdrCollection): string {
  const underlying = (c.Rights_Profiles ?? [])
    .map((p) => p.data)
    .find((p) => p.Group === "Underlying Work")?.Label;
  const work = underlying ? `Public domain — ${underlying}` : "Public domain";
  return `${work} · text CC BY-SA 4.0 (${PDR.label})`;
}

/** Pure: is this essay's text ours to store? Only an explicit CC-BY-SA label says yes; "Custom
 *  License" (book excerpts, reprints — PDR's reusing-material page) and a missing label both
 *  mean a link card. */
export function essayIsOpen(e: PdrEssay): boolean {
  return e.Publication_Rights === "CC-BY-SA";
}

/** Pure: the essay's author(s), as PDR names them, or PDR itself when none is recorded. */
export function essayAttribution(e: PdrEssay): string {
  const names = uniqueTags((e.Contributors ?? []).map((c) => c.data.Name));
  return names.length ? names.join(", ") : PDR.label;
}

/**
 * Pure: the image URL. `new URL(path, base)` is the encoder: it percent-encodes what a URL
 * cannot carry (spaces) and leaves alone what it can (apostrophes, and escapes that are already
 * there — 21 of PDR's 1,253 collection paths arrive pre-encoded, and encodeURI would double
 * them). All three shapes were fetched from the CDN on 09-02-26 and returned image/jpeg.
 */
export function imageUrlFor(host: string, p: string | null): string | null {
  return p ? new URL(p, host).href : null;
}

/** Pure: a cursor is `<phase key>:<offset into that phase's index>`; absent means the start. */
export function parseCursor(cursor?: string): {
  phase: number;
  offset: number;
} {
  if (cursor === undefined) return { phase: 0, offset: 0 };
  const m = /^([a-z]):(\d+)$/.exec(cursor);
  const phase = m ? PHASES.findIndex((p) => p.key === m[1]) : -1;
  const offset = m ? Number(m[2]) : NaN;
  if (phase < 0 || !Number.isInteger(offset) || offset < 0) {
    throw new Error(`pdr: bad cursor "${cursor}"`);
  }
  return { phase, offset };
}

/** Pure: the cursor after a page that started at `offset` in `phase` and took `taken` of its
 *  `total` rows: the next offset while the phase has more; the next phase's start when it is
 *  spent (an empty index moves on the same way); undefined after the last phase. */
export function nextCursor(
  phase: number,
  offset: number,
  taken: number,
  total: number,
): string | undefined {
  const next = offset + taken;
  if (taken > 0 && next < total) return `${PHASES[phase]!.key}:${next}`;
  const following = PHASES[phase + 1];
  return following ? `${following.key}:0` : undefined;
}
