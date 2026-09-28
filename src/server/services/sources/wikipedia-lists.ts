// Wikipedia's reading lists (docs/PLAN_writing.md Phase 2 §3, DESIGN D4). Keyword search returns
// definition pages ("Pedicel (botany)"); these four lists are Wikipedia's own editors saying
// "this one is worth reading", which is the thing a writing feed wants:
//
//   list:unusual   — the entries of `Wikipedia:Unusual articles`' topical subpages: each table
//                    row's bolded opening link, never the links in its description. The root
//                    page is a hub; the entries live on ~16 subpages (probed 09-28-26: `allpages`
//                    finds all of them, `prefixsearch` missed /Phobias).
//   list:featured  — `Category:Featured articles` (~7,000, all namespace 0 — probed).
//   list:good      — `Category:Good articles` (~45,000, all namespace 0 — probed).
//   list:dyk       — one month of `Wikipedia:Did you know archive/YYYY/Month` (2004 onward), its
//                    hooks' bolded targets, each hook kept as the card's summary.
//
// Every list keeps the search shape: `wikipedia.search("list:featured")` routes here, and what
// comes back is page ids — the same `sourceId` a keyword hit has, so `(source, source_id)` dedupe
// holds across both paths. The chosen pages then go through search()'s existing detail + license
// steps.
//
// **A fresh slice each night, cheaply.** Candidates are ordered by `md5(pageid | day)` and the
// caller takes the first `limit`. For the two categories the plan's first idea — list all 45,000
// Good articles and md5-order them — is ~90 list calls to use twenty; instead each night starts
// the category walk at a day-seeded two-letter sort-key prefix and takes one page of 500 (decided
// 09-28-26 on the probe; one call, a different stretch of the alphabet each night).

import { createHash } from "node:crypto";

import { hashSeed } from "~/server/services/random";
import { fetchJson } from "./http";

const WIKI_API = "https://en.wikipedia.org/w/api.php";
const Q = `${WIKI_API}?action=query&format=json&formatversion=2`;

export const WIKI_LISTS = ["unusual", "dyk", "featured", "good"] as const;
export type WikiList = (typeof WIKI_LISTS)[number];

/** A page a list offers. `hook` is set for DYK only — the card's summary. */
export type ListCandidate = { pageid: number; title: string; hook?: string };

/** `list:<name>` → the list, anything else → null (an ordinary keyword search). */
export function parseListQuery(query: string): WikiList | null {
  const m = /^list:(\w+)$/.exec(query.trim());
  return m && (WIKI_LISTS as readonly string[]).includes(m[1]!)
    ? (m[1] as WikiList)
    : null;
}

/** The night's order: by `md5(pageid | day)`. Stable within a day, reshuffled across days. */
export function drawOrder<T extends { pageid: number }>(
  items: readonly T[],
  day: string,
): T[] {
  const key = (p: number) =>
    createHash("md5").update(`${p}|${day}`).digest("hex");
  return items
    .map((it) => [key(it.pageid), it] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([, it]) => it);
}

// ── Unusual articles ────────────────────────────────────────────────────────

const UNUSUAL = "Wikipedia:Unusual articles";
/** Subpages that are bookkeeping, not entries: what was removed, open questions, and pages that
 *  list categories, lists or non-article pages rather than articles. */
const UNUSUAL_SKIP = new Set([
  "Removed",
  "Questions",
  "Categories",
  "Lists",
  "Other pages",
]);

export function unusualSubpages(titles: readonly string[]): string[] {
  return titles.filter((t) => {
    if (!t.startsWith(`${UNUSUAL}/`)) return false;
    return !UNUSUAL_SKIP.has(t.slice(UNUSUAL.length + 1));
  });
}

// ── Did you know ────────────────────────────────────────────────────────────

const DYK_ARCHIVE = "Wikipedia:Did you know archive";

export function dykArchiveMonths(titles: readonly string[]): string[] {
  return titles.filter((t) =>
    new RegExp(`^${DYK_ARCHIVE}/\\d{4}/[A-Z][a-z]+$`).test(t),
  );
}

/** `[[Target|label]]` → label, `[[Target]]` → Target. */
const LINK = /\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g;

/** Ship-prefix templates: `{{HMS|Victory}}` → "HMS Victory". */
const SHIP_PREFIX = /^(HMS|USS|SS|RMS|HMAS|HMCS|HMNZS|MV|USNS|USCGC)$/i;

/** Expand the few templates hooks actually use; leave anything else in place (so the caller
 *  can see it and give up). Measured by the Phase 2 review on live archives: 3–7% of hooks carry
 *  one, and deleting them wholesale stored "lost due to" for "lost 11 lb due to". */
function expandTemplate(inner: string): string | null {
  const [name = "", ...args] = inner.split("|").map((s) => s.trim());
  if (name === "`s" || name === "'s") return "'s";
  if (name === "`" || name === "'") return "'";
  if (/^nowrap$/i.test(name) && args[0] !== undefined) return args[0];
  if (/^(convert|cvt)$/i.test(name) && args.length >= 2)
    return `${args[0]} ${args[1]}`;
  if (SHIP_PREFIX.test(name) && args[0])
    return `${name.toUpperCase()} ${args[0]}`;
  return null;
}

/** One hook line as reading text: "Did you know that …?", links as their labels, no italics or
 *  bold, no "(pictured)" aside, entities gone, known templates expanded. **Null when a template
 *  it cannot read survives** — a garbled summary is stored for good (ingest never revisits a
 *  row), so the card falls back to the article's lede instead (`toItem`: `hook ?? lede`). */
export function cleanDykHook(line: string): string | null {
  const text = line
    .replace(/^\*\s*(\.\.\.|…)\s*/, "Did you know ")
    // Quotes first: `'''[[X]]'''{{`s}}` would otherwise glue into `''''s` and lose the apostrophe.
    .replace(/'{2,}/g, "")
    // An empty label (emptied by a template) is not a label: fall back to the target.
    .replace(LINK, (_, target: string, label?: string) =>
      label === undefined || label === "" ? target : label,
    )
    .replace(
      /\{\{([^{}]*)\}\}/g,
      (whole, inner: string) => expandTemplate(inner) ?? whole,
    );
  if (text.includes("{{")) return null;
  return text
    .replace(/\s*\([^()]*\bpictured\b[^()]*\)/gi, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&[a-z]+;/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([?.,])/g, "$1")
    .trim();
}

/** A hook's bolded link targets — the articles the hook is about. Unbolded links are context. */
const BOLD_LINK = /'''+\s*\[\[([^\]|#]+)/g;

function normTitle(t: string): string {
  const s = t
    .replace(/_/g, " ")
    .replace(/&nbsp;/g, " ")
    .trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Every hook in an archive page's wikitext, one entry per bolded target (a hook about two new
 *  articles yields both, sharing the hook). */
export function parseDykHooks(
  wikitext: string,
): { title: string; hook?: string }[] {
  const out: { title: string; hook?: string }[] = [];
  for (const line of wikitext.split("\n")) {
    if (!/^\*\s*(\.\.\.|…)\s*that\b/.test(line)) continue;
    const hook = cleanDykHook(line);
    for (const m of line.matchAll(BOLD_LINK))
      out.push(
        hook ? { title: normTitle(m[1]!), hook } : { title: normTitle(m[1]!) },
      );
  }
  return out;
}

// ── the network ─────────────────────────────────────────────────────────────

/**
 * `fetchJson` for this module: MediaWiki answers an error with **HTTP 200** and
 * `{ error: { code, info } }` (rate limits, maxlag, bad parameters), which `fetchJson` cannot see.
 * Read as an empty result, a rate-limited night would report zero candidates and zero errors and
 * look idle. So: an `error` body throws, and so does a response with neither the expected key nor
 * `batchcomplete` — a generator with no results legitimately omits `query` but says the batch is
 * complete. The throw reaches search(), and ingest counts it as a failed query.
 */
async function wikiFetch<T>(url: string, key: "query" | "parse"): Promise<T> {
  const data = (await fetchJson(url, { delayMs: 120 })) as Record<
    string,
    unknown
  > & { error?: { code?: string; info?: string } };
  if (data.error)
    throw new Error(
      `MediaWiki ${data.error.code ?? "error"}: ${data.error.info ?? ""}`.trim(),
    );
  if (!(key in data) && !("batchcomplete" in data))
    throw new Error(`MediaWiki response has no "${key}" and no batchcomplete`);
  return data as T;
}

type ApiPage = {
  pageid?: number;
  ns?: number;
  title: string;
  missing?: boolean;
};

const articles = (pages: ApiPage[] | undefined): ListCandidate[] =>
  (pages ?? [])
    .filter((p) => p.pageid && p.ns === 0 && !p.missing)
    .map((p) => ({ pageid: p.pageid!, title: p.title }));

async function allPages(prefix: string): Promise<string[]> {
  const res = await wikiFetch<{ query?: { allpages?: { title: string }[] } }>(
    `${Q}&list=allpages&apnamespace=4&aplimit=max&apprefix=${encodeURIComponent(prefix)}`,
    "query",
  );
  return (res.query?.allpages ?? []).map((p) => p.title);
}

/** The most titles a title-shaped list (Unusual, DYK) resolves to page ids in one night — drawn
 *  by title hash first, so a night costs a few resolve calls, not one per 50 of ~2,000 entries.
 *  Far more than any night's `limit` needs, since stubs and low-value titles still drop. */
export const MAX_RESOLVE = 200;

/** A day-seeded draw of at most `n` titles: `md5(title | day)` order. */
export function drawTitles(
  titles: readonly string[],
  day: string,
  n: number,
): string[] {
  const key = (t: string) =>
    createHash("md5").update(`${t}|${day}`).digest("hex");
  return [...titles]
    .map((t) => [key(t), t] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, n)
    .map(([, t]) => t);
}

/** Each table row's entry on an Unusual-articles subpage: the bolded link that opens the row,
 *  sometimes behind an FA/GA icon template. Links in a row's description are context, and
 *  following them (the first cut used `generator=links`) drew "Cuba" and "Scottish cuisine". */
export function parseUnusualEntries(wikitext: string): string[] {
  const out: string[] = [];
  for (const line of wikitext.split("\n")) {
    const m = /^\|\s*(?:\{\{[^{}]*\}\}\s*)*'''+\s*\[\[([^\]|#]+)/.exec(line);
    if (m) out.push(normTitle(m[1]!));
  }
  return [...new Set(out)];
}

/** Titles → article page ids, 50 a call, following normalisation and redirects, so `extra`
 *  (a DYK hook, keyed by the title the list used) reaches the page it now names. */
async function resolveTitles(
  titles: readonly string[],
  extra?: ReadonlyMap<string, string>,
): Promise<ListCandidate[]> {
  const out: ListCandidate[] = [];
  for (let i = 0; i < titles.length; i += 50) {
    const res = await wikiFetch<{
      query?: {
        pages?: ApiPage[];
        normalized?: { from: string; to: string }[];
        redirects?: { from: string; to: string }[];
      };
    }>(
      `${Q}&redirects=1&titles=${titles
        .slice(i, i + 50)
        .map(encodeURIComponent)
        .join("|")}`,
      "query",
    );
    const back = new Map<string, string>();
    for (const r of [
      ...(res.query?.normalized ?? []),
      ...(res.query?.redirects ?? []),
    ])
      back.set(r.to, back.get(r.from) ?? r.from);
    for (const c of articles(res.query?.pages)) {
      const hook = extra?.get(c.title) ?? extra?.get(back.get(c.title) ?? "");
      out.push(hook ? { ...c, hook } : c);
    }
  }
  return out;
}

async function unusualCandidates(day: string): Promise<ListCandidate[]> {
  const subpages = unusualSubpages(
    await allPages(UNUSUAL.replace(/^Wikipedia:/, "")),
  );
  if (subpages.length === 0) return [];
  // Every subpage's current wikitext in one call (~16 titles, well under the 50-title cap).
  const res = await wikiFetch<{
    query?: {
      pages?: { revisions?: { slots?: { main?: { content?: string } } }[] }[];
    };
  }>(
    `${Q}&prop=revisions&rvprop=content&rvslots=main` +
      `&titles=${subpages.map(encodeURIComponent).join("|")}`,
    "query",
  );
  const entries = [
    ...new Set(
      (res.query?.pages ?? []).flatMap((p) =>
        parseUnusualEntries(p.revisions?.[0]?.slots?.main?.content ?? ""),
      ),
    ),
  ];
  return resolveTitles(drawTitles(entries, day, MAX_RESOLVE));
}

const CATEGORY: Record<"featured" | "good", string> = {
  featured: "Category:Featured articles",
  good: "Category:Good articles",
};

/** A day-seeded two-letter start in the category's sort order: `Ma`, `Qe`, … */
function sortKeyStart(day: string, list: string): string {
  const h = hashSeed(`${list}|${day}`);
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const a = "abcdefghijklmnopqrstuvwxyz";
  return A[h % 26]! + a[Math.floor(h / 26) % 26]!;
}

async function categoryCandidates(
  list: "featured" | "good",
  day: string,
): Promise<ListCandidate[]> {
  const res = await wikiFetch<{ query?: { pages?: ApiPage[] } }>(
    `${Q}&generator=categorymembers&gcmtitle=${encodeURIComponent(CATEGORY[list])}` +
      `&gcmnamespace=0&gcmtype=page&gcmlimit=max` +
      `&gcmstartsortkeyprefix=${sortKeyStart(day, list)}`,
    "query",
  );
  return articles(res.query?.pages);
}

async function dykCandidates(day: string): Promise<ListCandidate[]> {
  const months = dykArchiveMonths(
    await allPages(`${DYK_ARCHIVE.replace(/^Wikipedia:/, "")}/`),
  );
  if (months.length === 0) return [];
  const month = months[hashSeed(`dyk|${day}`) % months.length]!;
  const parsed = await wikiFetch<{ parse?: { wikitext?: string } }>(
    `${WIKI_API}?action=parse&format=json&formatversion=2&prop=wikitext&page=${encodeURIComponent(month)}`,
    "parse",
  );
  const hooks = parseDykHooks(parsed.parse?.wikitext ?? "");
  // A hook that would not clean (an unreadable template) still names its article: the page is a
  // candidate, just without the hook, and its card uses the lede.
  const hookByTitle = new Map(
    hooks.flatMap((h) => (h.hook ? [[h.title, h.hook] as const] : [])),
  );
  return resolveTitles(
    drawTitles([...new Set(hooks.map((h) => h.title))], day, MAX_RESOLVE),
    hookByTitle,
  );
}

/** Every candidate a list offers tonight, in the night's draw order. */
export async function listCandidates(
  list: WikiList,
  day: string,
): Promise<ListCandidate[]> {
  const raw =
    list === "unusual"
      ? await unusualCandidates(day)
      : list === "dyk"
        ? await dykCandidates(day)
        : await categoryCandidates(list, day);
  // One entry per page (a page linked from two Unusual subpages, or bolded in two hooks).
  const seen = new Set<number>();
  return drawOrder(
    raw.filter((c) => !seen.has(c.pageid) && seen.add(c.pageid)),
    day,
  );
}
