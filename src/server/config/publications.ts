import { BLOG_LICENSE, isBlogSource } from "./blogs";
import type { WalkSourceId } from "./topics";

// Publications — the second kind of link-card source (docs/DESIGN_writing.md D6, 09-28-26;
// built in writing Phase 5, 09-30-26): literary and ideas magazines, each item shown as its lead
// image, the publication's own dek, a `from:` credit and a prominent link to the piece. **Never a
// republished article.** Their full text is read at ingest to score the piece and count its
// reading time (`NormalizedItem.curationText`) and is never stored — `body` stays null, exactly as
// for a blog. The posture, and the contract field, are recorded in Ambit-Admin's log (09-30-26).
//
// A rights posture belongs to the *source*, not the item — the same rule `isBlogSource` follows —
// which is why this is a registry of ids and not a column.
//
// **A row ships suspended** (config/suspended-sources.ts) until Ben's verdict in
// docs/source-candidates.md. All seven below are verdicted KEEP (10-01-26) and all are held
// suspended until the Claude judge exists (Ben, 10-01-26; docs/HANDOFF_claude-judge-ingest.md).
//
// **Two budgets per publication (10-01-26).** `walkQuota` bounds every scheduled run: the newest
// few dozen to few hundred, which is all a run can add. `backfillQuota` bounds the one-time
// archive run (`bun run ingest --source <id> --backfill`; `.cache/publications-backfill-prod.sh`
// on production), newest first. Ben first asked for everything ("bring in as much as you can …
// let the feed sort them out"), ~45,000 pieces; on seeing the size he cut it to about a quarter,
// newest first — ~10,750, the budgets below. Raising one later is free up to where the last run
// stopped (the curation cache) and the run prints a resume cursor for the rest.
//
// **Not registered:** Atlas Obscura (newest 27 only, 300 px images) and Hyperallergic (cut
// 09-01-26 on content fit; newest 15 only).

/** The one license string every link-card source shares — the blogs' own, verbatim. */
export const PUBLICATION_LICENSE = BLOG_LICENSE;

interface PublicationBase {
  id: WalkSourceId;
  /** The credit line's text: `from: The Marginalian`. Also `item.attribution`. */
  label: string;
  /** Origin only — no path, no trailing slash. Every item's `sourceUrl` is on this host. */
  baseUrl: string;
  license: typeof PUBLICATION_LICENSE;
  /** ISO date of the last human check of `/robots.txt` (the walker re-checks every run). */
  robotsCheckedOn: string;
  /**
   * Newest-first bound on a default walk, in items — `BlogConfig.walkQuota`'s lever exactly, read
   * by the same line of scripts/ingest.ts. Present ⇒ the run is never `complete`, so `--prune`
   * can never act on it: **which is also what a feed that shows only its newest page needs** —
   * there, "not in the feed" means "older", never "gone".
   */
  walkQuota?: number;
  /** The one-time archive run's bound, newest first (`ingest --backfill`). */
  backfillQuota: number;
}

export type PublicationConfig = PublicationBase &
  (
    | {
        /** WordPress's REST API (`sources/wp-rest.ts` in article mode): the whole archive, 100
         *  posts a page, the featured image, `content.rendered` as the curator's text. Preferred
         *  wherever a publication is WordPress and leaves the API open. */
        walk: "wp-rest";
      }
    | {
        /** The publication's sitemap (`sources/sitemap.ts`): every piece it lists under one of
         *  `sections`, newest first, each fetched as the page a reader would open. For an archive
         *  whose feed is a dek-only window (Aeon, Psyche). */
        walk: "sitemap";
        sitemapUrl: string;
        sections: readonly string[];
      }
    | {
        /** An RSS 2.0 or Atom feed (`sources/rss.ts`). */
        walk: "rss";
        feedUrl: string;
        /** Where the piece's full text is: `content:encoded`, or nowhere (a dek-only feed — the
         *  piece is scored on the dek, and has no reading time). */
        fullText: "content-encoded" | "none";
        /** `wp`: WordPress's `?paged=N` reaches past the newest page. Absent: the feed is its
         *  newest page and nothing more, and the walk is one request. */
        paged?: "wp";
      }
  );

export const PUBLICATIONS: readonly PublicationConfig[] = [
  {
    id: "themarginalian",
    label: "The Marginalian",
    baseUrl: "https://www.themarginalian.org",
    license: PUBLICATION_LICENSE,
    // Verified 09-30-26: no `Disallow: /` for `*`, and no AI crawler named at all.
    robotsCheckedOn: "2026-09-30",
    walk: "wp-rest",
    // 6,690 posts on 09-30-26, ~1,080 words each, a featured image on every one sampled.
    walkQuota: 200,
    backfillQuota: 2_000,
  },
  {
    id: "jstordaily",
    label: "JSTOR Daily",
    baseUrl: "https://daily.jstor.org",
    license: PUBLICATION_LICENSE,
    // Verified 09-30-26: no `Disallow: /` for `*`, and no AI crawler named.
    robotsCheckedOn: "2026-09-30",
    walk: "wp-rest",
    // 8,120 posts on 09-30-26, ~720 words each, every one with a 1050 × 700 featured image.
    walkQuota: 200,
    backfillQuota: 2_000,
  },
  {
    id: "noema",
    label: "Noema",
    baseUrl: "https://www.noemamag.com",
    license: PUBLICATION_LICENSE,
    // Verified 09-30-26: no `Disallow: /` for `*`, and no AI crawler named.
    robotsCheckedOn: "2026-09-30",
    walk: "rss",
    // WordPress, but its REST API reports zero posts (the essays are a custom type), so the
    // feed it is: full text in `content:encoded` (~2,900 words), a `media:thumbnail`, and a
    // `<description>` that is only WordPress's "appeared first on" footer — so the dek is the
    // piece's first paragraph (rss.ts `dekFrom`).
    feedUrl: "https://www.noemamag.com/feed/",
    fullText: "content-encoded",
    paged: "wp",
    // ~2,500 essays (page 200 of the feed answers, 300 is a 404, ten a page).
    walkQuota: 100,
    backfillQuota: 1_250,
  },
  {
    id: "aeon",
    label: "Aeon",
    baseUrl: "https://aeon.co",
    license: PUBLICATION_LICENSE,
    // Verified 10-01-26: `*` may fetch every article path (only /api, /search, previews and
    // syndication are disallowed). The file names ClaudeBot, GPTBot, CCBot, Google-Extended and
    // five more with `Disallow: /` — AI-training crawlers, which Ambit is not. Ben's verdict,
    // 10-01-26, made knowing that; recorded in docs/source-candidates.md.
    robotsCheckedOn: "2026-10-01",
    walk: "sitemap",
    // ~3,660 pieces on 10-01-26: 2,758 essays, 904 ideas, a handful of classics. Its feed is the
    // newest twenty with a 27-word dek, so the sitemap is the only way to the archive — and the
    // page is the only way to the text the curator reads.
    sitemapUrl: "https://assets.aeon.co/sitemaps/aeon/main.xml",
    sections: ["essays", "ideas", "classics"],
    walkQuota: 60,
    backfillQuota: 2_000,
  },
  {
    id: "psyche",
    label: "Psyche",
    baseUrl: "https://psyche.co",
    license: PUBLICATION_LICENSE,
    // Verified 10-01-26: Aeon's publisher, Aeon's robots.txt, Aeon's verdict.
    robotsCheckedOn: "2026-10-01",
    walk: "sitemap",
    // ~1,450 pieces on 10-01-26: 954 ideas, 299 guides, 111 turning points, 78 notes to self, 10
    // portraits. `heal`/`understand`/`relate`/`transcend` are theme hubs and never fetched.
    sitemapUrl: "https://assets.psyche.co/sitemaps/psyche/main.xml",
    sections: [
      "ideas",
      "guides",
      "turning-points",
      "notes-to-self",
      "portraits",
    ],
    walkQuota: 60,
    backfillQuota: 1_000,
  },
  {
    id: "longreads",
    label: "Longreads",
    baseUrl: "https://longreads.com",
    license: PUBLICATION_LICENSE,
    // Verified 10-01-26: `*` is allowed everything; GPTBot, ChatGPT-User, CCBot, Google-Extended
    // and ImagesiftBot are named with `Disallow: /`.
    robotsCheckedOn: "2026-10-01",
    walk: "wp-rest",
    // 24,261 posts on 10-01-26. Most are Longreads' own excerpt of a story published elsewhere,
    // with its recommendation — a longreads.com page, so a link card of Longreads, which is what
    // it is. ~22% of recent posts have a picture (~53% in 2018); the rest are text-only writing
    // cards. Quote posts and reading lists are in there too — the curator and the writing floor
    // sort them (Ben, 10-01-26).
    walkQuota: 200,
    backfillQuota: 2_500,
  },
  {
    id: "theparisreview",
    label: "The Paris Review",
    baseUrl: "https://www.theparisreview.org",
    license: PUBLICATION_LICENSE,
    // Verified 10-01-26: `*` is allowed /blog/ posts; Google-Extended and GPTBot are named.
    robotsCheckedOn: "2026-10-01",
    walk: "rss",
    // **A window, not an archive.** Cloudflare answers 403 to everything on the site except the
    // feed (the REST API, sitemaps, /blog/page/2 — probed 10-01-26), and the feed ignores
    // `?paged=`. So it is the newest ten, full text in `content:encoded`, accumulating one
    // night at a time. Its `walkQuota` bounds nothing (the walk is one request); it is there so
    // the run is never `complete`, because a pruning run would otherwise delete every piece that
    // has scrolled out of the window.
    feedUrl: "https://www.theparisreview.org/blog/feed/",
    fullText: "content-encoded",
    walkQuota: 10,
    backfillQuota: 10,
  },
];

export function publicationConfig(id: string): PublicationConfig | undefined {
  return PUBLICATIONS.find((p) => p.id === id);
}

export function isPublicationSource(source: string): boolean {
  return publicationConfig(source) !== undefined;
}

/**
 * Every source shown as a link card: the designated blogs and the publications. **PDR is not one**
 * — its pictures are public domain and its essays are CC BY-SA, so it is its own case wherever it
 * shares the link-out row (see `link-out-row.tsx`).
 */
export function isLinkCardSource(source: string): boolean {
  return isBlogSource(source) || isPublicationSource(source);
}
