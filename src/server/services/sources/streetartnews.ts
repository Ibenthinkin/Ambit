// streetartnews.net — blog #5, a config row on the wp-rest factory (sources round 2, 09-02-26;
// docs/HANDOFF_sources-round2.md §0). Everything about the walk lives in wp-rest.ts; everything
// about the blog lives in its server/config/blogs.ts row. This file is the wiring.
import { blogConfig } from "~/server/config/blogs";
import { wpRestWalker } from "./wp-rest";

export const streetartnews = wpRestWalker(blogConfig("streetartnews")!);
