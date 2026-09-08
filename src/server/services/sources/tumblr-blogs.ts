// The nine Tumblr blogs of sources round 3 (09-05-26), each one line on the tumblr.ts factory.
// Everything about the walk lives in tumblr.ts; everything about a blog — label, host, robots
// check date, self-tags, and the probe evidence behind its verdict — lives in its
// server/config/blogs.ts row. This file is the wiring.
//
// One file for nine, where mossandfog/thisiscolossal/streetartnews each got their own: those
// arrived one at a time, a file per verdict. These nine were probed and registered as one batch,
// and nine one-line files would be nine files' worth of noise for no separation anyone needs.
// A tenth Tumblr blog belongs here too, not in a file of its own.
import { blogConfig } from "~/server/config/blogs";
import { tumblrWalker } from "./tumblr";

const walker = (id: string) => tumblrWalker(blogConfig(id)!);

export const nemfrog = walker("nemfrog");
export const humanoidhistory = walker("humanoidhistory");
export const sovietpostcards = walker("sovietpostcards");
export const scifiart70s = walker("70sscifiart");
export const vintagegeekculture = walker("vintagegeekculture");
export const dreamsrecurring = walker("dreamsrecurring");
export const toiich = walker("toiich");
export const thevaultoftheatomicspaceage = walker(
  "thevaultoftheatomicspaceage",
);
export const thisisnthappiness = walker("thisisnthappiness");
