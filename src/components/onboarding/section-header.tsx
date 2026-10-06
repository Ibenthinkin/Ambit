import { Eyebrow } from "~/components/ui/eyebrow";
import { cn } from "~/lib/utils";

// The mono header the exhibition's sections share (docs/DESIGN_redesign.md §5.3 item 5): a name
// left, a two-digit count right, over a rule — "Temperament / 05", "You’d open / 02". The count
// is a glance for sighted readers; a screen reader counts the rows itself. Also the facet headers
// of TopicLevels' grouped mix.
//
// `level` is the heading's rank, set by the host so the outline never skips one: under the
// reveal's h1 title the exhibition's sections are h2s; under a section's h2 (the profile's
// exhibition, "Your mix") they are h3s.
export type SectionHeadingLevel = "h2" | "h3";

export function SectionHeader({
  title,
  count,
  level = "h3",
  className,
}: {
  title: string;
  count?: number;
  level?: SectionHeadingLevel;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-ink/16 flex items-baseline justify-between border-b pb-[10px]",
        className,
      )}
    >
      <Eyebrow as={level} className="text-[11px]">
        {title}
      </Eyebrow>
      {count !== undefined && (
        <Eyebrow aria-hidden="true" className="text-[11px]">
          {String(count).padStart(2, "0")}
        </Eyebrow>
      )}
    </div>
  );
}
