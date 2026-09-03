// Cut 2a's tag mining (docs/PLAN_topic-vocabulary-cut2.md; the principle is
// docs/DESIGN_topic-vocabulary-growth.md §1). Pure functions over tag statistics: the corpus read
// and the report live in scripts/mine-topics.ts, so everything here is unit-testable without a DB.
//
// **What this is for.** Cut 1 stores a walk item even when none of the sixteen topics fits it, with
// `topic_id` NULL — 3,741 items, 16% of the corpus, invisible to the feed. Those items' own tags
// are the evidence for what the vocabulary is missing. This ranks that evidence; a person decides.
//
// **Why it never inserts anything.** A topic entering Ambit's vocabulary is a product decision, and
// tag frequency is a proposal, not a verdict. The script writes a Markdown file with a checkbox per
// candidate and Ben's edit to that file IS the decision (scripts/promote-topics.ts reads it back).

/** One tag's evidence: how often it appears at all, how often on an item the feed cannot see, and
 *  which sources use it. `unhomed` is the ranking signal — it is literally "how many invisible
 *  items would this topic rescue". */
export interface TagStat {
  tag: string;
  total: number;
  unhomed: number;
  sources: string[];
}

export interface MiningOpts {
  /** Floor on `unhomed`. See the plan's §0.2 curve: 40 → 36 topics / 70% of the backlog, 20 → 86
   *  topics / 76%. Sharp diminishing returns past this. */
  minUnhomed: number;
  /** How many distinct sources must use a tag before it is a *shared* vocabulary rather than one
   *  blog's house style. 2,658 of the 3,741 un-homed items are Colossal's, so unfiltered mining
   *  would elect Colossal's vocabulary as Ambit's. */
  minSources: number;
  /** Tags that bypass `minSources` — real topics that happen to live on one source today
   *  (`street art` was single-source until streetartnews landed). */
  allow: string[];
  /** Tags that are never topics however frequent: administrative blog vocabulary. `submission`
   *  (344 un-homed items) and `sponsor` (52) are the ones the corpus actually contains — no
   *  threshold excludes them, because they are genuinely common. */
  stopwords: string[];
}

export const DEFAULT_MINING: MiningOpts = {
  minUnhomed: 20,
  minSources: 2,
  allow: [],
  stopwords: [
    "submission",
    "submissions",
    "sponsor",
    "sponsored",
    "images",
    "image",
    "photo",
    "photos",
    "video", // the *medium* of a post, not what it is about — see plan §0.4's test
    "art",
    "design",
    "misc",
    "miscellaneous",
    "uncategorized",
    "other",
    "featured",
    "news",
    "update",
    "updates",
  ],
};

/** Fold a corpus read into one row per tag. `homed` is "the feed can already see this item"
 *  (`item.topic_id` is not NULL), so `unhomed` counts exactly the invisible ones. */
export function tallyTags(
  items: { tags: string[]; source: string; homed: boolean }[],
): TagStat[] {
  const acc = new Map<
    string,
    { total: number; unhomed: number; sources: Set<string> }
  >();
  for (const it of items) {
    for (const tag of it.tags) {
      const e = acc.get(tag) ?? {
        total: 0,
        unhomed: 0,
        sources: new Set<string>(),
      };
      e.total++;
      if (!it.homed) e.unhomed++;
      e.sources.add(it.source);
      acc.set(tag, e);
    }
  }
  return [...acc].map(([tag, e]) => ({
    tag,
    total: e.total,
    unhomed: e.unhomed,
    sources: [...e.sources].sort(),
  }));
}

/**
 * Split the tag statistics into what to propose and what to set aside.
 *
 * `promoted` clears every rule. `singleSource` clears everything *except* `minSources` — kept
 * visible rather than dropped, because that filter's job is junk and it catches real topics too
 * (`street art`, 178 un-homed items, one source). Ben rescues one by moving it in the proposal
 * file, or permanently by adding it to `allow`.
 */
export function rankCandidates(
  stats: TagStat[],
  existing: string[],
  opts: MiningOpts = DEFAULT_MINING,
): { promoted: TagStat[]; singleSource: TagStat[] } {
  const taken = new Set(existing.map((e) => e.toLowerCase()));
  const stop = new Set(opts.stopwords.map((s) => s.toLowerCase()));
  const allow = new Set(opts.allow.map((s) => s.toLowerCase()));
  const byUnhomed = (a: TagStat, b: TagStat) => b.unhomed - a.unhomed;

  const eligible = stats.filter(
    (s) =>
      !stop.has(s.tag.toLowerCase()) &&
      // Checked both ways round because `existing` holds topic *ids* (`street-art`) while the
      // corpus answers in tag text ("street art") — matching only one would re-propose a topic
      // Ambit already has.
      !taken.has(s.tag.toLowerCase()) &&
      !taken.has(topicIdFor(s.tag)) &&
      s.unhomed >= opts.minUnhomed,
  );
  return {
    promoted: eligible
      .filter(
        (s) =>
          s.sources.length >= opts.minSources || allow.has(s.tag.toLowerCase()),
      )
      .sort(byUnhomed),
    singleSource: eligible
      .filter(
        (s) =>
          s.sources.length < opts.minSources && !allow.has(s.tag.toLowerCase()),
      )
      .sort(byUnhomed),
  };
}

/** A tag as a topic id: the same slug shape the sixteen use (`ancient-history`, `the-ocean`). */
export function topicIdFor(tag: string): string {
  return tag
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** A tag as a topic label. Title Case, with `&` preserved because several real candidates carry
 *  it (`art & illustration`). Ben may overwrite any label in the proposal file. */
export function topicLabelFor(tag: string): string {
  return tag
    .split(/\s+/)
    .map((w) => (w === "&" ? "&" : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}
