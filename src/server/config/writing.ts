// Writing as a first-class part of Ambit (docs/DESIGN_writing.md, 09-28-26). Writing is
// `item.type = 'article'` — no new type value — and every writing item carries a **kind**
// (D2), the vocabulary a card's badge speaks in (`ESSAY · 12 MIN`, D5). The kind is decided by
// the writing curator (services/curator.ts `WRITING_PROMPT`), stored in `item.kind`, and NULL for
// images and for articles the writing curator has not reached yet.
//
// Reading time lives here too, because it is a fact about the text and not about any one source:
// `readingMinutes` is what ingest and `recurate:writing` store in `item.reading_minutes`.

import { parseReaderBlocks } from "~/lib/reader-blocks";

/** D2's four kinds, in the order the curator's prompt lists them. */
export const WRITING_KINDS = [
  "essay",
  "curiosity",
  "criticism",
  "archive",
] as const;

export type WritingKind = (typeof WRITING_KINDS)[number];

/** The reader-facing name of each kind — the badge text, before it is upper-cased. */
export const WRITING_KIND_LABELS: Record<WritingKind, string> = {
  essay: "Essay",
  curiosity: "Curiosity",
  criticism: "Criticism",
  archive: "Archive",
};

export function isWritingKind(value: unknown): value is WritingKind {
  return (
    typeof value === "string" &&
    (WRITING_KINDS as readonly string[]).includes(value)
  );
}

/** A steady adult reading pace for prose. The number only has to be consistent: a badge that
 *  says 12 MIN is a comparison between pieces, not a promise. */
export const READING_WPM = 230;

/**
 * The prose of a stored body, with an encyclopedia's tail apparatus removed (`== References ==`,
 * `== See also ==` and the rest). **Reuses the reader's own parser** rather than a second list of
 * section names: `parseReaderBlocks` already drops exactly those sections at render time, so
 * what the curator reads and what a reading time counts is the text a reader will actually see.
 * Headings survive as plain lines.
 */
export function writingText(body: string): string {
  return parseReaderBlocks(body)
    .map((b) => b.text)
    .join("\n");
}

/**
 * Minutes to read a stored body at READING_WPM, rounded up, never less than one. **NULL without
 * a body** — a piece Ambit holds only a dek for (a summary, a publication's RSS description) has
 * no honest length, and its badge reads plain `READ` (D5). Pass the body, never the summary.
 */
export function readingMinutes(body: string | null | undefined): number | null {
  if (!body?.trim()) return null;
  const words = writingText(body).split(/\s+/).filter(Boolean).length;
  if (words === 0) return null;
  return Math.max(1, Math.ceil(words / READING_WPM));
}
