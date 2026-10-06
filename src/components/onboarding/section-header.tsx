import { Eyebrow } from "~/components/ui/eyebrow";
import { cn } from "~/lib/utils";

// The mono header the exhibition's sections share (docs/DESIGN_redesign.md §5.3 item 5): a name
// left, a two-digit count right, over a rule — "Temperament / 05", "You’d open / 02". The count
// is a glance for sighted readers; a screen reader counts the rows itself.
export function SectionHeader({
  title,
  count,
  className,
}: {
  title: string;
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-ink/16 flex items-baseline justify-between border-b pb-[10px]",
        className,
      )}
    >
      <Eyebrow as="h3" className="text-[11px]">
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
