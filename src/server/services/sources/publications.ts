// The publications' walkers (writing Phase 5, 09-30-26), each built from its row in
// server/config/publications.ts — the tumblr-blogs.ts arrangement: the walk logic lives in its
// factory once, and a publication is a config row plus one line here. `walk` picks the factory:
// WordPress's REST API in article mode, the sitemap, or the feed.
import {
  publicationConfig,
  type PublicationConfig,
} from "~/server/config/publications";
import { rssWalker } from "./rss";
import { sitemapWalker } from "./sitemap";
import type { CorpusWalkAdapter } from "./types";
import { wpRestWalker } from "./wp-rest";

export function publicationWalker(
  pub: PublicationConfig,
): CorpusWalkAdapter<unknown> {
  switch (pub.walk) {
    case "wp-rest":
      return wpRestWalker({ ...pub, itemType: "article" });
    case "sitemap":
      return sitemapWalker(pub);
    case "rss":
      return rssWalker(pub);
  }
}

const walker = (id: string) => publicationWalker(publicationConfig(id)!);

export const themarginalian = walker("themarginalian");
export const jstordaily = walker("jstordaily");
export const noema = walker("noema");
// Publications round 2 (10-01-26).
export const aeon = walker("aeon");
export const psyche = walker("psyche");
export const longreads = walker("longreads");
export const theparisreview = walker("theparisreview");
