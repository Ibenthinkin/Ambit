// The publications' walkers (writing Phase 5, 09-30-26), each built from its row in
// server/config/publications.ts — the tumblr-blogs.ts arrangement: the walk logic lives in its
// factory once, and a publication is a config row plus one line here. `walk` picks the factory:
// WordPress's REST API in article mode, or the feed.
import {
  publicationConfig,
  type PublicationConfig,
} from "~/server/config/publications";
import { rssWalker } from "./rss";
import type { CorpusWalkAdapter } from "./types";
import { wpRestWalker } from "./wp-rest";

export function publicationWalker(
  pub: PublicationConfig,
): CorpusWalkAdapter<unknown> {
  return pub.walk === "wp-rest"
    ? wpRestWalker({ ...pub, itemType: "article" })
    : rssWalker(pub);
}

const walker = (id: string) => publicationWalker(publicationConfig(id)!);

export const themarginalian = walker("themarginalian");
export const jstordaily = walker("jstordaily");
export const noema = walker("noema");
