import { sourceLabel } from "~/lib/source-label";
import type { RailItem } from "~/server/services/gallery-rail";
import { CreditLine } from "./credit-line";
import { LinkOutRow } from "./link-out-row";
import { ReaderBlocks } from "./reader-blocks";
import { ReuseNotice } from "./reuse-notice";

// Everything the merged item screen says about the picture above it (09-10-26,
// docs/DESIGN_screen-structure.md §1). Two ancestors folded into one block:
//
//   - `ImageItemBody`'s text half — title, maker, credit line, summary, a PDR essay, the link-out.
//   - the gallery details sheet's facts table — Maker / From / License / Topic, each row **omitted
//     entirely when null** rather than rendered empty. A table with three rows tells the reader the
//     corpus knows three things; a table with three blanks tells them something is broken. (The
//     prototype's rows were Medium / Origin / Where it lives, three fields the `item` table never
//     carried; these four are the facts that are actually true.)
//
// It takes a `RailItem`, not an `Item`, because it renders for whichever cell of the rail is under
// the reader's finger — and a `RailItem` is exactly the public projection every visitor may see.
// Pure: no queries, no router, no state. `WanderNext` and `JoinCta` sit below it in `ItemScreen`.
export interface ItemFactsProps {
  item: RailItem;
}

/**
 * One row of the facts table. Rendered only by callers that have something to put in it — the
 * null-check lives at the call site so an absent fact costs no row at all.
 */
function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-ink/8 flex gap-3 border-t-[0.5px] py-[11px]">
      <dt className="text-ink/40 w-[88px] shrink-0 pt-[3px] text-[11px] font-semibold tracking-[0.6px] uppercase">
        {label}
      </dt>
      <dd className="text-ink/82 min-w-0 flex-1 text-[15.5px] leading-[1.45]">
        {children}
      </dd>
    </div>
  );
}

export function ItemFacts({ item }: ItemFactsProps) {
  // Whoever the source names as maker — unless that is just the source's own name again, in which
  // case the credit line already says it and saying it twice reads as a bug (Phase 6.3: a blog's
  // attribution IS the blog).
  const label = sourceLabel(item.source);
  const maker =
    item.attribution && item.attribution !== label ? item.attribution : null;

  return (
    <article>
      {/* Stays an `<h1>`: it's the page's actual subject, and e2e leans on it. */}
      <h1 className="text-ink-hi mt-[20px] text-[28px] leading-[1.16] font-semibold">
        {item.title}
      </h1>

      {maker ? (
        <p className="text-ink/50 mt-[8px] text-[13px]">{maker}</p>
      ) : null}

      <CreditLine source={item.source} sourceUrl={item.sourceUrl} />

      {item.summary ? (
        <p className="text-ink/72 mt-[18px] text-[17px] leading-[1.6]">
          {item.summary}
        </p>
      ) : null}

      {/* The facts table. `role="list"` + a name so a test (and a screen reader) can find the
          table as a unit; a bare `<dl>` has no accessible name to ask for. */}
      <dl aria-label="About this work" role="list" className="mt-[22px]">
        {maker ? <Fact label="Maker">{maker}</Fact> : null}

        <Fact label="From">
          <a
            href={item.sourceUrl}
            target="_blank"
            rel="noopener"
            className="text-accent underline-offset-2 hover:underline"
          >
            {label}
          </a>
        </Fact>

        {item.license ? <Fact label="License">{item.license}</Fact> : null}

        {/* Omitted when un-homed (Cut 1): a picture no topic fits has no topic yet. The bare id is
            the fallback for a label that didn't resolve — better a slug than a blank. */}
        {item.topicId !== null ? (
          <Fact label="Topic">{item.topicLabel ?? item.topicId}</Fact>
        ) : null}

        {/* SPEC §9's standing dev-overlay rule, this screen's slice of it: how the rail's walk
            reached this picture. Present only when the server's FEED_DEBUG gate is on. */}
        {item.debug ? (
          <Fact label="Debug">
            {item.debug.via} · {item.debug.topic ?? "—"}
          </Fact>
        ) : null}
      </dl>

      {/* An image item that also carries text — a Public Domain Review collection's own essay
          (docs/PLAN_publicdomainreview.md §1). The reader variant's parser and type ramp are
          reused so the two pages read as one app; the notice above it is what PDR's CC BY-SA
          terms ask for. */}
      {item.body ? (
        <>
          <ReuseNotice item={item} />
          <div className="bg-ink/10 mt-[14px] h-[0.5px] w-full" />
          <div className="mt-[20px]">
            <ReaderBlocks body={item.body} />
          </div>
        </>
      ) : null}

      {/* Blog and PDR items only (renders null otherwise): the link-out that makes the card a
          preview. */}
      <LinkOutRow source={item.source} sourceUrl={item.sourceUrl} />
    </article>
  );
}
