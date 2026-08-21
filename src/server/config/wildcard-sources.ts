// Sources the gallery rail's **wildcard** slot prefers, when it has any.
//
// The rail (services/gallery-rail.ts) mostly walks the topic graph: stay here, drift one hop, jump
// across. A wildcard slot ignores the walk entirely and draws an image from the whole corpus — the
// serendipity dial with no floor under it. This list narrows that draw when it is non-empty.
//
// **It is empty today, and that is the shipped state.** The knob is the doorway, not the feature
// (Phase 5.8, decision 7). The reason it exists at all is `ambit-archive` — Ben's private
// personal-image service, which has an adapter built to this repo's `SourceAdapter` contract but no
// integration here yet (verified 08-21-26: `server/services/sources/` holds aic, cma, met,
// wellcome, wikipedia and nothing else; the "archive" strings in `lib/source-label.ts` are
// labelling support for rows that don't exist). When that integration lands, its source slug goes
// here and personal images start surfacing as the rail's wildcards without another line changing.
//
// Empty list → `drawImageAnywhere` applies no source restriction, i.e. the wildcard draws from the
// whole corpus. That is a real behaviour, not a degraded one: a wildcard that reaches anywhere is
// the point; preferring the archive is a flavour on top.
export const WILDCARD_SOURCES: string[] = [];
