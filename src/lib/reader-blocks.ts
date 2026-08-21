// Turns a stored article `body` into the handful of block shapes the reader variant of
// `/i/[itemId]` knows how to typeset.
//
// **Why a parser at all.** The bodies we store are plain text with wiki-style section markers
// (`== Section ==`, `=== Subsection ===`) — that is what MediaWiki's `exsectionformat=wiki`
// returns, and as of 5.7 the Wikipedia adapter asks for exactly that (see
// `server/services/sources/wikipedia.ts`). There is no HTML to sanitize and no runtime call to
// Wikipedia: the reader page renders from the row we already have. Anything richer (tables,
// infoboxes, references markup) never survives the extract API, so three block kinds is the whole
// vocabulary.
//
// **Why it degrades quietly.** Rows ingested before 5.7 carry `exsectionformat=plain` bodies,
// which have no markers at all, and non-Wikipedia sources may store anything. A body with no
// markers simply parses to all-paragraphs — a long unbroken read, but a correct one — so the
// reader is never blocked on the backfill (`scripts/backfill-wikipedia-bodies.ts`) having run.

/** One typeset unit of an article body. `text` is plain text — never HTML, never interpolated. */
export interface ReaderBlock {
  kind: "heading" | "subheading" | "paragraph";
  text: string;
}

// `== Section ==` / `=== Subsection ===`. The leading run of `=` is what carries the depth; the
// trailing run is not required to match it (extract output is well-formed, but a lopsided line is
// still obviously a heading and worth reading as one).
const HEADING = /^(=+)\s*(.+?)\s*=+$/;

// The tail sections of an encyclopedia article. They are navigation apparatus for a wiki, not
// prose: dropped along with everything under them until the next real section starts.
const APPARATUS =
  /^(see also|references|further reading|external links|notes|bibliography|citations)$/i;

// Lines that are all punctuation and whitespace once you strip the math-ish glyphs — stray
// operators, orphaned digits, and the fragments left behind when the extract API flattens a
// formula. Fewer than three surviving characters means there is no sentence in there.
const DEGENERATE = /[\s=+\-*/^(){}[\]|,.]/g;

/**
 * Parse a stored body into renderable blocks, dropping the apparatus sections and formula debris.
 * Returns `[]` for an empty or whitespace-only body, so callers can render nothing without a
 * special case.
 */
export function parseReaderBlocks(body: string): ReaderBlock[] {
  const blocks: ReaderBlock[] = [];
  // True while we are inside a dropped section: set by an apparatus heading, cleared by the next
  // heading that isn't one. Non-heading lines in between are discarded regardless of content —
  // that is the point, since a "References" body is a wall of citation lines.
  let dropping = false;

  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) continue;

    const heading = HEADING.exec(line);
    if (heading) {
      const [, markers = "", text = ""] = heading;
      dropping = APPARATUS.test(text);
      if (dropping) continue;
      // Depth is the count of `=`: MediaWiki's top-level sections are level 2, so `<= 2` is the
      // article's own section rank and anything deeper is a subsection within one.
      blocks.push({
        kind: markers.length <= 2 ? "heading" : "subheading",
        text,
      });
      continue;
    }

    if (dropping) continue;
    if (line.replace(DEGENERATE, "").length < 3) continue;
    blocks.push({ kind: "paragraph", text: line });
  }

  return blocks;
}
