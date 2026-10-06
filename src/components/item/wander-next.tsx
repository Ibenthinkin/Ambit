import Link from "next/link";

import { Eyebrow } from "~/components/ui/eyebrow";
import type { WanderRow } from "~/server/services/wander";

// "Where Ambit would wander next" — three places the feed could go from here, each labelled with
// the walk that would have found it (DESIGN_redesign §6.2: a mono label over a hairline, then
// hairline rows — a 6 px green dot, an 18 px title, a 13 px reason, a mono `→`).
//
// This is the one piece of the item page that argues for the product: a stranger who followed a
// shared link sees, concretely, what the feed's drift actually does, before being asked to want an
// invite. So it renders on **both** variants, and its rows are real links — the prototype's were
// inert.
//
// Hidden entirely when there's nothing to show. An empty section with a heading is worse than no
// section: it reads as a feature that broke.
export interface WanderNextProps {
  rows: WanderRow[];
}

export function WanderNext({ rows }: WanderNextProps) {
  if (rows.length === 0) return null;

  return (
    <section className="mt-[44px]">
      <Eyebrow
        as="h2"
        className="border-ink/14 block border-b pb-[10px] tracking-[0.4px]"
      >
        Where Ambit would wander next
      </Eyebrow>

      <ul>
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              href={`/i/${row.id}`}
              className="border-ink/14 flex items-start gap-3 border-b py-4"
            >
              <span
                aria-hidden="true"
                className="bg-accent mt-[9px] size-[6px] flex-none rounded-full"
              />
              <span className="min-w-0 flex-1">
                <span className="text-ink block text-[18px] leading-[1.25]">
                  {row.title}
                </span>
                <span className="text-ink/55 mt-[5px] block text-[13px]">
                  {row.reason}
                </span>
              </span>
              <span
                aria-hidden="true"
                className="text-ink/55 pt-[3px] font-mono text-[13px]"
              >
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
