import { Eyebrow } from "~/components/ui/eyebrow";
import { TextLink } from "~/components/ui/text-link";
import { sourceLabel } from "~/lib/source-label";
import type { RailItem } from "~/server/services/gallery-rail";
import { INFORMATION_ID } from "./caption-type";
import { CreditLine } from "./credit-line";
import { LinkOutRow, linkOutCopy } from "./link-out-row";
import { ReaderBlocks } from "./reader-blocks";
import { ReuseNotice } from "./reuse-notice";

// Everything the merged item screen says about the picture above it (09-10-26,
// docs/DESIGN_screen-structure.md §1). Two ancestors folded into one block:
//
//   - `ImageItemBody`'s text half — title, credit line, summary, a PDR essay, the link-out.
//   - the gallery details sheet's facts table — From / By / License / Topic, each row **omitted
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
  /** `column` (default) is the phone / reader-width stack; `wide` is the desktop "Information"
   *  section, full width in three columns (DESIGN_redesign §6.3). Both read `itemFactRows`. */
  layout?: "column" | "wide";
}

/**
 * One row of the facts table: `92px | 1fr`, a mono 10.5 px label over a 15 px value, an `ink/14`
 * rule beneath (DESIGN_redesign §6.2). Exported with `itemFactRows` so the desktop "Information"
 * layout (Task 4.3) can lay the very same rows out in its own columns.
 */
export function FactRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-ink/14 grid grid-cols-[92px_minmax(0,1fr)] gap-3 border-b py-[14px]">
      <Eyebrow as="dt" className="pt-[3px]">
        {label}
      </Eyebrow>
      <dd className="text-ink/88 min-w-0 text-[15px] leading-[1.4]">
        {children}
      </dd>
    </div>
  );
}

/** Whoever the source names as maker — unless that is just the source's own name again, in which
 *  case the credit line already says it and saying it twice reads as a bug (Phase 6.3: a blog's
 *  attribution IS the blog). */
export function makerOf(item: RailItem): string | null {
  const label = sourceLabel(item.source);
  return item.attribution && item.attribution !== label
    ? item.attribution
    : null;
}

/**
 * The facts the corpus actually knows, in the design's order — From · By · License · Topic, plus
 * Debug under the server's flag. Each row is **omitted entirely when null** rather than rendered
 * empty: a table with three rows tells the reader the corpus knows three things; a table with
 * three blanks says something is broken. ("Date" and "Held at" are not stored and are absent.)
 */
export function itemFactRows(
  item: RailItem,
): { label: string; value: React.ReactNode }[] {
  const maker = makerOf(item);
  const rows: { label: string; value: React.ReactNode }[] = [
    {
      label: "From",
      value: (
        <TextLink href={item.sourceUrl} external tone="body">
          {sourceLabel(item.source)}
        </TextLink>
      ),
    },
  ];
  if (maker) rows.push({ label: "By", value: maker });
  if (item.license) rows.push({ label: "License", value: item.license });
  // Omitted when un-homed (Cut 1): a picture no topic fits has no topic yet. The bare id is the
  // fallback for a label that didn't resolve — better a slug than a blank.
  if (item.topicId !== null) {
    rows.push({ label: "Topic", value: item.topicLabel ?? item.topicId });
  }
  // SPEC §9's standing dev-overlay rule: how the rail's walk reached this picture. Present only
  // when the server's FEED_DEBUG gate is on.
  if (item.debug) {
    rows.push({
      label: "Debug",
      value: `${item.debug.via} · ${item.debug.topic ?? "—"}`,
    });
  }
  return rows;
}

/** One row's value by label, from the one source of the rows. */
function rowValue(
  rows: { label: string; value: React.ReactNode }[],
  label: string,
): React.ReactNode | null {
  return rows.find((r) => r.label === label)?.value ?? null;
}

const MONO_LINE =
  "text-ink/55 font-mono text-[10.5px] leading-[1.6] uppercase tracking-[0.3px]";

/**
 * The desktop "Information" section (DESIGN_redesign §6.3, decision 8): a mono label row over a
 * rule, then `1fr 1fr 2fr` — the topic; the maker, the italic title (this page's one `<h1>`) and
 * mono From / licence lines; the summary at 28 px with the bracket link-out under it. The
 * section is a named landmark and focusable, which is what "↓ Information" scrolls to and lands
 * focus on. A PDR essay (`body`) runs on under the grid at reader width.
 */
function ItemFactsWide({ item }: { item: RailItem }) {
  const maker = makerOf(item);
  const rows = itemFactRows(item);
  const topic = rowValue(rows, "Topic");
  const license = rowValue(rows, "License");
  const debug = rowValue(rows, "Debug");
  const source = sourceLabel(item.source);
  return (
    <section
      id={INFORMATION_ID}
      aria-label="Information"
      tabIndex={-1}
      className="px-10 pt-[22px] outline-none"
    >
      <div className="border-ink/16 text-ink/78 flex justify-between gap-6 border-b pb-[14px] font-mono text-[12px] uppercase">
        <span>Ambit</span>
        {topic ? <span>{topic}</span> : null}
        <TextLink href={item.sourceUrl} external tone="body">
          {source}
        </TextLink>
      </div>

      <div className="border-ink/16 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)] gap-x-10 gap-y-6 border-t pt-[14px] pb-[72px]">
        <div className="text-ink/55 font-mono text-[12px] uppercase">
          {topic}
        </div>

        <div className="text-ink/88 text-[16px] leading-[1.45]">
          {maker ? <div>{maker}</div> : null}
          <h1 className="text-ink-hi text-[16px] leading-[1.45] font-normal italic">
            {item.title}
          </h1>
          <div className={`${MONO_LINE} mt-4`}>
            From{" "}
            <TextLink href={item.sourceUrl} external tone="body">
              {source}
            </TextLink>
            {license ? <div>{license}</div> : null}
            {debug ? <div>Debug {debug}</div> : null}
          </div>
        </div>

        <div>
          {item.summary ? (
            <p className="text-ink/88 text-[28px] leading-[1.32] tracking-[-0.01em] text-pretty">
              {item.summary}
            </p>
          ) : null}
          {item.sourceUrl ? (
            <p className="mt-5 text-[16px]">
              <TextLink href={item.sourceUrl} external bracket tone="body">
                {linkOutCopy(item.source)}
              </TextLink>
            </p>
          ) : null}
        </div>
      </div>

      {item.body ? (
        <div className="max-w-[720px] pb-[48px]">
          <ReuseNotice item={item} />
          <div className="bg-ink/14 mt-[14px] h-px w-full" />
          <div className="mt-[20px]">
            <ReaderBlocks body={item.body} />
          </div>
        </div>
      ) : null}
    </section>
  );
}

/**
 * The spread's "Information" (DESIGN_redesign §6.3): both pages' details side by side, **Fig. 01**
 * (left page) and **Fig. 02** (right page), each a column of the single layout's stack under a
 * 40 px title. The focused page's title is the screen's one `<h1>`; the other's is an `<h2>`.
 */
export function ItemFactsSpread({
  pages,
  focusSide,
}: {
  pages: RailItem[];
  focusSide: number;
}) {
  // A capped rail can leave the right slot as the end card, so only one real page remains; focus
  // on that slot falls back to the page that is there, keeping exactly one `<h1>`.
  const h1Side = focusSide < pages.length ? focusSide : 0;
  return (
    <section
      id={INFORMATION_ID}
      aria-label="Information"
      tabIndex={-1}
      className="px-10 pt-[22px] outline-none"
    >
      {/* Wording from the prototype: "Spread / <titles>" and a count. */}
      <div className="border-ink/16 text-ink/55 flex justify-between gap-6 border-t pt-[14px] font-mono text-[11px] uppercase">
        <span className="min-w-0 truncate">
          Spread / {pages.map((p) => p.title).join(" / ")}
        </span>
        <span className="flex-none">
          {pages.length === 1 ? "One work" : "Two works"}
        </span>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-x-10 pb-[72px]">
        {pages.map((item, side) => {
          const maker = makerOf(item);
          const rows = itemFactRows(item);
          const topic = rowValue(rows, "Topic");
          const license = rowValue(rows, "License");
          const debug = rowValue(rows, "Debug");
          const source = sourceLabel(item.source);
          const Title = side === h1Side ? "h1" : "h2";
          return (
            <article
              key={item.id}
              data-testid="spread-fig"
              className="border-ink/16 min-w-0 border-t pt-3"
            >
              <div className="text-ink/55 flex justify-between gap-4 font-mono text-[11px] uppercase">
                <span>Fig. {String(side + 1).padStart(2, "0")}</span>
                {topic ? <span>{topic}</span> : null}
              </div>
              <Title className="text-ink-hi mt-[18px] text-[40px] leading-[1.08] font-normal tracking-[-0.015em] text-pretty">
                {item.title}
              </Title>
              <div className="text-ink/88 mt-6 text-[15px] leading-[1.45]">
                {maker ? <div>{maker}</div> : null}
                <div className={`${MONO_LINE} mt-4`}>
                  From{" "}
                  <TextLink href={item.sourceUrl} external tone="body">
                    {source}
                  </TextLink>
                  {license ? <div>{license}</div> : null}
                  {debug ? <div>Debug {debug}</div> : null}
                </div>
                {item.summary ? (
                  <p className="text-ink/78 mt-4 text-pretty">{item.summary}</p>
                ) : null}
                {item.sourceUrl ? (
                  <p className="mt-4">
                    <TextLink
                      href={item.sourceUrl}
                      external
                      bracket
                      tone="body"
                    >
                      {linkOutCopy(item.source)}
                    </TextLink>
                  </p>
                ) : null}
              </div>
              {item.body ? (
                <div className="mt-6">
                  <ReuseNotice item={item} />
                  <div className="bg-ink/14 mt-[14px] h-px w-full" />
                  <div className="mt-[20px]">
                    <ReaderBlocks body={item.body} />
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function ItemFacts({ item, layout = "column" }: ItemFactsProps) {
  if (layout === "wide") return <ItemFactsWide item={item} />;
  return (
    <article>
      {/* Stays an `<h1>`: it's the page's actual subject, and e2e leans on it. */}
      <h1 className="text-ink-hi mt-[8px] text-[32px] leading-[1.08] font-normal tracking-[-0.02em] text-pretty">
        {item.title}
      </h1>

      <CreditLine source={item.source} sourceUrl={item.sourceUrl} />

      {item.summary ? (
        <p className="text-ink/78 mt-[20px] text-[16px] leading-[1.55] text-pretty">
          {item.summary}
        </p>
      ) : null}

      {/* The facts table. `role="list"` + a name so a test (and a screen reader) can find the
          table as a unit; a bare `<dl>` has no accessible name to ask for. */}
      <dl
        aria-label="About this work"
        role="list"
        className="border-ink/14 mt-[28px] border-t"
      >
        {itemFactRows(item).map((row) => (
          <FactRow key={row.label} label={row.label}>
            {row.value}
          </FactRow>
        ))}
      </dl>

      {/* An image item that also carries text — a Public Domain Review collection's own essay
          (docs/PLAN_publicdomainreview.md §1). The reader variant's parser and type ramp are
          reused so the two pages read as one app; the notice above it is what PDR's CC BY-SA
          terms ask for. */}
      {item.body ? (
        <>
          <ReuseNotice item={item} />
          <div className="bg-ink/14 mt-[14px] h-px w-full" />
          <div className="mt-[20px]">
            <ReaderBlocks body={item.body} />
          </div>
        </>
      ) : null}

      {/* The white "Original post" / "Original source" button — on every item with a source URL. */}
      <LinkOutRow source={item.source} sourceUrl={item.sourceUrl} />
    </article>
  );
}
