// The curator's one error that must not be absorbed as a per-item failure. A leaf module (no
// imports) so both curator.ts and claude-judge.ts can throw it without importing each other.

/**
 * Thrown by curateItems when the batch cannot continue — an account-level HTTP status
 * (CURATOR_ABORT_STATUSES) or MAX_CONSECUTIVE_FAILURES fallbacks in a row. Deliberately not a
 * plain Error: the per-item fallback in curateItems catches everything else, and this is the one
 * kind of failure it must let through. Ingest's top-level catch turns it into exit 1; nothing has
 * been written, so the re-run resumes free through the curation cache.
 */
export class CuratorAbortError extends Error {
  constructor(
    message: string,
    /** The HTTP status that caused the abort, when one did. */
    readonly status?: number,
  ) {
    super(message);
    this.name = "CuratorAbortError";
  }
}
