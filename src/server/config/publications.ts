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
// **Every row ships suspended** (config/suspended-sources.ts) and leaves that list only on Ben's
// verdict in docs/source-candidates.md, one publication at a time: a `probe-walk`, then a
// 150-item sample (`bun run stats:walk <id> --quota 150`).
//
// **Probed 09-30-26 and not registered here**, for the verdict table rather than silently:
// Aeon and Psyche (dek-only feeds, and their robots.txt names ClaudeBot/GPTBot/CCBot),
// Longreads (mostly links out to other outlets, few pictures; names GPTBot/CCBot), The Paris
// Review (newest ten only; names GPTBot/Google-Extended), Atlas Obscura (newest 27 only, 300 px
// images) and Hyperallergic (cut 09-01-26 on content fit; newest 15 only).

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
    // 6,690 posts on 09-30-26, ~1,080 words each, a featured image on every one sampled. The
    // newest 1,500 is a first budget for Ben to move; the rest is a `--cursor` run away.
    walkQuota: 1_500,
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
    walkQuota: 1_500,
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
    walkQuota: 500,
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
