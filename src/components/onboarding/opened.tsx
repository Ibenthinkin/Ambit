import { WRITING_KIND_LABELS } from "~/server/config/writing";
import { readingSummary } from "~/lib/interview/exhibition";
import type { OpenedCard } from "~/lib/interview/taste";

import { SectionHeader, type SectionHeadingLevel } from "./section-header";

// "You’d open" (docs/DESIGN_redesign.md §5.3 item 5, under the compass): the reading sentence
// (`readingSummary`) and each article card the reader opened, a mono kicker over a 20 px title.
// The prototype's italic "tone" word is not data Ambit has, so it is left out. A reader who
// opened neither card gets the sentence alone — no "You’d open" over an empty list. Shared by
// the reveal and /profile/topics.
export function Opened({
  opened,
  readingMinutes,
  headingLevel,
}: {
  opened: readonly OpenedCard[];
  readingMinutes: number | null;
  headingLevel?: SectionHeadingLevel;
}) {
  const sentence = readingSummary({ opened, readingMinutes });
  if (opened.length === 0) {
    return <p className="text-ink/55 text-[14px] leading-[1.45]">{sentence}</p>;
  }
  return (
    <div>
      <SectionHeader
        title="You’d open"
        level={headingLevel}
        count={opened.length}
      />
      <p className="text-ink/55 mt-3 mb-1 text-[14px] leading-[1.45]">
        {sentence}
      </p>
      <ul>
        {opened.map((o) => (
          <li key={o.itemId} className="border-ink/8 border-b py-[14px]">
            <span className="text-ink/55 block font-mono text-[10.5px] uppercase">
              {WRITING_KIND_LABELS[o.kind]} · {o.minutes} min
            </span>
            <span className="text-ink-hi mt-2 block text-[20px] leading-[1.2]">
              {o.title}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
