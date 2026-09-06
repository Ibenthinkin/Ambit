import { tumblrWalker, expandPictures } from "~/server/services/sources/tumblr";
import { blogConfig } from "~/server/config/blogs";
import { curateItems, structuralFloor } from "~/server/services/curator";
const w = tumblrWalker(blogConfig("70sscifiart")!);
const offered = [];
let cursor: string | undefined;
while (offered.length < 150) {
  const page = await w.walk(cursor, { limit: 150 - offered.length });
  for (const raw of page.raw) { try { offered.push(w.toItem(raw)); } catch {} if (offered.length >= 150) break; }
  cursor = page.next; if (!cursor) break;
}
const { kept } = structuralFloor(offered);
const { listAllTopics } = await import("~/server/db/topics");
const { isRealTopic } = await import("~/server/config/topics");
const curated = await curateItems(kept, { classify: true, topics: (await listAllTopics()).filter(isRealTopic) });
for (const c of curated.filter((c) => c.curationScore <= 4)) {
  console.log(c.curationScore, c.sourceId, JSON.stringify(c.title.slice(0,60)), c.imageUrl);
}
