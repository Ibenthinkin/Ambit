// The corpus-walk loop, lifted out of scripts/ingest.ts on 09-06-26 so it can be tested against a
// fake walker: that script calls main() on import, so nothing in it was reachable from a test.
// Behaviour is unchanged from Phase 6.3 except for the two additions this move was made for —
// a walk that stops on its budget, and one that starts from a cursor.
import type {
  CorpusWalkAdapter,
  NormalizedItem,
  WalkPage,
} from "./sources/types";

export interface WalkRunStats {
  walked: number; // walk() pages attempted
  offered: number; // raws normalized into items
  errors: number; // failed pages or toItem throws — never folded into "offered: 0"
  /** Of `errors`, the ones that were whole pages — the only kind that voids completeness. */
  pageErrors: number;
  /** Every sourceId the walk normalized — planPrune's input. A raw that toItem rejects (no
   *  featured image, say) is not here, which is right: it was never a row, so planPrune cannot
   *  name it; and if it once WAS a row and has since lost its image, it should go. */
  seenSourceIds: string[];
  /** Pages that failed and were asked for again (09-10-26). A page that recovers on a retry is
   *  not a `pageError` and does not void completeness — the walk saw it. */
  retries: number;
  /** True iff the walk covered the archive end to end with no failed PAGE: no --quota, no
   *  per-blog walkQuota, no starting cursor. Only then may the absence of a row mean the post is
   *  gone. A single rejected post does not void this — doorofperception has one permanently, and
   *  a walk that can never be complete is a --prune that can never run. (Found on the first real
   *  run, 08-27-26.) */
  complete: boolean;
  /** The cursor of the page the walk stopped BEFORE — what to pass as `--cursor` to carry on.
   *  Undefined when the walk reached the end of the archive, which is the point: a run that has
   *  one has more to fetch, a run that does not is finished. */
  resumeCursor?: string;
  items: NormalizedItem[];
}

export interface WalkRunOpts {
  /** Stop once this many items have been offered. `--quota`, or the blog's own `walkQuota`. */
  quotaItems?: number;
  /** Start here instead of at the beginning — resuming an archive a bounded run stopped inside. */
  startCursor?: string;
  onWarn?: (message: string) => void;
  onNote?: (message: string) => void;
  /** The pause between retries of a failed page. Tests pass a no-op. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * A failed page is asked for again this many times, waiting `RETRY_BASE_MS`, then twice that,
 * then twice that (5 s / 10 s / 20 s — 35 s in all) before the walk gives up on it. Added
 * 09-10-26 after the 09-09 nightly: four Tumblr walks, each ended by a single bad answer, landed
 * 4,010 rows of a ~100,000 budget. A walk cursor is an offset into an archive, so re-asking for
 * the same page is exactly as safe as asking the first time; what was NOT safe, and is still
 * refused below, is guessing at the page after a failure.
 */
export const PAGE_RETRIES = 3;
export const RETRY_BASE_MS = 5_000;

const realSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Walk one corpus-walk source to exhaustion, or to `quotaItems`. Sequential by construction —
 * one host, one cursor — and the adapter owns its own politeness delay. A failed page is retried
 * `PAGE_RETRIES` times with backoff; one that still fails is an error and stops the walk (a
 * cursor past a failure is not something we can trust), which also marks the run incomplete so
 * --prune cannot act on it.
 *
 * Both bounds — a quota and a starting cursor — make the run incomplete, for the same reason: a
 * walk that stopped early, or started late, has not seen the archive and cannot testify that a
 * row is gone.
 */
export async function runWalk(
  walker: CorpusWalkAdapter,
  opts: WalkRunOpts = {},
): Promise<WalkRunStats> {
  const { quotaItems, startCursor, onWarn, onNote, sleep = realSleep } = opts;
  const stats: WalkRunStats = {
    walked: 0,
    offered: 0,
    errors: 0,
    pageErrors: 0,
    retries: 0,
    seenSourceIds: [],
    complete: false,
    items: [],
  };
  let cursor: string | undefined = startCursor;
  let reachedEnd = false;
  do {
    stats.walked++;
    let page: WalkPage<unknown> | undefined;
    for (let attempt = 0; attempt <= PAGE_RETRIES; attempt++) {
      try {
        page = await walker.walk(
          cursor,
          quotaItems ? { limit: quotaItems - stats.offered } : undefined,
        );
        break;
      } catch (err) {
        const where = `cursor ${cursor ?? "(start)"}`;
        if (attempt === PAGE_RETRIES) {
          stats.errors++;
          stats.pageErrors++;
          onWarn?.(
            `walk FAILED at ${where} after ${PAGE_RETRIES} retries — ${String(err)}`,
          );
          break;
        }
        const waitMs = RETRY_BASE_MS * 2 ** attempt;
        stats.retries++;
        onWarn?.(
          `page failed at ${where} — ${String(err)} — retrying in ${waitMs / 1000}s (${attempt + 1}/${PAGE_RETRIES})`,
        );
        await sleep(waitMs);
      }
    }
    if (page === undefined) break;
    for (const raw of page.raw) {
      try {
        const normalized = walker.toItem(raw);
        stats.seenSourceIds.push(normalized.sourceId);
        stats.items.push(normalized);
        stats.offered++;
      } catch (err) {
        stats.errors++;
        onWarn?.(`toItem failed — ${String(err)}`);
      }
      if (quotaItems && stats.offered >= quotaItems) break;
    }
    cursor = page.next;
    reachedEnd = cursor === undefined;
  } while (
    cursor !== undefined &&
    !(quotaItems && stats.offered >= quotaItems)
  );

  stats.complete =
    reachedEnd &&
    stats.pageErrors === 0 &&
    quotaItems === undefined &&
    startCursor === undefined;
  // A walk stopped by its budget still has an archive behind it. Say where, in the shape the
  // flag takes, so "the rest of it" is a copy-paste rather than an arithmetic exercise.
  if (!reachedEnd && cursor !== undefined) {
    stats.resumeCursor = cursor;
    onNote?.(
      `stopped at ${stats.offered} offered · resume with --cursor ${cursor}`,
    );
  }
  return stats;
}
