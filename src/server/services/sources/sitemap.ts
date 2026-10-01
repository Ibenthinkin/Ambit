// The sitemap walker factory (publications round 2, 10-01-26): one `CorpusWalkAdapter` per
// publication whose archive is reachable only through its sitemap — Aeon and Psyche, whose feeds
// carry the newest twenty pieces and a dek, and nothing more. **The contract is unchanged**: the
// cursor is an offset into the sitemap's article list, newest first, and a walk page is the next
// PAGE_SIZE of those pieces, each fetched as the page a reader would open.
//
// **What the page gives** (verified 10-01-26 on both sites, same publisher, same build): an
// `Article` JSON-LD block (headline, description, image, datePublished), a `BreadcrumbList`
// whose middle names are the piece's section and theme, the display title in the one `<h1>`, and
// the piece's text as `<p>`s inside `<main>`. A page whose JSON-LD has no `Article` is not
// writing (a video) and is a thrown error, counted per item by ingest.
//
// **What a piece's item is** — exactly `rss.ts`'s: a link card of writing (docs/DESIGN_writing.md
// D6). The publication's own dek is the summary, the text is `curationText` (scored, never
// stored), `body` is null.
//
// **Rights** (Ben's verdict, 10-01-26): both robots.txt files name ClaudeBot, GPTBot, CCBot and
// others with `Disallow: /`. Ambit's fetcher is none of those — it is a link-card reader that
// sends people *to* the piece — and the `*` group allows every article path. `assertCrawlAllowed`
// still runs at the start of every walk, so a site that later shuts `*` out stops the walk.
//
// **Etiquette**, as wp-rest.ts and rss.ts: robots.txt at the start of a walk, 500 ms between
// requests, a 401/403 ends the walk on the first response.
import { fetchTextResponse, HttpRefusedError } from "./http";
import { decodeEntities, htmlToText, toLede, uniqueTags } from "./normalize";
import { DEK_MAX_CHARS } from "./rss";
import { assertCrawlAllowed } from "./robots";
import type {
  CorpusWalkAdapter,
  FetchOpts,
  NormalizedItem,
  SourceId,
  WalkPage,
} from "./types";

const DELAY_MS = 500;
/** Pieces per walk page: each is one request, so a page is ~10 s of polite fetching. */
export const PAGE_SIZE = 20;
/** A `<p>` shorter than this inside `<main>` is a byline, a credit or a promo, not the piece. */
const PARAGRAPH_MIN_CHARS = 60;

/** What the walker needs from a publication's config. */
export interface SitemapSource {
  id: SourceId;
  label: string;
  /** Origin only. Every piece's `sourceUrl` is on this host. */
  baseUrl: string;
  license: string;
  sitemapUrl: string;
  /** The first path segments that are writing (`essays`, `ideas`, …). Everything else in the
   *  sitemap — videos, section and theme hubs — is never fetched. */
  sections: readonly string[];
}

/** One `<url>` of a sitemap. */
export interface SitemapEntry {
  loc: string;
  lastmod?: string;
  /** `<image:loc>`: the piece's lead picture, a fallback for a page that names none. */
  image?: string;
}

/** What `walk` hands `toItem`: the page as read, or why it could not be. */
export type SitemapRaw =
  | ({ url: string; sitemapImage?: string } & ArticlePage)
  | { url: string; error: string };

export interface ArticlePage {
  /** False for a page whose JSON-LD has no `Article` (a video page under an article path). */
  isArticle: boolean;
  title: string;
  dek: string;
  imageUrl?: string;
  /** The piece's text, paragraphs joined — the curator's, never stored. */
  text: string;
  /** The breadcrumbs' section and theme names, lowercased (`essays`, `illness and disease`). */
  tags: string[];
}

// ── parsing (pure) ──────────────────────────────────────────────────────────────────────────

function tagText(block: string, tag: string): string | undefined {
  const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i").exec(block);
  return m ? decodeEntities(m[1]!.trim()) : undefined;
}

/** Every `<url>` in a sitemap `<urlset>`. */
export function parseSitemap(xml: string): SitemapEntry[] {
  return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/gi)].flatMap(([, block]) => {
    const loc = tagText(block!, "loc");
    if (!loc) return [];
    const lastmod = tagText(block!, "lastmod");
    const image = tagText(block!, "image:loc");
    return [
      { loc, ...(lastmod ? { lastmod } : {}), ...(image ? { image } : {}) },
    ];
  });
}

/**
 * The pieces worth fetching, newest first: on the publication's host, under one of its writing
 * sections, and a piece rather than the section's own index (`/essays/<slug>`, never `/essays`).
 * Ties and undated entries keep sitemap order, so the list — and so the cursor — is stable
 * between two runs over the same sitemap.
 */
export function selectArticles(
  entries: SitemapEntry[],
  src: Pick<SitemapSource, "baseUrl" | "sections">,
): SitemapEntry[] {
  const host = new URL(src.baseUrl).host;
  const seen = new Set<string>();
  return entries
    .filter((e) => {
      let url: URL;
      try {
        url = new URL(e.loc);
      } catch {
        return false;
      }
      const parts = url.pathname.split("/").filter(Boolean);
      if (url.host !== host || parts.length !== 2) return false;
      if (!src.sections.includes(parts[0]!)) return false;
      if (seen.has(url.pathname)) return false;
      seen.add(url.pathname);
      return true;
    })
    .map((e, i) => ({ e, i }))
    .sort(
      (a, b) =>
        (b.e.lastmod ?? "").localeCompare(a.e.lastmod ?? "") || a.i - b.i,
    )
    .map(({ e }) => e);
}

function metaContent(html: string, key: string): string | undefined {
  const m = new RegExp(
    `<meta[^>]+(?:property|name)="${key}"[^>]+content="([^"]*)"`,
    "i",
  ).exec(html);
  return m ? decodeEntities(m[1]!) : undefined;
}

type JsonLd = Record<string, unknown>;

function jsonLdBlocks(html: string): JsonLd[] {
  return [
    ...html.matchAll(
      /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ].flatMap(([, body]) => {
    try {
      const parsed = JSON.parse(body!) as unknown;
      const list = Array.isArray(parsed) ? parsed : [parsed];
      return list.flatMap((o) =>
        o && typeof o === "object"
          ? (((o as JsonLd)["@graph"] as JsonLd[] | undefined) ?? [o as JsonLd])
          : [],
      );
    } catch {
      return [];
    }
  });
}

function imageOf(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return imageOf(value[0]);
  if (value && typeof value === "object") return imageOf((value as JsonLd).url);
  return undefined;
}

/** `Title | Aeon Essays` → `Title`: og:title's site suffix, for a page with no h1 or headline. */
function withoutSiteSuffix(title: string): string {
  return title.replace(/\s+\|\s+[^|]+$/, "");
}

/** An empty string is as absent as undefined here — an empty <h1> must fall through. */
function firstNonEmpty(...values: (string | undefined)[]): string {
  return values.find((v) => v !== undefined && v.trim() !== "") ?? "";
}

function stringOr(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Pure: everything a card and the curator need from one article page. */
export function parseArticlePage(html: string): ArticlePage {
  const blocks = jsonLdBlocks(html);
  const article = blocks.find((b) => b["@type"] === "Article");
  const h1 = /<h1(?:\s[^>]*)?>([\s\S]*?)<\/h1>/i.exec(html);
  const title = firstNonEmpty(
    h1 ? htmlToText(h1[1]!) : undefined,
    stringOr(article?.headline),
    withoutSiteSuffix(metaContent(html, "og:title") ?? ""),
  );
  const dek = firstNonEmpty(
    stringOr(article?.description),
    metaContent(html, "og:description"),
  );
  const imageUrl = imageOf(article?.image) ?? metaContent(html, "og:image");

  // Each breadcrumb trail ends in the piece itself; what comes before it is section and theme.
  const tags = blocks
    .filter((b) => b["@type"] === "BreadcrumbList")
    .flatMap((b) => {
      const names = ((b.itemListElement as JsonLd[] | undefined) ?? [])
        .map((i) => i.name)
        .filter((n): n is string => typeof n === "string");
      return names.slice(0, -1);
    })
    .map((n) => htmlToText(n).toLowerCase());

  const main = /<main[\s\S]*?<\/main>/i.exec(html)?.[0] ?? "";
  const text = [...main.matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/gi)]
    .map((m) => htmlToText(m[1]!))
    .filter((p) => p.length >= PARAGRAPH_MIN_CHARS)
    .join("\n\n");

  return {
    isArticle: article !== undefined,
    title: htmlToText(title),
    dek: toLede(htmlToText(dek), DEK_MAX_CHARS),
    ...(imageUrl ? { imageUrl } : {}),
    text,
    tags: uniqueTags(tags),
  };
}

/** Pure: the cursor after a page that started at `offset` and read `count` of `total` pieces. */
export function nextOffset(
  offset: number,
  count: number,
  total: number,
): string | undefined {
  return offset + count < total ? String(offset + count) : undefined;
}

// ── the walker ──────────────────────────────────────────────────────────────────────────────

export function sitemapWalker(
  src: SitemapSource,
): CorpusWalkAdapter<SitemapRaw> {
  const host = new URL(src.baseUrl).host;
  // The article list, read once per process: a walk's pages must all index the same list, and
  // the sitemap is one ~1 MB request that a 180-page walk need not repeat.
  let articles: SitemapEntry[] | undefined;

  async function walk(
    cursor?: string,
    opts?: FetchOpts,
  ): Promise<WalkPage<SitemapRaw>> {
    const offset = cursor === undefined ? 0 : Number(cursor);
    if (!Number.isInteger(offset) || offset < 0) {
      throw new Error(`${src.id}: bad cursor "${cursor}"`);
    }
    if (offset === 0 || !articles) await assertCrawlAllowed(src.baseUrl);
    if (!articles) {
      const { text } = await fetchTextResponse(src.sitemapUrl, {
        delayMs: DELAY_MS,
        noRetryOn: [401, 403, 404],
      });
      articles = selectArticles(parseSitemap(text), src);
    }

    // As wp-rest.ts: only the first page may shrink to a `limit`, so a cursor always names the
    // same pieces whatever the run before it asked for.
    const size =
      offset === 0
        ? Math.max(1, Math.min(PAGE_SIZE, opts?.limit ?? PAGE_SIZE))
        : PAGE_SIZE;
    const slice = articles.slice(offset, offset + size);
    const raw: SitemapRaw[] = [];
    for (const entry of slice) {
      try {
        const { text } = await fetchTextResponse(entry.loc, {
          delayMs: DELAY_MS,
          noRetryOn: [401, 403, 404, 410],
        });
        raw.push({
          url: entry.loc,
          ...(entry.image ? { sitemapImage: entry.image } : {}),
          ...parseArticlePage(text),
        });
      } catch (err) {
        // A refusal ends the walk, as everywhere: the site has said no.
        if (
          err instanceof HttpRefusedError &&
          (err.status === 401 || err.status === 403)
        )
          throw err;
        // A piece gone since the sitemap was written is one lost item, not a lost walk —
        // carried to toItem so ingest counts it rather than it vanishing.
        raw.push({
          url: entry.loc,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return { raw, next: nextOffset(offset, slice.length, articles.length) };
  }

  function toItem(raw: SitemapRaw): NormalizedItem {
    if ("error" in raw) throw new Error(`${src.id}: ${raw.url}: ${raw.error}`);
    if (!raw.isArticle)
      throw new Error(
        `${src.id}: ${raw.url} is not an article (no Article JSON-LD)`,
      );
    const url = new URL(raw.url);
    if (url.host !== host)
      throw new Error(`${src.id}: entry links off-site (${url.host})`);
    if (!raw.title) throw new Error(`${src.id}: ${raw.url} has no title`);
    return {
      source: src.id,
      // The path (`essays/<slug>`), as rss.ts uses it: stable, readable, and permanent for the
      // corpus because (source, sourceId) is the idempotency key.
      sourceId: url.pathname.replace(/^\/+|\/+$/g, ""),
      type: "article",
      title: raw.title,
      summary: raw.dek,
      body: null,
      ...(raw.text ? { curationText: raw.text } : {}),
      imageUrl: raw.imageUrl ?? raw.sitemapImage ?? null,
      sourceUrl: url.href,
      attribution: src.label,
      license: src.license,
      tags: raw.tags,
    };
  }

  return { source: src.id, walk, toItem };
}
