// The weekly split (docs/DESIGN_claude-judge-ingest.md D10, docs/PLAN_judge-on-vm202.md): since
// 10-02-26 the ingest is two jobs, pictures on one night and writing on another, because the two
// are judged by different Claude models against one shared subscription limit and a week's
// pictures should never starve a week's writing of it.
//
// Two levers, and the second is the one that is true. A source that can only ever yield the other
// kind is not walked at all (a museum on the writing night would be an hour of polite searching
// for nothing). Then every item is filtered by its own type after normalization, because two
// sources carry both: PDR's collections are pictures and its essays are articles.
//
// A leaf: types only from the source layer, so a test (and the health route's types) can import
// it without pulling in every adapter.
import type { NormalizedItem, SourceId } from "./sources/types";

export const INGEST_KINDS = ["pictures", "writing"] as const;
export type IngestKind = (typeof INGEST_KINDS)[number];

const PICTURES = ["pictures"] as const;
const WRITING = ["writing"] as const;

/**
 * What each source can yield. A `Record<SourceId, …>` on purpose: registering a new source
 * without a line here is a compile error. The alternative — a default — would mean a new writing
 * source is skipped on the writing night and filtered out on the pictures night, ingesting
 * nothing, silently, forever.
 */
export const SOURCE_KINDS: Record<SourceId, readonly IngestKind[]> = {
  // Search sources.
  wikipedia: WRITING,
  poetrydb: WRITING,
  met: PICTURES,
  aic: PICTURES,
  cma: PICTURES,
  wellcome: PICTURES,
  archive: PICTURES,
  smithsonian: PICTURES,
  loc: PICTURES,
  "nasa-images": PICTURES,
  // Walk sources that carry both kinds.
  pdr: INGEST_KINDS,
  loupe: INGEST_KINDS,
  // Designated blogs: link cards of pictures.
  doorofperception: PICTURES,
  thingsorganizedneatly: PICTURES,
  mossandfog: PICTURES,
  thisiscolossal: PICTURES,
  streetartnews: PICTURES,
  nemfrog: PICTURES,
  humanoidhistory: PICTURES,
  sovietpostcards: PICTURES,
  "70sscifiart": PICTURES,
  vintagegeekculture: PICTURES,
  dreamsrecurring: PICTURES,
  toiich: PICTURES,
  thevaultoftheatomicspaceage: PICTURES,
  thisisnthappiness: PICTURES,
  jareckiworld: PICTURES,
  kvetchlandia: PICTURES,
  // Publications: link cards of writing.
  themarginalian: WRITING,
  jstordaily: WRITING,
  noema: WRITING,
  aeon: WRITING,
  psyche: WRITING,
  longreads: WRITING,
  theparisreview: WRITING,
};

/** `--kind`'s value. Absent is null: a run of everything, exactly as before the split. An
 *  unknown word throws — a typo must never quietly become "run everything". */
export function parseKind(raw: string | undefined): IngestKind | null {
  if (raw === undefined) return null;
  if ((INGEST_KINDS as readonly string[]).includes(raw))
    return raw as IngestKind;
  throw new Error(
    `--kind must be one of ${INGEST_KINDS.join(", ")}, got "${raw}"`,
  );
}

/** An item's kind is its type, in the schedule's words. */
export function itemKind(item: Pick<NormalizedItem, "type">): IngestKind {
  return item.type === "article" ? "writing" : "pictures";
}

/** Whether a run of `kind` should fetch from this source at all. */
export function sourceYields(id: SourceId, kind: IngestKind | null): boolean {
  return kind === null || SOURCE_KINDS[id].includes(kind);
}

/**
 * Why `--source <id> --kind <kind>` cannot be run, or null when it can. Without this, a source
 * that yields only the other kind (`--source met --kind writing`) is walked, filtered to nothing
 * and recorded as a clean run of that kind — which /api/health then counts as a successful
 * writing night that judged nothing. The script prints the message and exits 1 before any fetch.
 *
 * Null for "nothing to refuse" in every other case, including an id that is not a source at all:
 * the script's own unknown-source check owns that error and its list of known ids, and looking
 * the id up blindly here would be a TypeError on `undefined.includes`. Takes the raw string for
 * that reason, not a `SourceId`.
 */
export function sourceKindRefusal(
  kind: IngestKind | null,
  source: string | undefined,
): string | null {
  if (!kind || !source) return null;
  const kinds = SOURCE_KINDS[source as SourceId] as
    readonly IngestKind[] | undefined;
  if (!kinds || kinds.includes(kind)) return null;
  return `--source "${source}" yields no ${kind}: it yields ${kinds.join(", ")} only, so --kind ${kind} would walk it for nothing`;
}

/** The items of the night's kind; everything when there is no kind. */
export function ofKind<T extends Pick<NormalizedItem, "type">>(
  items: T[],
  kind: IngestKind | null,
): T[] {
  return kind === null ? items : items.filter((it) => itemKind(it) === kind);
}

/**
 * The kind an `ingest_run` row is written with — what /api/health counts the run toward. The
 * flag when there was one. Otherwise a manual `--source aeon` run is a writing run, because
 * Aeon yields nothing else: recording it as "both" would let a month of publication backfills
 * keep the *pictures* witness green while the Monday job was dead. A run of everything, or of a
 * two-kind source, is null, and null counts for both.
 */
export function recordedKind(
  kind: IngestKind | null,
  source: string | undefined,
): IngestKind | null {
  if (kind) return kind;
  const kinds = source ? SOURCE_KINDS[source as SourceId] : undefined;
  return kinds?.length === 1 ? kinds[0]! : null;
}
