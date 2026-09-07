// The curation service (SPEC §6.2) — port of phase0/curate.ts, adapted from that script's
// throwaway `Item`/file-based I/O to the real `NormalizedItem` shape adapters produce and a
// disk cache keyed for reuse across ingestion runs. Two stages, same as Phase 0:
//   1. STRUCTURAL (free, pure) — drop catalog noise before anything gets billed: duplicated
//      titles, bare-noun image titles, summaries with no signal.
//   2. LLM (cents, cached) — a cheap vision model plays the role of an old-Tumblr art-blog
//      curator: every survivor gets a 1-10 "would you post this?" score plus a few aesthetic
//      tags. Image items are judged by *looking at the image* (downloaded + base64'd, never the
//      URL — museum image servers bot-block provider-side fetchers, CLAUDE.md), not by their
//      catalog boilerplate.
//
// This is Phase 0.4/0.5's central finding made permanent: the corpus, not the ranking function,
// is what makes the feed feel good. scripts/ingest.ts (Phase 3.4) calls structuralFloor() then
// curateItems() on every batch of freshly normalized items before they're upserted.

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { TOPICS, WALK_SOURCES } from "~/server/config/topics";
import { imageFetchHeaders } from "./image-auth";
import { USER_AGENT } from "./sources/http";
import type { NormalizedItem } from "./sources/types";

/** Cheap, vision-capable, fast — curation is thousands of small judgments, not deep reasoning.
 *  Swappable on purpose: the cache key below includes the model, so trying a different judge
 *  never clobbers scores already paid for. */
export const CURATOR_MODEL = "google/gemini-2.5-flash-lite";

/** Bump when CURATOR_PROMPT changes — it's part of the cache key, so a new prompt version
 *  invalidates exactly the responses it should and nothing else. */
export const PROMPT_VERSION = 1;

/** How many curator calls run at once. Chat completions are per-item (no batch endpoint), so
 *  throughput comes from a small concurrency pool instead. */
const CONCURRENCY = 8;

/** Copied verbatim from phase0/curate.ts — this prompt is a product artifact (Ben's taste
 *  calibration lands here, SPEC §15), not implementation detail to be casually reworded. */
export const CURATOR_PROMPT = `You are the curator of a beloved, long-running art and ideas blog — the kind people used to follow on old Tumblr because every single post was worth stopping for. Your taste: visually striking or quietly beautiful images (strong composition, texture, color, oddness, wit); ideas and stories with a genuine spark of "huh, I never knew that". You post museum objects, illustrations, diagrams, photographs, and short articles. You are highly selective: most things a museum digitizes are catalog filler — fragments, routine studio shots, objects with no visual or intellectual hook — and you skip them without guilt. You never post anything sensational, gory, or engagement-baity.

Rate the following item for your blog on a 1-10 scale:
  1-3  = filler; you would scroll past it (fragments, routine catalog shots, dull or context-free)
  4-6  = fine but forgettable; post only on a slow day
  7-8  = good; a solid post your followers would enjoy
  9-10 = exceptional; the kind of find your blog is known for

Also give 2-4 short lowercase aesthetic tags describing its look or appeal (e.g. "botanical plate", "hand-lettered", "brutalist", "lurid palette", "quiet portrait", "strange diagram").

Reply with ONLY a JSON object: {"score": <1-10>, "tags": ["...", "..."]}`;

/** The sixteen COMPILE-TIME topic ids — the classify mode's FALLBACK vocabulary, and what it
 *  validates against when a caller names no other. Since 09-06-26 both ingest and stats:walk
 *  pass the live vocabulary instead (`listAllTopics()`, 99 topics today), so this is the floor
 *  rather than the ceiling: it is what a caller gets for free, and it is still the set the
 *  exported `CLASSIFY_PROMPT` below is built from. */
export const TOPIC_IDS: ReadonlySet<string> = new Set(TOPICS.map((t) => t.id));

/**
 * Phase 6.3's classify mode: the SAME rubric with a topic block appended. Used only for
 * corpus-walk items (blogs), which arrive with no topic because no seed query surfaced them; the
 * museum path never sees this prompt, so its scores and cache are untouched. Built by slicing
 * rather than editing CURATOR_PROMPT, because that string is a product artifact carrying Ben's
 * taste calibration (SPEC §15) and is not implementation detail to be reworded.
 *
 * **D4, revised (Cut 1, 09-2026 — docs/DESIGN_topic-vocabulary-growth.md §4).** 6.3's D4 read:
 * "'or null' is the important clause: a post with no honest home among the sixteen is dropped by
 * ingest, never force-fitted — topic_id is the feed's unit of drift, and a psychedelia post filed
 * under botany teaches the drift graph something false." Half of that survives and is
 * strengthened, half reverses. *Never force-fitted* stands, and is now cheaper: the answer is an
 * ARRAY of honest homes, possibly empty, so refusing a topic costs the item nothing. *Dropped by
 * ingest* is gone: the item is stored with zero topic rows, its tags intact, and Cut 2's
 * promotion is what gives it a home. Walk sources ingest their whole corpus; the vocabulary grows
 * to fit them, never the reverse.
 */
/**
 * **The vocabulary is a parameter, not a constant (09-06-26, plan T4).** It used to be the
 * sixteen compile-time TOPICS, which meant a walk item could only ever home into a core topic —
 * so every post whose real subject was one of Cut 2a's 83 GROWN topics came back un-homed and
 * waited for the next manual `promote:topics` run to rescue it. The list is now whatever the
 * caller passes (ingest and stats:walk pass every topic in the database), so a new post homes at
 * ingest into a topic that actually exists.
 *
 * **This re-bills nothing** (D10). `curationCacheKey` deliberately does not include the topic
 * list — see its comment — so an item classified under sixteen topics keeps that cached answer
 * and `promote:topics` remains the backfill for those. `PROMPT_VERSION` stays 1: bumping it would
 * re-bill the whole corpus for a change to a *list*, which is the exact thing the cache was
 * designed not to key on.
 */
export function classifyPrompt(
  topics: readonly { id: string; label: string }[],
): string {
  return (
    CURATOR_PROMPT.slice(0, CURATOR_PROMPT.lastIndexOf("Reply with ONLY")) +
    `Also list which of these topics are an honest home for this item — a topic a reader who chose it would be glad to find this in. Best fit first. Usually one or two, never more than three; an empty list is a correct answer. Never force a fit: if none of them is honest, answer [].
${topics.map((t) => `  ${t.id} — ${t.label}`).join("\n")}

The list is long; most of it will not apply — pick only honest homes.

Reply with ONLY a JSON object: {"score": <1-10>, "tags": ["...", "..."], "topics": [<topic ids, best fit first, or empty>]}`
  );
}

/** The prompt over the sixteen compile-time topics — the default when a caller names no
 *  vocabulary, and what the prompt-slicing comment above is about. */
export const CLASSIFY_PROMPT = classifyPrompt(TOPICS);

export type CuratedItem = NormalizedItem & {
  curationScore: number;
  aestheticTags: string[];
  /** Cut 1: the classify mode's answer for corpus-walk items — every honest topic, best fit
   *  first, possibly none. Ingest stores the item either way: `topics[0] ?? null` becomes the
   *  display `topic_id`, every entry becomes an `item_topic` row, and an empty list is counted as
   *  un-homed. Always `[]` outside classify mode — a search-shaped item's topic comes from the
   *  seed query that surfaced it. */
  topics: string[];
};

/** Structural-floor drop reasons, each mapped to a Phase 0.4 finding (see phase0/NOTES.md). */
export type StructuralDropRule = "dup-title" | "bare-title" | "thin-summary";

/** Titles are compared in a normalized form so "Textile", "textile " and "Textile." all count
 *  as the same title — the 0.4 duplicates were exact-after-normalization, not fuzzy. */
function isWalkSource(source: string): boolean {
  return (WALK_SOURCES as readonly string[]).includes(source);
}

function normTitle(t: string): string {
  return t
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Stage 1 — the structural quality floor (free, pure, batch-relative: dup-title counts are
 * within the given `items` array only). Three rules, each a Phase 0.4 finding:
 *  - dup-title: items sharing a normalized title with >2 others are interchangeable catalog
 *    stubs (580 of 3168 Phase 0 items sat on a literally duplicated title) — picking one to
 *    keep would be arbitrary, so all of them go. **Walk sources are exempt** (sources round 2,
 *    09-01-26): a blog's series posts share a caption-derived title on purpose — nine of 150
 *    thingsorganizedneatly posts, three Andy Goldsworthys among them, floored under the museum
 *    rule — and `(source, source_id)` still catches true repeats. The other two rules apply.
 *  - bare-title: a museum image titled with a single noun ("Bowl", "Fragment") has nothing to
 *    say for itself. Scoped to image items — a one-word Wikipedia title ("Astronomy") fronts a
 *    rich article and is fine.
 *  - thin-summary: below ~60 chars a museum summary is just a department name; no signal for
 *    the curator LLM or the reader.
 *
 * **Walk-source IMAGES are exempt from the last two rules** (09-06-26,
 * docs/PLAN_caption-less-and-wild.md T1). Both were written about museum *records*, where the
 * text is all there is: a catalogue row titled "Bowl" with a department name for a summary has
 * genuinely told us nothing. A picture blog is the opposite case — the picture IS the content
 * and the caption is an aside. Two of the four blogs Ben kept in round 3 have a median caption
 * of 0 and 28 characters, and thin-summary alone floored 137 of 150 thevaultoftheatomicspaceage
 * posts and 140 of 140 thisisnthappiness posts: a rule about museums deciding that a blog Ben
 * designated may not be ingested. bare-title has to go with it, not instead of it — a
 * caption-less card is titled with its blog's label (tumblr.ts deriveTitle) and two of those
 * labels are one word (`nemfrog`, `Colossal`), so it would floor them the moment thin-summary
 * stopped. For a walk image the curator — which SEES the picture — is the whole quality bar,
 * which is what docs/DESIGN_topic-vocabulary-growth.md §1 asks for: a walk source ingests
 * everything that clears *quality*, and quality is the curator's job, not the floor's.
 *
 * A walk source's ARTICLES keep both rules: pdr's articles are read, not looked at, and a
 * 40-char article summary is still nothing to read. Search-shaped sources are untouched — these
 * rules were written for them and still fit them.
 */
export function structuralFloor(items: NormalizedItem[]): {
  kept: NormalizedItem[];
  dropped: { item: NormalizedItem; rule: StructuralDropRule }[];
} {
  const titleCounts = new Map<string, number>();
  for (const item of items) {
    const key = normTitle(item.title);
    titleCounts.set(key, (titleCounts.get(key) ?? 0) + 1);
  }

  const kept: NormalizedItem[] = [];
  const dropped: { item: NormalizedItem; rule: StructuralDropRule }[] = [];

  for (const item of items) {
    const norm = normTitle(item.title);
    // The exemption above, computed once per item: a picture from a designated blog or any
    // other walk source. Only the last two rules read it; dup-title has its own walk clause.
    const walkImage = isWalkSource(item.source) && item.type === "image";
    const rule: StructuralDropRule | null =
      (titleCounts.get(norm) ?? 0) > 2 && !isWalkSource(item.source)
        ? "dup-title"
        : item.type === "image" && norm.split(" ").length <= 1 && !walkImage
          ? "bare-title"
          : item.summary.trim().length < 60 && !walkImage
            ? "thin-summary"
            : null;

    if (rule === null) kept.push(item);
    else dropped.push({ item, rule });
  }

  return { kept, dropped };
}

// ── stage 2: LLM curation ───────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Everything the curator gets to read as text (the image, if any, travels separately as a
 *  second content part). */
function itemAsText(item: NormalizedItem): string {
  return [
    `Type: ${item.type}`,
    `Title: ${item.title}`,
    item.tags.length ? `Tags: ${item.tags.slice(0, 12).join(", ")}` : null,
    // Omitted when empty, the same way `Tags:` is. Since the floor stopped dropping caption-less
    // walk images (09-06-26) a bare `Text: ` with nothing after it reaches the model regularly,
    // and a labelled empty field reads as a missing answer rather than as an absent question.
    item.summary.trim() ? `Text: ${item.summary}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Fetch an image and return it as a base64 data URL, or null if unreachable. We download instead
 * of handing the provider a URL because AIC's IIIF server 403s server-side fetchers (bot-
 * blocking, fine in a browser) and some Met URLs contain literal spaces a provider rejects as
 * malformed — fetching ourselves sidesteps every source's fetcher quirk at the cost of local
 * bandwidth, which is free. Ported from phase0/curate.ts's imageAsDataUrl.
 *
 * `headers` exists for the one source whose images are bearer-gated (Loupe; `image-auth.ts`
 * decides).
 */
async function imageAsDataUrl(
  url: string,
  headers: Record<string, string> = {},
): Promise<string | null> {
  for (const candidate of [url, encodeURI(url)]) {
    try {
      const res = await fetch(candidate, {
        // Spread last: a source that authenticates (Loupe, via image-auth.ts) adds to the
        // defaults, never replaces them.
        headers: { "User-Agent": USER_AGENT, ...headers },
      });
      if (!res.ok) continue;
      const mime =
        res.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
      if (!mime.startsWith("image/")) continue;
      const b64 = Buffer.from(await res.arrayBuffer()).toString("base64");
      return `data:${mime};base64,${b64}`;
    } catch {
      // try the encoded variant, then give up
    }
  }
  return null;
}

/**
 * The most topics one classify answer may carry (09-07-26). The prompt has said "never more than
 * three" since 6.3, and until this constant existed the parser kept everything on purpose — the
 * argument being that truncating would hide a model that over-files. Then the first
 * sovietpostcards walk stored 89 items with 20+ memberships and nine filed under all 99 topics:
 * the model listing the vocabulary straight back, in order. Hiding over-filing was the wrong
 * worry; STORING it was the harm — every one of those rows was a wrong answer the feed could
 * draw. So the cap is enforced here, on the model's own best-fit-first order, and the number
 * dropped is reported (`overFiled`) rather than swallowed, which keeps the honesty the old
 * comment was after. `scripts/trim-memberships.ts` is the one-off that applied it to rows
 * written before this date.
 */
export const MAX_TOPICS = 3;

/** Apply MAX_TOPICS to an already-validated, deduplicated topic list. Used on both the parse
 *  path and the cache-read path, so an entry written before the cap is capped the same way. */
export function capTopics(topics: readonly string[]): {
  topics: string[];
  overFiled: number;
} {
  return {
    topics: topics.slice(0, MAX_TOPICS),
    overFiled: Math.max(0, topics.length - MAX_TOPICS),
  };
}

/**
 * Parse + validate one curator chat response. Split out from scoreItem() so the untrusted-JSON
 * handling is unit-testable without a network call: trust nothing the model says past "it's
 * valid JSON" — clamp the score into 1-10, coerce tags to a short list of lowercase strings, and
 * reject an unusable score (0, negative, missing, NaN) so the caller can retry rather than
 * silently caching garbage.
 */
export function parseCuratorResponse(
  content: string,
  opts?: { topicIds?: ReadonlySet<string> },
): {
  score: number;
  tags: string[];
  topics: string[];
  /** How many KNOWN topic ids past MAX_TOPICS the model named. 0 outside classify mode. */
  overFiled: number;
} {
  const parsed: unknown = JSON.parse(content);
  const record =
    parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};

  const rawScore = Number(record.score);
  if (!Number.isFinite(rawScore) || rawScore <= 0) {
    throw new Error(
      `bad curator score: ${JSON.stringify(parsed).slice(0, 100)}`,
    );
  }
  const score = Math.min(10, Math.max(1, Math.round(rawScore)));

  const tags = (Array.isArray(record.tags) ? record.tags : [])
    .filter(
      (t: unknown): t is string => typeof t === "string" && t.trim().length > 0,
    )
    .map((t: string) => t.trim().toLowerCase())
    .slice(0, 4);

  // Classify mode only (Cut 1: an ARRAY — the model may name several honest homes, or none). Two
  // defences, both cheap: only ids in `topicIds` survive, because the model is capable of
  // inventing "psychedelia" and a foreign-key error deep into an ingest run is the worst place to
  // learn that; and duplicates collapse. A legacy single `"topic"` key is read as a one-element
  // list so an old-style answer still lands. Then MAX_TOPICS: the first three survive and the
  // rest are counted, not kept — see the constant for why that reversed.
  const known = opts?.topicIds;
  const rawTopics: unknown[] = Array.isArray(record.topics)
    ? record.topics
    : typeof record.topic === "string"
      ? [record.topic]
      : [];
  const { topics, overFiled } = capTopics(
    known
      ? [
          ...new Set(
            rawTopics.filter(
              (t): t is string => typeof t === "string" && known.has(t),
            ),
          ),
        ]
      : [],
  );

  return { score, tags, topics, overFiled };
}

/** Cache dir at the repo root (not under src/), same cache-aside pattern as phase0's scripts — a
 *  second ingest run of an item already scored bills zero tokens. Resolved from process.cwd()
 *  rather than import.meta.url because this module is imported by scripts/ingest.ts and by tests;
 *  cwd is always the repo root for `bun run` invocations either way. Exported for the read-forward
 *  test in curator.test.ts, which seeds a pre-Cut-1 entry by hand. */
export const CURATION_CACHE_DIR = path.join(
  process.cwd(),
  ".cache",
  "curation",
);

/**
 * The cache key: `model | promptVersion | mode | source:sourceId`. The default-mode key is
 * byte-identical to Phase 3's so no museum item is ever re-billed; classify mode has its own
 * namespace because its answer carries one more field.
 *
 * **Deliberately NOT keyed on the topic list.** That would be a bug if classification had to be
 * re-run whenever the vocabulary changed — but under design §3 D3 it does not: tag backfill (Cut
 * 2) is what widens old items, for free. Items curated before Cut 1 keep their single topic until
 * a promotion reaches them. That is correct and intended, not a migration gap.
 *
 * This became load-bearing on 09-06-26, when the classify vocabulary went from a compile-time
 * sixteen to whatever is in the database (D10): the list now changes every time a topic is
 * promoted, and keying on it would re-bill the entire corpus for a change to a *list*. An item
 * classified under the sixteen keeps that answer, and `promote:topics` is its backfill. That is
 * the whole reason `PROMPT_VERSION` did not move.
 */
export function curationCacheKey(
  item: Pick<NormalizedItem, "source" | "sourceId">,
  classify: boolean,
): string {
  const mode = classify ? "classify|" : "";
  return createHash("sha256")
    .update(
      `${CURATOR_MODEL}|v${PROMPT_VERSION}|${mode}${item.source}:${item.sourceId}`,
    )
    .digest("hex")
    .slice(0, 32);
}

/**
 * One curator call for one item, cache-aside. Image items are judged by the image itself; if the
 * image can't be fetched, the curator judges on text alone (a missing thumbnail shouldn't null
 * out an item's score) rather than failing the whole call.
 *
 * `imageFetchFailed` reports that degradation to the caller. It used to be invisible, and Phase
 * 6.2 is what showed why that mattered: tile.loc.gov started returning 429 to this machine
 * partway through a 334-image LoC ingest, and *nothing anywhere said so* — the run reported a
 * clean success, and the only symptom was a score average that came in half a point lower than
 * the same source's sample run. A score assigned without ever looking at the image is a
 * different measurement from one assigned with it, and the run has to be able to say which it
 * made. (Cache hits report `false`: an item scored from cache made no fetch to fail.)
 */
async function scoreItem(
  item: NormalizedItem,
  opts: {
    force?: boolean;
    classify?: boolean;
    /** The classify vocabulary. Absent ⇒ the sixteen compile-time TOPICS. */
    topics?: readonly { id: string; label: string }[];
  },
): Promise<{
  score: number;
  tags: string[];
  overFiled: number;
  topics: string[];
  tokens: number;
  imageFetchFailed: boolean;
  /** True when the answer came from the on-disk cache and no fetch of any kind was made. */
  cached: boolean;
}> {
  const classify = opts.classify ?? false;
  const vocabulary = opts.topics ?? TOPICS;
  const cacheFile = path.join(
    CURATION_CACHE_DIR,
    `${curationCacheKey(item, classify)}.json`,
  );

  if (!opts.force) {
    try {
      const cached = JSON.parse(await readFile(cacheFile, "utf-8")) as {
        score: number;
        tags: string[];
        /** Phase 6.3 entries (pre-Cut-1): one topic or null. Read forward, never invalidated. */
        topicId?: string | null;
        /** Cut 1 entries: the array. */
        topics?: string[];
      };
      return {
        score: cached.score,
        tags: cached.tags,
        // `topicId: "botany"` → ["botany"]; `topicId: null` → []. This one line is why Cut 1
        // re-bills zero items — see curationCacheKey's comment before "fixing" it. Capped on the
        // way out (MAX_TOPICS) so a runaway list written before the cap is read forward the same
        // way a fresh answer is parsed — and reported, not re-billed.
        ...capTopics(cached.topics ?? (cached.topicId ? [cached.topicId] : [])),
        tokens: 0,
        imageFetchFailed: false,
        cached: true,
      };
    } catch {
      // no cache entry yet — fall through and call the LLM
    }
  }

  // Multimodal chat messages take an ARRAY of content parts (text + images) instead of a plain
  // string — the standard OpenAI-compatible shape OpenRouter follows. Built up through a named
  // `textPart` (rather than indexing into `content[0]` later) because noUncheckedIndexedAccess
  // would otherwise treat that index as possibly-undefined even though we just pushed it.
  const textPart: { type: "text"; text: string } = {
    type: "text",
    text: itemAsText(item),
  };
  const content: (
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  )[] = [textPart];
  let imageFetchFailed = false;
  if (item.type === "image" && item.imageUrl) {
    // `curationImageUrl` when the source offered one (types.ts, 09-06-26): a smaller rendition
    // of the SAME picture, fetched only to be looked at here. A 1-10 score and four aesthetic
    // tags do not get better at 1280 px than at 500 — the model downsamples anyway — and the
    // Tumblr walks are the case that made it worth wiring: ~90,000 pictures at a mean 649 KB is
    // ~58 GB of somebody else's bandwidth spent on a judgement 500 px would have reached, and
    // every byte of it is time the walk spends not walking. `imageUrl` stays what is stored and
    // shown; this is never a substitute for it. The headers are decided by source (image-auth.ts):
    // Loupe's bearer rides along on either URL, every other source sends none.
    const dataUrl = await imageAsDataUrl(
      item.curationImageUrl ?? item.imageUrl,
      imageFetchHeaders(item.source),
    );
    if (dataUrl)
      content.push({ type: "image_url", image_url: { url: dataUrl } });
    else {
      imageFetchFailed = true;
      textPart.text +=
        "\n(The image could not be fetched — judge from the text alone.)";
    }
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not set — required for curateItems() (add it to .env).",
    );
  }

  let lastErr: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: CURATOR_MODEL,
          messages: [
            {
              role: "system",
              content: classify ? classifyPrompt(vocabulary) : CURATOR_PROMPT,
            },
            { role: "user", content },
          ],
          // Asks the provider to guarantee syntactically valid JSON output.
          response_format: { type: "json_object" },
          temperature: 0.2,
        }),
      });
      if (!res.ok)
        throw new Error(
          `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`,
        );
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: { total_tokens?: number };
      };
      const result = parseCuratorResponse(
        json.choices?.[0]?.message?.content ?? "{}",
        // Validated against the vocabulary actually offered, so an id the model invented — or
        // one from a different run's list — is dropped rather than stored.
        classify
          ? { topicIds: new Set(vocabulary.map((t) => t.id)) }
          : undefined,
      );

      await mkdir(CURATION_CACHE_DIR, { recursive: true });
      await writeFile(cacheFile, JSON.stringify(result));
      return {
        ...result,
        tokens: json.usage?.total_tokens ?? 0,
        imageFetchFailed,
        cached: false,
      };
    } catch (err) {
      lastErr = err;
      if (attempt < 4)
        await sleep(1000 * 3 ** (attempt - 1) + Math.random() * 500);
    }
  }
  throw lastErr;
}

/** Per-source count of items whose image the curator could not fetch and therefore scored from
 *  text alone. Keyed by `item.source`; sources with zero failures are absent. */
export type ImageFetchFailures = Record<string, number>;

/**
 * Stage 2 — LLM-curate a batch of structurally-floored items. Returns items in input order (the
 * caller's collision-resolution / rank logic depends on stable ordering). A hand-rolled
 * concurrency pool: CONCURRENCY workers pull the next index off a shared counter until items run
 * out — the zero-dependency stand-in for p-limit (safe because JS is single-threaded; "parallel"
 * here means overlapping network waits, not threads). A judgment that fails after 4 retries gets
 * a neutral score rather than vanishing from the corpus, logged so a systemic failure is visible.
 *
 * `opts.onImageFetchFailure` is the hook for the *quieter* degradation described on scoreItem: an
 * item whose image couldn't be fetched still gets a score, but from text alone. Ingest counts
 * these per source and prints them, because a source whose images the curator can't pull is a
 * source the feed can't show — and, before Phase 6.2, that condition was completely silent.
 */
export async function curateItems(
  items: NormalizedItem[],
  opts?: {
    force?: boolean;
    /** Phase 6.3 / Cut 1: switches to the classify prompt and fills `topics`. Used by ingest's
     *  walk lane only — corpus-walk items have no seed query to inherit a topic from. */
    classify?: boolean;
    /** The vocabulary classify may answer with (09-06-26). Absent ⇒ the sixteen compile-time
     *  TOPICS; ingest and stats:walk pass every topic in the database. */
    topics?: readonly { id: string; label: string }[];
    onProgress?: (done: number, total: number) => void;
    onImageFetchFailure?: (item: NormalizedItem) => void;
    /** Called once per item answered from the on-disk cache (09-07-26). The companion to
     *  `onImageFetchFailure`: a cache hit reports no failure because it made no fetch, so a
     *  caller that prints "N images failed" can only call zero a *clean* number rather than an
     *  *unmeasured* one if it also knows how many calls were fresh. `stats:walk` is the caller;
     *  its report is documented as free on a second run, and this is what lets it say so. */
    onCacheHit?: (item: NormalizedItem) => void;
    /** Called once per item whose classify answer named more than MAX_TOPICS known topics, with
     *  how many were dropped. Ingest counts these per source and prints them: an over-filing
     *  model is a fact about the prompt-and-blog pairing, and it should show up in the summary
     *  rather than in a topic's membership count months later. */
    onOverFiled?: (item: NormalizedItem, dropped: number) => void;
  },
): Promise<CuratedItem[]> {
  const out: CuratedItem[] = new Array<CuratedItem>(items.length);
  let next = 0;
  let done = 0;

  async function worker() {
    while (next < items.length) {
      const i = next++;
      const item = items[i];
      if (!item) continue;
      try {
        const { score, tags, topics, overFiled, imageFetchFailed, cached } =
          await scoreItem(item, {
            force: opts?.force ?? false,
            classify: opts?.classify ?? false,
            ...(opts?.topics ? { topics: opts.topics } : {}),
          });
        if (cached) opts?.onCacheHit?.(item);
        if (imageFetchFailed) opts?.onImageFetchFailure?.(item);
        if (overFiled > 0) opts?.onOverFiled?.(item, overFiled);
        out[i] = {
          ...item,
          curationScore: score,
          aestheticTags: tags,
          topics,
        };
      } catch (err) {
        console.warn(
          `  curator: ${item.source}:${item.sourceId} "${item.title.slice(0, 40)}" — ${String(err)}`,
        );
        out[i] = {
          ...item,
          curationScore: 5,
          aestheticTags: [],
          topics: [],
        };
      }
      done++;
      opts?.onProgress?.(done, items.length);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker),
  );
  return out;
}
