// The first corpus-walk adapter (Phase 6.3, docs/PHASE6_DESIGN_6.3.md §5) and the first blog:
// doorofperception.com, over its WordPress REST API. No HTML is scraped — WordPress publishes
// posts as JSON, with a written excerpt and a named featured image per post, so the whole walk is
// four requests at 100 posts a page (390 posts as of 08-25-26).
//
// **What one item is.** One POST → one `image` item: the post's featured image, the post's own
// excerpt as `summary`, and `body` ALWAYS null (D5). The other ~28 images a post carries never
// become items (D1) — one post, one card, one link out, which is the link-preview shape the rights
// posture describes. The blog is credited by the registry's label and linked at the permalink.
//
// **Facts this was built on (verified 08-25-26):** `_embed=wp:featuredmedia` returns the hero's
// URL in the posts call, so nothing hits /media per post; `x-wp-totalpages` is on every response,
// so the walk knows its own length; featured images are the blog's ~800px "Featured" crop (fine
// for tile and hero, not gallery-grade); `title.rendered` carries `<br>` and entities,
// `excerpt.rendered` a `<p>` wrapper — both go through htmlToText(). One post in 390 has no
// featured image: toItem throws, and ingest's per-item error path counts it, so the number is
// visible rather than hidden inside "offered".
//
// **Etiquette.** robots.txt is checked at the start of every walk (robots.ts), requests are 500ms
// apart, and a 401/403 ends the walk on the first response (fetchJson's noRetryOn).
import { blogConfig } from "~/server/config/blogs";
import { fetchJsonResponse } from "./http";
import { htmlToText, uniqueTags } from "./normalize";
import { assertCrawlAllowed } from "./robots";
import type {
  CorpusWalkAdapter,
  FetchOpts,
  NormalizedItem,
  WalkPage,
} from "./types";

const BLOG = blogConfig("doorofperception")!;
const PER_PAGE = 100;
const DELAY_MS = 500;

/** One post from /wp/v2/posts?_embed=wp:featuredmedia — the fields toItem reads, nothing more. */
export interface WpPostRaw {
  id: number;
  slug: string;
  link: string;
  date: string;
  title: { rendered: string };
  excerpt: { rendered: string };
  tags: number[];
  categories: number[];
  /** 0 when the post has no featured image. */
  featured_media: number;
  _embedded?: {
    "wp:featuredmedia"?: {
      source_url?: string;
      media_details?: { width?: number; height?: number };
    }[];
  };
}

/** What walk() actually returns: the post plus its tag ids resolved to names, so that toItem()
 *  stays a pure, synchronous projection (the fixture is recorded in this shape). */
export interface DopRaw extends WpPostRaw {
  tagNames: string[];
}

/** Pure: the cursor for the page after `page`, or undefined when `page` was the last. */
export function nextCursor(
  page: number,
  totalPages: number,
): string | undefined {
  return page < totalPages ? String(page + 1) : undefined;
}

// Tag names, resolved once per process. WordPress exposes tags as numeric ids on a post and names
// on a separate endpoint; ~200 tags is a page or two, fetched on the first walk() call and reused
// for every page after. A missing name (a tag deleted mid-walk) simply drops off the item.
let tagNamesPromise: Promise<Map<number, string>> | null = null;
async function tagNames(): Promise<Map<number, string>> {
  tagNamesPromise ??= (async () => {
    const names = new Map<number, string>();
    for (let page = 1; ; page++) {
      const { data, headers } = await fetchJsonResponse(
        `${BLOG.baseUrl}/wp-json/wp/v2/tags?per_page=100&page=${page}&_fields=id,name`,
        { delayMs: DELAY_MS, noRetryOn: [401, 403] },
      );
      for (const t of data as { id: number; name: string }[]) {
        names.set(t.id, htmlToText(t.name));
      }
      if (!nextCursor(page, Number(headers.get("x-wp-totalpages") ?? "1")))
        break;
    }
    return names;
  })();
  return tagNamesPromise;
}

async function walk(
  cursor?: string,
  opts?: FetchOpts,
): Promise<WalkPage<DopRaw>> {
  const page = cursor === undefined ? 1 : Number(cursor);
  if (!Number.isInteger(page) || page < 1) {
    throw new Error(`doorofperception: bad cursor "${cursor}"`);
  }
  // Page 1 is the start of a walk: check the policy file before anything else.
  if (page === 1) await assertCrawlAllowed(BLOG.baseUrl);

  // `limit` bounds this page's size so `--quota N` can do a cheap structural check without
  // pulling 100 posts. No `_fields=` here: it would strip `_embedded`, which is the whole reason
  // for `_embed` (verified 08-25-26 — the filtered form returns an empty embed).
  const perPage = Math.max(1, Math.min(PER_PAGE, opts?.limit ?? PER_PAGE));
  const url =
    `${BLOG.baseUrl}/wp-json/wp/v2/posts?per_page=${perPage}&page=${page}` +
    `&_embed=wp:featuredmedia`;
  const { data, headers } = await fetchJsonResponse(url, {
    delayMs: DELAY_MS,
    noRetryOn: [401, 403],
  });
  const posts = data as WpPostRaw[];
  const names = await tagNames();

  return {
    raw: posts.map((p) => ({
      ...p,
      tagNames: p.tags
        .map((id) => names.get(id))
        .filter((n): n is string => Boolean(n)),
    })),
    next: nextCursor(page, Number(headers.get("x-wp-totalpages") ?? "1")),
  };
}

function toItem(raw: DopRaw): NormalizedItem {
  const hero = raw._embedded?.["wp:featuredmedia"]?.[0]?.source_url;
  if (!raw.featured_media || !hero) {
    // Thrown, not null: ingest counts a toItem failure per item and prints it. A post with no
    // picture is not a link card, and a silent skip would hide the count (1 of 390 today).
    throw new Error(
      `doorofperception: post "${raw.slug}" has no featured image`,
    );
  }
  return {
    source: "doorofperception",
    // The slug, not the numeric id: stable across edits, readable in the DB, and what the
    // permalink is built from. (source, sourceId) is the idempotency key, so this choice is
    // permanent for the corpus.
    sourceId: raw.slug,
    type: "image",
    title: htmlToText(raw.title.rendered),
    // The blog's own excerpt IS the blurb (D5). A short one is floored by structuralFloor's
    // thin-summary rule like any museum stub — 3 of 390 as of 08-25-26 — never padded here.
    summary: htmlToText(raw.excerpt.rendered),
    // Always null for a blog item. Not "the excerpt again", not the post body. This is the
    // invariant source-invariants.test.ts asserts, and the reason blog items can never reach the
    // reader view: /i/[itemId] keys its variant on type, and this one is always "image".
    body: null,
    imageUrl: hero,
    sourceUrl: raw.link,
    attribution: BLOG.label,
    license: BLOG.license,
    tags: uniqueTags(raw.tagNames.map((t) => t.toLowerCase())),
  };
}

export const doorofperception: CorpusWalkAdapter<DopRaw> = {
  source: "doorofperception",
  walk,
  toItem,
};
