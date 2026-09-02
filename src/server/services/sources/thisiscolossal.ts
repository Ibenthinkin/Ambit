// thisiscolossal.com — blog #4, on the wp-rest factory (sources round 2, 09-01-26;
// docs/HANDOFF_sources-round2.md §2.1). Everything about the walk lives in wp-rest.ts;
// everything about the blog lives in its server/config/blogs.ts row. This file is the wiring.
import { blogConfig } from "~/server/config/blogs";
import { wpRestWalker } from "./wp-rest";

export const thisiscolossal = wpRestWalker(blogConfig("thisiscolossal")!);
