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
import {
  isWritingKind,
  readingMinutes,
  type WritingKind,
  writingText,
  kindFor,
} from "~/server/config/writing";
import sharp from "sharp";

import {
  CLAUDE_CONCURRENCY,
  CLAUDE_JUDGE_MODEL,
  claudeComplete,
  claudeModelSpec,
  isClaudeModel,
} from "./claude-judge";
import { CuratorAbortError } from "./curator-errors";
import { imageFetchHeaders } from "./image-auth";
import { USER_AGENT } from "./sources/http";
import type { NormalizedItem } from "./sources/types";
import {
  OPENROUTER_ABORT_STATUSES,
  openRouterComplete,
  type OpenRouterContent,
} from "./openrouter";

/** Cheap, vision-capable, fast — curation is thousands of small judgments, not deep reasoning.
 *  Swappable on purpose: the cache key below includes the model, so trying a different judge
 *  never clobbers scores already paid for. */
export const CURATOR_MODEL = "google/gemini-2.5-flash-lite";

/**
 * Which judge a run uses by default (docs/DESIGN_claude-judge-ingest.md D2). `CURATOR_JUDGE=claude`
 * is Haiku through the Claude Code CLI on Ben's subscription; unset or `openrouter` is
 * CURATOR_MODEL, exactly as before. Read at call time, not import time, so a script and a test
 * can both set it. Nothing ever falls back from one to the other on its own: the cache is keyed
 * on the model, and a run that quietly mixed two judges would store scores from two rubrics
 * under one summary.
 */
export function judgeModel(): string {
  // An empty string is "unset" too: that is how a blank line in .env arrives.
  const raw = process.env.CURATOR_JUDGE;
  const judge = raw === undefined || raw === "" ? "openrouter" : raw;
  if (judge === "claude") return CLAUDE_JUDGE_MODEL;
  if (judge === "openrouter") return CURATOR_MODEL;
  throw new Error(
    `CURATOR_JUDGE must be "openrouter" or "claude", got "${judge}"`,
  );
}

/**
 * The Claude judge's model for WRITING (Ben, 10-01-26). Pictures stay on Haiku; writing goes to
 * Sonnet because the calibration said so: under CLAUDE_WRITING_PROMPT v2 Sonnet's error against
 * Ben's marks was 0.88 to Haiku's 1.29 (flash-lite: 1.15), and Haiku gave nearly every essay
 * the same 8, which makes a score useless for ranking essays against each other. Writing is the
 * small half of the corpus, so the dearer model is spent where it is cheap to spend.
 */
export const CLAUDE_WRITING_MODEL = "claude-sonnet-5-5";

/** The model that judges writing under the run's judge — `judgeModel()` for articles. */
export function writingJudgeModel(): string {
  return isClaudeModel(judgeModel()) ? CLAUDE_WRITING_MODEL : CURATOR_MODEL;
}

/**
 * Can these models be called at all? One sentence when not, null when fine — for a script to
 * print and exit on before any walk starts. An OpenRouter model needs the key. A Claude model is
 * asked one tiny question: `claude --version` succeeds on a machine that is logged out or whose
 * token has expired, and the alternative to finding that out here is finding it out after the
 * whole walk, eighty failed spawns in. It costs ~400 tokens of the subscription per run.
 */
export async function judgePreflight(
  models: readonly string[] = [judgeModel(), writingJudgeModel()],
): Promise<string | null> {
  if (models.some((m) => !isClaudeModel(m)) && !process.env.OPENROUTER_API_KEY)
    return "OPENROUTER_API_KEY is not set — required for the OpenRouter judge (add it to .env, or set CURATOR_JUDGE=claude).";
  const claude = models.find(isClaudeModel);
  if (claude) {
    try {
      await claudeComplete({
        model: claudeModelSpec(claude).id,
        system: "Reply with ONLY one JSON object.",
        content: 'Give {"ok":true}',
      });
    } catch (err) {
      return `the Claude judge is not usable — ${err instanceof Error ? err.message : String(err)} (is Claude Code installed, on PATH, and logged in with the subscription?)`;
    }
  }
  return null;
}

/** The longest side a picture is sent to Claude at (D6). The API refuses images over 5 MB and
 *  anything but JPEG/PNG/GIF/WebP; museum originals are routinely both. 1024 px is ~1,400 image
 *  tokens, and a 1–10 score does not improve past it. */
export const CLAUDE_IMAGE_FIT = 1024;

/** Output cap sent on every curator call. The reply is one small JSON object — a score, two to
 *  four short tags, up to three topic ids — well under 100 tokens, so 400 is generous. The number
 *  is not about truncation; it is about **reservation**: OpenRouter reserves `max_tokens` × the
 *  output price against the key's remaining budget *before* dispatching a call, and with no cap
 *  it reserves the model's whole output window (65,535 tokens for flash-lite, ~$0.026 a call).
 *  Twelve in-flight calls therefore needed ~$0.31 of headroom to send ~$0.004 of work, and
 *  kvetchlandia's walk aborted on a 402 ("requested up to 65535 tokens, but can only afford…")
 *  with $2 still on the key (09-16-26). With the cap, a thin balance stops a walk only when it is
 *  actually thin. The Ambit-Admin ecosystem doc has carried "always send max_tokens" since the
 *  archive learned it; this is Ambit finally doing it. */
export const CURATOR_MAX_TOKENS = 400;

/** Bump when CURATOR_PROMPT changes — it's part of the cache key, so a new prompt version
 *  invalidates exactly the responses it should and nothing else. */
export const PROMPT_VERSION = 1;

/** How many curator calls run at once. Chat completions are per-item (no batch endpoint), so
 *  throughput comes from a small concurrency pool instead. */
const CONCURRENCY = 8;

/**
 * OpenRouter statuses that describe the *account*, not the item (09-08-26). 401 is a bad key;
 * 402 is an empty wallet. Neither is transient and neither is per-item, so the retry loop does
 * not retry them and the batch does not absorb them into the score-5 fallback: it aborts, and the
 * ingest exits non-zero with the message. Walk 3 is why. It hit 402 at 18:28 and the curator
 * kept going for eighteen hours — four backoff retries per item, then a neutral score, no tags,
 * no topics — and would have stored 11,500 unscored, un-homed rows under a clean summary if it
 * had reached the write. The same fail-fast rule the Loupe adapter follows for its own 401/403.
 */
export const CURATOR_ABORT_STATUSES: ReadonlySet<number> =
  OPENROUTER_ABORT_STATUSES;

/**
 * The softer guard behind the same lesson: how many curations may fall back *in a row* — no
 * success anywhere between them — before the batch is declared dead for a reason the status
 * code did not name (a provider down for the night, a 429 that never clears, a key revoked
 * mid-run answering 403). A success resets the count, so a source whose records fail
 * sporadically never trips it; only "every request is failing" does. Twenty is well above what
 * eight concurrent workers can produce by bad luck and well below the point where a run has
 * wasted an hour of retries.
 */
export const MAX_CONSECUTIVE_FAILURES = 20;

// Lives in a leaf module so claude-judge.ts can throw it without importing this file back.
export { CuratorAbortError } from "./curator-errors";

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

/** Bump when CLAUDE_CURATOR_PROMPT changes — the Claude judge's picture cache version (`vc<n>`
 *  in curationCacheKey), separate from PROMPT_VERSION so that iterating this rubric never
 *  invalidates a score production holds from the OpenRouter judge. */
export const CLAUDE_PROMPT_VERSION = 4;

/**
 * The picture rubric the Claude judge reads (10-01-26). It comes out of Ben going through the
 * twenty largest disagreements between Haiku and the stored flash-lite scores, one at a time
 * (docs/vision-verdicts.md). Haiku under CURATOR_PROMPT was closer to Ben than flash-lite on 13
 * of 20, and wrong in a few specific ways, each of which is a line here: it scored the caption
 * instead of the photograph (a plain drawer and a glass blob at 8; Ben gave 2), it marked bold
 * popular pictures down (a tiger, a reef painting), and it read a 1960s swimsuit slide as bait.
 * The rest are Ben's rulings from the same sitting: age earns a second look, popular is not a
 * fault, promotional posts score 1. And one more, from the 300-picture comparison (v3): grotesque
 * in the sense of weird is allowed but scored 4-5 so it stays rare, violent gore scores 1-2, and
 * each is TAGGED ("grotesque" / "gore") — the tags are there so a reader's own tolerance can
 * be a setting one day (Ben, 10-01-26; not built).
 *
 * Same curator, same scale, same tags as CURATOR_PROMPT — that string is untouched and still
 * what OpenRouter reads. Check a change with `CURATOR_JUDGE=claude bun run vision:compare`
 * and against the verdicts file, and bump the version above.
 */
export const CLAUDE_CURATOR_PROMPT = `You are the curator of a beloved, long-running art and ideas blog — the kind people used to follow on old Tumblr because every single post was worth stopping for. Your taste: visually striking or quietly beautiful images (strong composition, texture, color, oddness, wit). You post museum objects, illustrations, diagrams, paintings and photographs. Most things a museum digitizes are catalog filler and you skip them without guilt. You never post anything sensational, gory, or engagement-baity.

Rate the following item for your blog on a 1-10 scale:
  1-3  = filler; you would scroll past it (fragments, routine catalog shots, a page of plain text, a shop's product photo, anything promotional)
  4-6  = fine but forgettable; post only on a slow day
  7-8  = good; a solid post your followers would enjoy
  9-10 = exceptional; the kind of find your blog is known for

How to judge — read these carefully:
- Judge the PICTURE you are shown, not what the text says about it. The title and text tell you what you are looking at; they earn nothing by themselves. A dull photograph of an object with a fascinating history — a plain wooden box, a lump of glass with an inventory tag, a title page with no ornament — is still a dull photograph and scores 1-3. The test: cover the title. If you could not tell what the thing is or why it matters from the image alone — a small shapeless object on a white ground, a detail too faint to read — it is a 1-3, whatever the title claims is carved or painted on it. Never tag a quality you cannot see in the image.
- If the picture does not match its title, judge the picture for what it is.
- Bold, colourful, popular or crowd-pleasing is not a fault, and neither is a familiar genre. A dramatic animal photograph — a big cat staring into the lens, teeth bared — is a 7-8: wildlife photography is always a little formulaic and people love it anyway. A dense, saturated painting in a folk, naive or decorative style is a 7-8 when it is vivid and well made; that style is a choice, not a lack of skill. If a picture would make someone stop scrolling, do not score it below 7 for being the kind of thing that is popular.
- Age earns a second look. A photograph that is visibly more than about 25 years old — faded colour, slide or print grain, period clothes and hair — is a document of its time. A family slide, a holiday snapshot, a young woman in a bikini on a beach in the 1960s: these are personal, historical pictures, they score 6-7, and they are NOT engagement bait and must not be tagged as such. Only a recent picture whose sole appeal is an attractive person is bait. A formally strong photograph of a body — cropped to pattern, shape and shadow — is a photograph first, whatever its date.
- Dark material, two cases, and always say which in the tags:
    Grotesque in the sense of WEIRD — surreal, uncanny, macabre, satirical, horror-film imagery, distorted or monstrous bodies with no real bloodshed — is allowed but kept rare: score it 4-5 however well made, and include the tag "grotesque".
    VIOLENT — explicit gore, mutilation, dismemberment, torture, open wounds, stitched or flayed flesh, exposed viscera — scores 1-2, and include the tag "gore". This holds for a painting as much as a photograph: an allegorical, religious or art-historical frame does not turn gore into grotesque. If there is blood and torn flesh, it is gore.
- Promotional posts score 1, however nice the image underneath: a request for donations or support, a sponsored announcement or advertisement for a school, product or sale, a shop or sale announcement, a banner carrying a link. This is about what the POST is, not who posted it: a reader's submission is not promotional, and a picture from a blog that also sells prints or postcards is judged as a picture unless the post itself is announcing something for sale.
- A clever idea in an ordinary snapshot is a 4-6: the picture has to carry it.
- A scrap of text with nothing to look at — a cropped paragraph, a caption — scores 1-3, unless the lettering itself is the picture.
- An unfinished or rough work is judged as it looks, neither up nor down for being unfinished.
- Give every item 2-4 tags, including the ones you score low.

Also give 2-4 short lowercase aesthetic tags describing its look or appeal (e.g. "botanical plate", "hand-lettered", "brutalist", "lurid palette", "quiet portrait", "strange diagram").

Reply with ONLY a JSON object, no code fence and no other text: {"score": <1-10>, "tags": ["...", "..."]}`;

/** The picture rubric for a judge: a `claude-*` model reads CLAUDE_CURATOR_PROMPT. */
export function curatorPrompt(model: string = judgeModel()): string {
  return isClaudeModel(model) ? CLAUDE_CURATOR_PROMPT : CURATOR_PROMPT;
}

/**
 * Sources whose every item passes, whatever a judge says (Ben, 10-01-26): "I would just
 * automatically pass everything from the DOP blog. Every last post and image." A blog is
 * designated because the *blog* was judged worth having, and for this one that judgment
 * outranks any model's opinion of a single post — flash-lite gave a Toshio Saeki a 3. The floor
 * is the score an item is stored with when the judge said less; a higher score is kept, and so
 * are the judge's tags and topics. It applies under either judge, and to the neutral fallback a
 * failed judgment gets. It beats the dark-material rule in CLAUDE_CURATOR_PROMPT too — Ben, asked
 * directly: "bump ALL DOP POSTS up to the 8 threshold whether you think they are dark or not".
 * Rows stored before this date are lifted by `bun run floor:sources --confirm`.
 */
export const SOURCE_SCORE_FLOOR: Partial<Record<string, number>> = {
  doorofperception: 8,
};

function floored(source: string, score: number): number {
  return Math.max(score, SOURCE_SCORE_FLOOR[source] ?? 0);
}

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
  /** Which judge will read it: a `claude-*` model gets CLAUDE_CURATOR_PROMPT underneath. */
  model: string = judgeModel(),
): string {
  const base = curatorPrompt(model);
  return (
    base.slice(0, base.lastIndexOf("Reply with ONLY")) +
    `Also list which of these topics are an honest home for this item — a topic a reader who chose it would be glad to find this in. Best fit first. Usually one or two, never more than three; an empty list is a correct answer. Never force a fit: if none of them is honest, answer [].
${topics.map((t) => `  ${t.id} — ${t.label}`).join("\n")}

The list is long; most of it will not apply — pick only honest homes.

Reply with ONLY a JSON object: {"score": <1-10>, "tags": ["...", "..."], "topics": [<topic ids, best fit first, or empty>]}`
  );
}

/** The prompt over the sixteen compile-time topics — the default when a caller names no
 *  vocabulary, and what the prompt-slicing comment above is about. */
export const CLASSIFY_PROMPT = classifyPrompt(TOPICS, CURATOR_MODEL);

/** Bump when WRITING_PROMPT changes. Part of the writing cache key only — the image prompt's
 *  PROMPT_VERSION and its keys are untouched by anything the writing curator does. */
export const WRITING_PROMPT_VERSION = 2;

/**
 * The writing curator's rubric (docs/DESIGN_writing.md D1) — a product artifact like
 * CURATOR_PROMPT, and the thing Ben's calibration (`bun run writing:calibrate`) tunes. It exists
 * because CURATOR_PROMPT is an image-taste rubric: Wikipedia averaged 5.2 under it against 7.5-8.7
 * for picture sources, a third of it sitting at 4, the floor. Change it, bump
 * WRITING_PROMPT_VERSION, re-run the calibration.
 *
 * What it adds beyond a score is a **kind** (D2), which is what a writing card's badge says.
 *
 * It also asks how a piece ages ("timeless" / "dated" / "news"), and **nothing reads the answer
 * any more**. That verdict was how the feed stayed news-free — a `news` piece was dropped at
 * ingest and demoted to 1 at re-score — until Ben dropped the rule on 09-30-26: he keeps news out
 * by choosing sources, and what the curator called news was mostly contemporary subjects (albums,
 * films, a World Cup). The text stays in the prompt only because the prompt is the cache key:
 * editing it re-bills every answer production holds and re-opens the calibration. Strip it the
 * next time the prompt changes for a reason of its own.
 */
export const WRITING_PROMPT = `You are the editor of a beloved newsletter of long reads and curiosities — the kind people stay subscribed to for years because every piece in it was worth their evening. You read everything: encyclopedia articles, essays, criticism, profiles, poems, old magazine clippings, archival documents. Your taste: writing with a spark of "huh, I never knew that", a voice worth listening to, and staying power — a piece someone could read in five years and still be glad they did. Longform contemporary journalism from a reputable outlet is welcome when it has that staying power. You never run anything sensational, gory, or engagement-baity. And you are not a news service: a piece whose reason to exist is a recent event is news, however well written.

Rate the following piece for your newsletter on a 1-10 scale:
  1-3  = filler; you would not read past the first paragraph (lists of facts with no thread, boilerplate, garbled text)
  4-6  = fine but forgettable; run it only on a slow week
  7-8  = good; your readers would be glad to find it
  9-10 = exceptional; the kind of piece your newsletter is known for

Judge the writing and the idea, not the length: a short piece with a real spark can outscore a long dutiful one. Your readers especially love small, specific facts about obscure things — a single odd instrument, a plant part, a forgotten institution, a place they have never heard of. A short encyclopedia entry about something like that is a puzzle piece, a shard of the world, and scores 7-8 on its subject alone; being brief is never a reason to mark it down.

Say what kind of piece it is — exactly one of:
  "essay" — an essay or long read: an argument, a narrative, reporting with a point of view
  "curiosity" — an odd, surprising or delightful subject explained: a strange history, an unlikely fact, a thing you never knew existed
  "criticism" — criticism or a profile: writing about a particular work, artist, writer or maker
  "archive" — a poem, or a document from the past read for itself: a historical text, a clipping, a primary source

Say how it ages — exactly one of:
  "timeless" — reads as well in ten years as today
  "dated" — tied to its moment, but still worth reading
  "news" — exists because of a recent event; its value expires with the news cycle

Also give 2-4 short lowercase tags for its subject or appeal (e.g. "odd history", "lost technology", "folk belief", "quiet biography", "strange science").

Reply with ONLY a JSON object: {"score": <1-10>, "tags": ["...", "..."], "kind": "<kind>", "timeliness": "<timeliness>", "topics": [<topic ids, best fit first, or empty>]}`;

/** Bump when CLAUDE_WRITING_PROMPT changes — it is the Claude judge's writing cache version
 *  (`wc<n>` in writingCacheKey), separate from WRITING_PROMPT_VERSION on purpose: iterating this
 *  rubric must never invalidate an answer production holds from the OpenRouter judge. */
export const CLAUDE_WRITING_PROMPT_VERSION = 2;

/**
 * The writing rubric the Claude judge reads (docs/DESIGN_claude-judge-ingest.md, Results;
 * 10-01-26). It exists because WRITING_PROMPT failed its calibration under Claude: against Ben's
 * 34 marks Haiku was 1.4 points harsher on average and two points harsher on Wikipedia, and
 * neither thinking nor Sonnet moved it. WRITING_PROMPT v2 was tuned to Ben's marks *through
 * flash-lite*, a generous reader; Claude takes "highly selective" and "fine but forgettable" at
 * their word and files a sound encyclopedia entry at 4-5, where Ben put 7-8.
 *
 * So this is the same editor with the scale spelled out the way Ben used it: the subject is
 * what is judged, an encyclopedia's plain tone is not a fault, length moves nothing, and the top
 * of the scale is meant to be used. It drops the `timeliness` question, which nothing has read
 * since 09-30-26 (WRITING_PROMPT keeps it only for its cache). Tune it with
 * `bun run writing:calibrate --rescore --models …,claude-haiku-4-5-20251001`, and bump the
 * version above with every edit.
 */
export const CLAUDE_WRITING_PROMPT = `You are choosing pieces for a beloved newsletter of long reads and curiosities — the kind people stay subscribed to for years. Its readers are curious generalists: they like learning that a thing exists. They read encyclopedia articles for pleasure as readily as essays. You read everything for them: encyclopedia articles, essays, criticism, profiles, poems, old magazine clippings, archival documents. You never run anything sensational, gory, or engagement-baity.

Rate the following piece for the newsletter on a 1-10 scale. The question is "would a curious reader be glad they found this?" — not "is this fine prose?".
  1-3  = unusable: garbled or fragmentary text, boilerplate, a bare list with nothing to follow
  4-5  = readable but nothing in it: no subject a reader would remember tomorrow
  6    = worth running for a narrow audience: accurate and specialist, of interest mainly to people already in the field
  7-8  = good; readers would be glad to find it. This is where a sound piece about an interesting subject belongs
  9-10 = the kind of piece the newsletter is known for: a rich subject told well, or an essay with a real voice and a story

How to use the scale — read this carefully, because the common mistake is to score too low:
- Judge the SUBJECT and what a reader learns, not the tone. An encyclopedia article is plain and neutral on purpose. Never mark a piece down for reading like an encyclopedia, for lacking a narrative voice, or for being a survey.
- An encyclopedia article about a real, specific thing — a place, an institution, a natural phenomenon, a technique, a plant part, an instrument, a mythology — scores 7-8 on its subject alone: 8 when the subject has pull of its own (space, myth, language and etymology, a place with a long history, a small odd fact about the natural world), 7 when it is solid but plainer (a pottery, a company archive, an engineering concept). Go to 9 when the subject is broad and rich enough to get lost in (a whole mythology, a famous figure of legend). Drop to 6 only when it is technical enough that most readers would bounce off it.
- Length is not a reason to move a score in either direction. A two-paragraph entry about an obscure observatory project or a survey of asteroids is a small shard of the world and scores 7-8 exactly as a long one would; a stub is only a problem when it says nothing at all. A long country or regional history is not "dutiful"; it is a place the reader has never been.
- A well-made essay from a literary or historical review starts at 8, and 8 is for the ones that are competent and no more: an appreciation of a writer, a survey of a theme. Give 9 when the essay tells a story — a strange life, a hoax, a forgotten episode, a mystery followed to its end — which most good essays of this kind do. Give 10 to the rare one you would send to a friend that night. Do not give every essay the same score.
- Most pieces you are shown have already passed a filter. Expect most scores to be 7 or higher; scores below 6 are for text that is broken, empty, or genuinely dull.

Say what kind of piece it is — exactly one of:
  "essay" — an essay or long read: an argument, a narrative, reporting with a point of view
  "curiosity" — a subject explained: a strange history, an unlikely fact, a thing you never knew existed. Encyclopedia articles are almost always this
  "criticism" — criticism or a profile: writing about a particular work, artist, writer or maker
  "archive" — a poem, or a document from the past read for itself: a historical text, a clipping, a primary source

Also give 2-4 short lowercase tags for its subject or appeal (e.g. "odd history", "lost technology", "folk belief", "quiet biography", "strange science").

Reply with ONLY a JSON object, no code fence and no other text: {"score": <1-10>, "tags": ["...", "..."], "kind": "<kind>", "topics": [<topic ids, best fit first, or empty>]}`;

/** WRITING_PROMPT with the topic block classify mode uses, over the vocabulary given. Writing
 *  always classifies — in the search lane too — because an article's seed topic is one keyword's
 *  guess and the curator has read the piece. */
export function writingPrompt(
  topics: readonly { id: string; label: string }[],
  /** Which judge will read it: a `claude-*` model gets CLAUDE_WRITING_PROMPT. */
  model: string = writingJudgeModel(),
): string {
  const base = isClaudeModel(model) ? CLAUDE_WRITING_PROMPT : WRITING_PROMPT;
  const at = base.lastIndexOf("Reply with ONLY");
  return (
    base.slice(0, at) +
    `Also list which of these topics are an honest home for this piece — a topic a reader who chose it would be glad to find it in. Best fit first. Usually one or two, never more than three; an empty list is a correct answer. Never force a fit.
${topics.map((t) => `  ${t.id} — ${t.label}`).join("\n")}

The list is long; most of it will not apply — pick only honest homes.

` +
    base.slice(at)
  );
}

export type CuratedItem = NormalizedItem & {
  curationScore: number;
  aestheticTags: string[];
  /** Cut 1: the classify mode's answer for corpus-walk items — every honest topic, best fit
   *  first, possibly none. Ingest stores the item either way: `topics[0] ?? null` becomes the
   *  display `topic_id`, every entry becomes an `item_topic` row, and an empty list is counted as
   *  un-homed. Always `[]` outside classify mode — a search-shaped item's topic comes from the
   *  seed query that surfaced it. */
  topics: string[];
  /** Writing only (type 'article'): the writing curator's kind, null when it named none. */
  kind?: WritingKind | null;
  /** Writing only: `readingMinutes(body)`, null without a body. */
  readingMinutes?: number | null;
};

/** Structural-floor drop reasons, each mapped to a Phase 0.4 finding (see phase0/NOTES.md). */
export type StructuralDropRule =
  "dup-title" | "bare-title" | "thin-summary" | "donation";

/** Where a blog asks for money. */
const DONATION_LINK = /(ko-fi\.com|patreon\.com|buymeacoffee\.com|paypal\.me)/i;

/**
 * A post that is only a request for donations (Ben, 10-01-26): a blog's "support this page"
 * banner, titled and captioned with its Ko-fi link. Two of them sat in the feed at score 6 —
 * flash-lite saw vintage imagery and missed that it was a banner. A judge could score them 1,
 * but there is nothing to judge: they are dropped here, free, before any model is asked. Narrow
 * on purpose — the link has to be the TITLE, or the whole summary — so a real post whose long
 * caption ends "more on patreon.com/…" is untouched. Exported for `bun run drop:donations`,
 * which removes the rows stored before this rule existed.
 */
export function isDonationPost(
  item: Pick<NormalizedItem, "title" | "summary">,
): boolean {
  if (DONATION_LINK.test(item.title)) return true;
  const summary = item.summary.trim();
  return !/\s/.test(summary) && DONATION_LINK.test(summary);
}

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
    const rule: StructuralDropRule | null = isDonationPost(item)
      ? "donation"
      : (titleCounts.get(norm) ?? 0) > 2 && !isWalkSource(item.source)
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

/** The writing floor's one rule (docs/PLAN_writing.md Phase 1). */
export type WritingDropRule = "thin-text";

/** Below this many characters of prose there is nothing to read — a stub, a disambiguation line,
 *  a clipping fragment. Decided 09-28-26 with no exemption: a haiku won't clear it, and that is
 *  accepted. */
export const WRITING_MIN_CHARS = 400;

/**
 * The full text of a writing item, when ingest holds one: the stored `body`, else a link-card
 * publication's never-stored `curationText` (types.ts, writing Phase 5). NULL for a piece Ambit
 * has only a dek for. What the floor, the curator and the reading time all read.
 */
export function writingBody(item: NormalizedItem): string | null {
  if (item.body?.trim()) return item.body;
  if (item.curationText?.trim()) return item.curationText;
  return null;
}

/** What the writing curator reads: the full text when ingest holds one, else the summary. */
function writingSource(item: NormalizedItem): string {
  return writingBody(item) ?? item.summary;
}

/**
 * The writing floor — free, pure, per item, and articles only. `thin-text`: fewer than
 * WRITING_MIN_CHARS characters of prose once the apparatus is stripped (`writingText`), read off
 * the body when there is one. It sits after structuralFloor and before the curator, so nothing it
 * drops is billed, and it runs on whatever text ingest holds at that point: once Phase 2 fetches
 * Wikipedia bodies at ingest, that fetch goes in front of this, which is how an article whose
 * summary is one line but whose body is long survives it.
 */
export function writingFloor(items: NormalizedItem[]): {
  kept: NormalizedItem[];
  dropped: { item: NormalizedItem; rule: WritingDropRule }[];
} {
  const kept: NormalizedItem[] = [];
  const dropped: { item: NormalizedItem; rule: WritingDropRule }[] = [];
  for (const item of items) {
    if (
      item.type === "article" &&
      writingText(writingSource(item)).length < WRITING_MIN_CHARS
    )
      dropped.push({ item, rule: "thin-text" });
    else kept.push(item);
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
  /** Claude path only: downscale to fit inside this many pixels and re-encode as JPEG. */
  fit?: number,
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
      const bytes = Buffer.from(await res.arrayBuffer());
      if (fit) {
        // The Claude path (D6): one known format at one bounded size. `rotate()` applies the
        // EXIF orientation before the metadata is dropped. A file sharp cannot decode returns
        // null — the caller's "judge from the text alone" branch, counted per source like any
        // other picture the curator could not look at.
        try {
          const jpeg = await sharp(bytes)
            .rotate()
            .resize(fit, fit, { fit: "inside", withoutEnlargement: true })
            // JPEG has no alpha, and sharp's default ground is black: line art or a diagram on
            // a transparent PNG would reach the model as a black rectangle.
            .flatten({ background: "#ffffff" })
            .jpeg({ quality: 80 })
            .toBuffer();
          return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
        } catch {
          return null;
        }
      }
      return `data:${mime};base64,${bytes.toString("base64")}`;
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
 *
 * `model` defaults to the run's judge (`judgeModel()`), which under the unset default is
 * `CURATOR_MODEL`, so every key written before 10-01-26 is unchanged.
 */
export function curationCacheKey(
  item: Pick<NormalizedItem, "source" | "sourceId">,
  classify: boolean,
  model: string = judgeModel(),
): string {
  const mode = classify ? "classify|" : "";
  return createHash("sha256")
    .update(
      // `vc<n>` for a Claude model: its picture rubric has a version of its own.
      `${model}|${isClaudeModel(model) ? `vc${CLAUDE_PROMPT_VERSION}` : `v${PROMPT_VERSION}`}|${mode}${item.source}:${item.sourceId}`,
    )
    .digest("hex")
    .slice(0, 32);
}

// ── the writing curator (docs/DESIGN_writing.md D1) ─────────────────────────

/** How much of a piece the writing curator reads — enough for its voice and its thread, well
 *  inside a cheap model's context, and a bound on what one call can cost. */
export const WRITING_TEXT_CHARS = 8_000;

/**
 * Parse one writing-curator reply. Everything `parseCuratorResponse` enforces still holds — the
 * score clamp, the tag coercion, topics validated against the vocabulary and capped at
 * MAX_TOPICS — so it is called first, then the kind is read on top. An unknown kind is null (the
 * badge falls back to plain `READ`). The reply's `timeliness` is ignored — the prompt still asks
 * for it, nothing acts on it (see WRITING_PROMPT).
 */
export function parseWritingResponse(
  content: string,
  opts: { topicIds: ReadonlySet<string> },
): {
  score: number;
  tags: string[];
  kind: WritingKind | null;
  topics: string[];
  overFiled: number;
} {
  const base = parseCuratorResponse(content, opts);
  const record = JSON.parse(content) as Record<string, unknown>;
  return {
    score: base.score,
    tags: base.tags,
    kind: isWritingKind(record.kind) ? record.kind : null,
    topics: base.topics,
    overFiled: base.overFiled,
  };
}

/**
 * The writing cache key: `model | w<version> | writing | source:sourceId`, through the same
 * sha256 as `curationCacheKey`. A namespace of its own, so no image key moves (a test pins two),
 * and **keyed on the model** — the calibration runs flash-lite and flash side by side, and each
 * answer is paid for once. Like the image key it is not keyed on the topic list.
 */
export function writingCacheKey(
  item: Pick<NormalizedItem, "source" | "sourceId">,
  model: string = writingJudgeModel(),
): string {
  return createHash("sha256")
    .update(
      // `wc<n>` for a Claude model: its rubric has a version of its own (CLAUDE_WRITING_PROMPT).
      `${model}|${isClaudeModel(model) ? `wc${CLAUDE_WRITING_PROMPT_VERSION}` : `w${WRITING_PROMPT_VERSION}`}|writing|${item.source}:${item.sourceId}`,
    )
    .digest("hex")
    .slice(0, 32);
}

/**
 * What the writing curator reads: the full text when ingest holds one (`writingBody`: the body,
 * else a publication's `curationText`), else the summary, with the encyclopedia's apparatus stripped (`writingText`), cut at WRITING_TEXT_CHARS. `Length:` is
 * counted on the whole stripped text so the model knows a long piece is long even though it
 * sees only its opening. The summary is sent separately only when there is a body — otherwise
 * it IS the text. No image: writing is judged as writing, and not fetching Wikipedia's lead
 * images keeps the curator clear of Wikimedia's thumbnail-rendering throttle.
 */
export function writingAsText(item: NormalizedItem): string {
  const full = writingBody(item);
  const hasBody = full !== null;
  const text = writingText(full ?? item.summary);
  const words = text.split(/\s+/).filter(Boolean).length;
  return [
    `Source: ${item.source}`,
    `Title: ${item.title}`,
    item.tags.length ? `Tags: ${item.tags.slice(0, 8).join(", ")}` : null,
    hasBody && item.summary.trim() ? `Summary: ${item.summary}` : null,
    `Length: ~${words} words`,
    `Text: ${text.slice(0, WRITING_TEXT_CHARS)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** One writing-curator call for one article, cache-aside — scoreItem's counterpart for
 *  `type = 'article'`. Always classifies. */
async function scoreWriting(
  item: NormalizedItem,
  opts: {
    force?: boolean;
    topics?: readonly { id: string; label: string }[];
    model?: string;
  },
): Promise<{
  score: number;
  tags: string[];
  kind: WritingKind | null;
  topics: string[];
  overFiled: number;
  cached: boolean;
}> {
  const vocabulary = opts.topics ?? TOPICS;
  const model = opts.model ?? writingJudgeModel();
  const topicIds = new Set(vocabulary.map((t) => t.id));
  const cacheFile = path.join(
    CURATION_CACHE_DIR,
    `${writingCacheKey(item, model)}.json`,
  );

  if (!opts.force) {
    try {
      // Re-parsed rather than trusted: the same validation a fresh answer gets.
      const cached = await readFile(cacheFile, "utf-8");
      return { ...parseWritingResponse(cached, { topicIds }), cached: true };
    } catch {
      // no cache entry yet — fall through and call the LLM
    }
  }

  const { result } = await callCurator(
    {
      model,
      system: writingPrompt(vocabulary, model),
      content: writingAsText(item),
    },
    (reply) => parseWritingResponse(reply, { topicIds }),
  );
  await mkdir(CURATION_CACHE_DIR, { recursive: true });
  await writeFile(cacheFile, JSON.stringify(result));
  return { ...result, cached: false };
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
  /** True when the score was reached from text alone — now, or when the cached answer was made. */
  textOnly: boolean;
  /** True when the answer came from the on-disk cache and no fetch of any kind was made. */
  cached: boolean;
}> {
  const classify = opts.classify ?? false;
  const vocabulary = opts.topics ?? TOPICS;
  const model = judgeModel();
  const cacheFile = path.join(
    CURATION_CACHE_DIR,
    `${curationCacheKey(item, classify, model)}.json`,
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
        /** 10-01-26: the picture could not be looked at when this was judged. */
        textOnly?: boolean;
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
        textOnly: cached.textOnly === true,
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
      isClaudeModel(model) ? CLAUDE_IMAGE_FIT : undefined,
    );
    if (dataUrl)
      content.push({ type: "image_url", image_url: { url: dataUrl } });
    else {
      imageFetchFailed = true;
      textPart.text +=
        "\n(The image could not be fetched — judge from the text alone.)";
    }
  }

  const { result, tokens } = await callCurator(
    {
      model,
      system: classify
        ? classifyPrompt(vocabulary, model)
        : curatorPrompt(model),
      content,
    },
    (reply) =>
      parseCuratorResponse(
        reply,
        // Validated against the vocabulary actually offered, so an id the model invented — or
        // one from a different run's list — is dropped rather than stored.
        classify
          ? { topicIds: new Set(vocabulary.map((t) => t.id)) }
          : undefined,
      ),
  );
  await mkdir(CURATION_CACHE_DIR, { recursive: true });
  // `textOnly` is remembered in the envelope (10-01-26). `imageFetchFailed` cannot be: it means
  // "a fetch failed in THIS run", and a cache hit makes no fetch. But a score reached without
  // looking at the picture is a different measurement for as long as it is cached, and
  // `vision:compare` has to be able to leave it out on a second run as well as on the first.
  await writeFile(
    cacheFile,
    JSON.stringify(imageFetchFailed ? { ...result, textOnly: true } : result),
  );
  return {
    ...result,
    tokens,
    imageFetchFailed,
    textOnly: imageFetchFailed,
    cached: false,
  };
}

type CuratorContent = OpenRouterContent;

/**
 * One curator judgement, with the retry loop and the fail-fast rule both curators and both
 * transports share. The transport is chosen by the model's name (D1): `claude-*` is the Claude
 * Code CLI on the subscription, anything else OpenRouter. `parse` runs inside the retry, so a
 * reply that isn't usable JSON (or has no usable score) is retried like a network error rather
 * than cached. CuratorAbortError goes straight through — an empty wallet on one side, the
 * subscription's ceiling on the other.
 */
async function callCurator<T>(
  req: { model: string; system: string; content: CuratorContent },
  parse: (reply: string) => T,
): Promise<{ result: T; tokens: number }> {
  // Reserved against the key's budget before dispatch — see CURATOR_MAX_TOKENS.
  const complete = isClaudeModel(req.model)
    ? claudeComplete
    : (r: typeof req) =>
        openRouterComplete({ ...r, maxTokens: CURATOR_MAX_TOKENS });
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const { reply, tokens } = await complete(req);
      return { result: parse(reply), tokens };
    } catch (err) {
      if (err instanceof CuratorAbortError) throw err;
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
 * Two failures are not absorbed that way (09-08-26): an account-level status (401/402 — see
 * CURATOR_ABORT_STATUSES) and MAX_CONSECUTIVE_FAILURES fallbacks in a row. Both throw
 * CuratorAbortError out of this function, every worker stops, and the caller writes nothing.
 * "Logged so a systemic failure is visible" turned out to need a reader; the abort does not.
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
    /** The model the writing curator uses (default CURATOR_MODEL). The calibration script's
     *  lever — the image curator never reads it. */
    writingModel?: string;
    onProgress?: (done: number, total: number) => void;
    onImageFetchFailure?: (item: NormalizedItem) => void;
    /** Called for every image item whose score was reached without the picture — on the fresh
     *  call (alongside `onImageFetchFailure`) and on every later cache hit of that answer. */
    onTextOnly?: (item: NormalizedItem) => void;
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
  // Fallbacks since the last success, across all workers. Reset by any success.
  let consecutiveFailures = 0;
  // Set by the first worker to abort. Promise.all rejects on that worker's throw, but the other
  // seven would otherwise keep pulling items — and keep billing, or keep 402ing — until the
  // process exits. Checked at the top of every loop so they stop within one item.
  let aborted = false;

  async function worker() {
    while (!aborted && next < items.length) {
      const i = next++;
      const item = items[i];
      if (!item) continue;
      try {
        // Writing (type 'article') goes to the writing curator, which always classifies and reads
        // the body; everything else to the image curator, exactly as before (docs/DESIGN_writing.md D1).
        if (item.type === "article") {
          const w = await scoreWriting(item, {
            force: opts?.force ?? false,
            ...(opts?.topics ? { topics: opts.topics } : {}),
            ...(opts?.writingModel ? { model: opts.writingModel } : {}),
          });
          if (w.cached) opts?.onCacheHit?.(item);
          if (w.overFiled > 0) opts?.onOverFiled?.(item, w.overFiled);
          consecutiveFailures = 0;
          out[i] = {
            ...item,
            curationScore: floored(item.source, w.score),
            aestheticTags: w.tags,
            topics: w.topics,
            kind: kindFor(item.source, w.kind),
            readingMinutes: readingMinutes(writingBody(item)),
          };
        } else {
          const {
            score,
            tags,
            topics,
            overFiled,
            imageFetchFailed,
            textOnly,
            cached,
          } = await scoreItem(item, {
            force: opts?.force ?? false,
            classify: opts?.classify ?? false,
            ...(opts?.topics ? { topics: opts.topics } : {}),
          });
          if (cached) opts?.onCacheHit?.(item);
          if (imageFetchFailed) opts?.onImageFetchFailure?.(item);
          if (textOnly) opts?.onTextOnly?.(item);
          if (overFiled > 0) opts?.onOverFiled?.(item, overFiled);
          consecutiveFailures = 0;
          out[i] = {
            ...item,
            curationScore: floored(item.source, score),
            aestheticTags: tags,
            topics,
          };
        }
      } catch (err) {
        if (err instanceof CuratorAbortError) {
          aborted = true;
          throw err;
        }
        console.warn(
          `  curator: ${item.source}:${item.sourceId} "${item.title.slice(0, 40)}" — ${String(err)}`,
        );
        if (++consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          aborted = true;
          throw new CuratorAbortError(
            `curator: ${consecutiveFailures} consecutive curations failed with no success between them (last: ${String(err)}) — aborting the batch; nothing written`,
          );
        }
        out[i] = {
          ...item,
          curationScore: floored(item.source, 5),
          aestheticTags: [],
          topics: [],
          ...(item.type === "article"
            ? { kind: null, readingMinutes: readingMinutes(writingBody(item)) }
            : {}),
        };
      }
      done++;
      opts?.onProgress?.(done, items.length);
    }
  }

  // A Claude judgment is a process, not a socket — half the pool (claude-judge.ts).
  const claude =
    isClaudeModel(judgeModel()) ||
    isClaudeModel(opts?.writingModel ?? writingJudgeModel());
  // allSettled, not all (10-01-26): when one worker aborts, the others may be mid-judgment.
  // Promise.all would reject at once and the script would exit with their answers unwritten;
  // waiting lets each finish its item and cache it (`aborted` stops them taking another), so
  // the re-run really does resume where this one stopped.
  const settled = await Promise.allSettled(
    Array.from(
      {
        length: Math.min(
          claude ? CLAUDE_CONCURRENCY : CONCURRENCY,
          items.length,
        ),
      },
      worker,
    ),
  );
  const failed = settled.find((s) => s.status === "rejected");
  if (failed) throw failed.reason;
  return out;
}
