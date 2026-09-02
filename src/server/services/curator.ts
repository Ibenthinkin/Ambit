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

/** The sixteen ids the classify mode may answer with. Built from config so a topic added to
 *  TOPICS is automatically a legal answer, and anything else the model says is not. */
export const TOPIC_IDS: ReadonlySet<string> = new Set(TOPICS.map((t) => t.id));

/**
 * Phase 6.3's classify mode: the SAME rubric with a topic block appended. Used only for
 * corpus-walk items (blogs), which arrive with no topic because no seed query surfaced them; the
 * museum path never sees this prompt, so its scores and cache are untouched. Built by slicing
 * rather than editing CURATOR_PROMPT, because that string is a product artifact carrying Ben's
 * taste calibration (SPEC §15) and is not implementation detail to be reworded.
 *
 * "or null" is the important clause (D4): a post with no honest home among the sixteen is dropped
 * by ingest, never force-fitted — topic_id is the feed's unit of drift, and a psychedelia post
 * filed under botany teaches the drift graph something false.
 */
export const CLASSIFY_PROMPT =
  CURATOR_PROMPT.slice(0, CURATOR_PROMPT.lastIndexOf("Reply with ONLY")) +
  `Also file this item under exactly ONE of these topics — the one a reader who chose that topic would be glad to find it in — or null if none is an honest home. Never force a fit.
${TOPICS.map((t) => `  ${t.id} — ${t.label}`).join("\n")}

Reply with ONLY a JSON object: {"score": <1-10>, "tags": ["...", "..."], "topic": <topic id or null>}`;

export type CuratedItem = NormalizedItem & {
  curationScore: number;
  aestheticTags: string[];
  /** Phase 6.3: the classify mode's answer for corpus-walk items; always null outside it. Ingest
   *  drops a walk item whose topicId is null and counts it. Search-shaped items ignore this field
   *  — their topic comes from the seed query that surfaced them. */
  topicId: string | null;
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
    const rule: StructuralDropRule | null =
      (titleCounts.get(norm) ?? 0) > 2 && !isWalkSource(item.source)
        ? "dup-title"
        : item.type === "image" && norm.split(" ").length <= 1
          ? "bare-title"
          : item.summary.trim().length < 60
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
    `Text: ${item.summary}`,
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
 */
async function imageAsDataUrl(url: string): Promise<string | null> {
  for (const candidate of [url, encodeURI(url)]) {
    try {
      const res = await fetch(candidate, {
        headers: { "User-Agent": USER_AGENT },
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
  topicId: string | null;
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

  // Only meaningful in classify mode, and even then only a KNOWN id passes — the model is capable
  // of inventing "psychedelia", and a foreign-key error deep into an ingest run is the worst place
  // to learn that. Anything else is the honest reject: null.
  const topicId =
    opts?.topicIds &&
    typeof record.topic === "string" &&
    opts.topicIds.has(record.topic)
      ? record.topic
      : null;

  return { score, tags, topicId };
}

// Cache dir lives at the repo root (not under src/), same cache-aside pattern as phase0's
// scripts — a second ingest run of an item already scored bills zero tokens. Resolved from
// process.cwd() rather than import.meta.url because, unlike phase0's fixed-location scripts,
// this module is imported both by scripts/ingest.ts and by tests; cwd is always the repo root
// for `bun run` invocations either way.
const CACHE_DIR = path.join(process.cwd(), ".cache", "curation");

function cacheKey(item: NormalizedItem, classify: boolean): string {
  // The default-mode key is byte-identical to Phase 3's so no museum item is ever re-billed;
  // classify mode gets its own namespace because its answer carries one more field.
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
  opts: { force?: boolean; classify?: boolean },
): Promise<{
  score: number;
  tags: string[];
  topicId: string | null;
  tokens: number;
  imageFetchFailed: boolean;
}> {
  const classify = opts.classify ?? false;
  const cacheFile = path.join(CACHE_DIR, `${cacheKey(item, classify)}.json`);

  if (!opts.force) {
    try {
      const cached = JSON.parse(await readFile(cacheFile, "utf-8")) as {
        score: number;
        tags: string[];
        topicId?: string | null;
      };
      return {
        score: cached.score,
        tags: cached.tags,
        topicId: cached.topicId ?? null,
        tokens: 0,
        imageFetchFailed: false,
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
    const dataUrl = await imageAsDataUrl(item.imageUrl);
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
              content: classify ? CLASSIFY_PROMPT : CURATOR_PROMPT,
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
        classify ? { topicIds: TOPIC_IDS } : undefined,
      );

      await mkdir(CACHE_DIR, { recursive: true });
      await writeFile(cacheFile, JSON.stringify(result));
      return {
        ...result,
        tokens: json.usage?.total_tokens ?? 0,
        imageFetchFailed,
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
    /** Phase 6.3: switches to CLASSIFY_PROMPT and fills `topicId`. Used by ingest's walk lane
     *  only — corpus-walk items have no seed query to inherit a topic from. */
    classify?: boolean;
    onProgress?: (done: number, total: number) => void;
    onImageFetchFailure?: (item: NormalizedItem) => void;
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
        const { score, tags, topicId, imageFetchFailed } = await scoreItem(
          item,
          { force: opts?.force ?? false, classify: opts?.classify ?? false },
        );
        if (imageFetchFailed) opts?.onImageFetchFailure?.(item);
        out[i] = {
          ...item,
          curationScore: score,
          aestheticTags: tags,
          topicId,
        };
      } catch (err) {
        console.warn(
          `  curator: ${item.source}:${item.sourceId} "${item.title.slice(0, 40)}" — ${String(err)}`,
        );
        out[i] = {
          ...item,
          curationScore: 5,
          aestheticTags: [],
          topicId: null,
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
