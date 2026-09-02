// The WP-REST walker factory (sources round 2, 09-01-26): one `CorpusWalkAdapter` per
// WordPress blog, built from its `BlogConfig` row. Blog #3 onward is a config row plus one
// registration line; the walk logic lives here once.
//
// **Relationship to doorofperception.ts.** That file is the bespoke original — blog #1, written
// as "YAGNI until blog #2" — and it stays exactly as it is by Ben's decision (shipped code with
// 318 rows behind it). This factory carries the same verified facts, and `wp-rest.test.ts`
// proves it: fed doorofperception's config and fixture, it produces byte-identical items. If a
// fact below changes, change it there too, or (better) migrate doorofperception onto the factory
// and delete the duplication — that is the deliberate follow-on, not an oversight.
//
// **Facts every WP blog has honoured so far (verified 08-25-26 on doorofperception, 09-01-26 on
// mossandfog and thisiscolossal):** `_embed=wp:featuredmedia` returns the hero's URL in the
// posts call, so nothing hits /media per post; `x-wp-totalpages` is on every response, so the
// walk knows its own length; `title.rendered` carries `<br>` and entities, `excerpt.rendered` a
// `<p>` wrapper — both go through htmlToText(); a post with no featured image is a thrown error,
// counted per item by ingest rather than skipped in silence.
//
// **Etiquette.** robots.txt is checked at the start of every walk (robots.ts), requests are
// 500 ms apart and sequential, and a 401/403 ends the walk on the first response (fetchJson's
// noRetryOn). spoon-tamago's Sucuri WAF is the reason the pace is not a per-blog knob: it passed
// clean at this rate, and a faster blog gains nothing worth a second code path.
import type { BlogConfig } from "~/server/config/blogs";
import { fetchJsonResponse } from "./http";
import { htmlToText, uniqueTags } from "./normalize";
import { assertCrawlAllowed } from "./robots";
import type {
  CorpusWalkAdapter,
  FetchOpts,
  NormalizedItem,
  WalkPage,
} from "./types";

const PER_PAGE = 100;
/** The /tags endpoint's own per_page ceiling; also the `include=` chunk size. */
const TAGS_PER_REQUEST = 100;
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
 *  stays a pure, synchronous projection (fixtures are recorded in this shape). */
export interface WpRaw extends WpPostRaw {
  tagNames: string[];
}

/** Pure: the cursor for the page after `page`, or undefined when `page` was the last. */
export function nextCursor(
  page: number,
  totalPages: number,
): string | undefined {
  return page < totalPages ? String(page + 1) : undefined;
}

export function wpRestWalker(blog: BlogConfig): CorpusWalkAdapter<WpRaw> {
  // Tag names, resolved lazily per page and memoized for the process. WordPress exposes tags as
  // numeric ids on a post and names on a separate endpoint. doorofperception fetches its whole
  // tag list up front (~200 tags, two requests); that does not survive a WordPress.com-hosted
  // blog — mossandfog reported 27,567 tags on 09-01-26, i.e. 276 pages and over two minutes of
  // polite requests before the first post, and a `--quota 150` dry-run would pay all of it. So
  // each posts page asks only for the ids it has not seen, `include=`-listed 100 at a time (the
  // endpoint's per_page ceiling). Closure-scoped, not module-scoped: two blogs' tag ids are
  // unrelated numbers and must never share a map. A missing name (a tag deleted mid-walk)
  // simply drops off the item.
  const tagNames = new Map<number, string>();
  async function resolveTagNames(ids: number[]): Promise<void> {
    const unseen = [...new Set(ids)].filter((id) => !tagNames.has(id));
    for (let i = 0; i < unseen.length; i += TAGS_PER_REQUEST) {
      const chunk = unseen.slice(i, i + TAGS_PER_REQUEST);
      const { data } = await fetchJsonResponse(
        `${blog.baseUrl}/wp-json/wp/v2/tags?include=${chunk.join(",")}` +
          `&per_page=${TAGS_PER_REQUEST}&_fields=id,name`,
        { delayMs: DELAY_MS, noRetryOn: [401, 403] },
      );
      for (const t of data as { id: number; name: string }[]) {
        tagNames.set(t.id, htmlToText(t.name));
      }
      // Mark the ids the endpoint did not return, so a deleted tag is asked for once, not per page.
      for (const id of chunk) if (!tagNames.has(id)) tagNames.set(id, "");
    }
  }

  async function walk(
    cursor?: string,
    opts?: FetchOpts,
  ): Promise<WalkPage<WpRaw>> {
    const page = cursor === undefined ? 1 : Number(cursor);
    if (!Number.isInteger(page) || page < 1) {
      throw new Error(`${blog.id}: bad cursor "${cursor}"`);
    }
    // Page 1 is the start of a walk: check the policy file before anything else.
    if (page === 1) await assertCrawlAllowed(blog.baseUrl);

    // `limit` bounds this page's size so `--quota N` can do a cheap structural check without
    // pulling 100 posts. No `_fields=` here: it would strip `_embedded`, which is the whole
    // reason for `_embed` (verified 08-25-26 — the filtered form returns an empty embed).
    const perPage = Math.max(1, Math.min(PER_PAGE, opts?.limit ?? PER_PAGE));
    const url =
      `${blog.baseUrl}/wp-json/wp/v2/posts?per_page=${perPage}&page=${page}` +
      `&_embed=wp:featuredmedia`;
    const { data, headers } = await fetchJsonResponse(url, {
      delayMs: DELAY_MS,
      noRetryOn: [401, 403],
    });
    const posts = data as WpPostRaw[];
    await resolveTagNames(posts.flatMap((p) => p.tags));

    return {
      raw: posts.map((p) => ({
        ...p,
        tagNames: p.tags
          .map((id) => tagNames.get(id))
          .filter((n): n is string => Boolean(n)),
      })),
      next: nextCursor(page, Number(headers.get("x-wp-totalpages") ?? "1")),
    };
  }

  function toItem(raw: WpRaw): NormalizedItem {
    const hero = raw._embedded?.["wp:featuredmedia"]?.[0]?.source_url;
    if (!raw.featured_media || !hero) {
      // Thrown, not null: ingest counts a toItem failure per item and prints it. A post with no
      // picture is not a link card, and a silent skip would hide the count.
      throw new Error(`${blog.id}: post "${raw.slug}" has no featured image`);
    }
    return {
      source: blog.id,
      // The slug, not the numeric id: stable across edits, readable in the DB, and what the
      // permalink is built from. (source, sourceId) is the idempotency key, so this choice is
      // permanent for the corpus.
      sourceId: raw.slug,
      type: "image",
      title: htmlToText(raw.title.rendered),
      // The blog's own excerpt IS the blurb (6.3 D5). A short one is floored by structuralFloor's
      // thin-summary rule like any museum stub — never padded here.
      summary: htmlToText(raw.excerpt.rendered),
      // Always null for a blog item — the invariant source-invariants.test.ts asserts, and the
      // reason blog items can never reach the reader view.
      body: null,
      imageUrl: hero,
      sourceUrl: raw.link,
      attribution: blog.label,
      license: blog.license,
      tags: uniqueTags(raw.tagNames.map((t) => t.toLowerCase())),
    };
  }

  return { source: blog.id, walk, toItem };
}
