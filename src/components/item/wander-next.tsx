import Link from "next/link";

import { Diamond } from "~/components/icons";
import type { WanderRow } from "~/server/services/wander";

// "Where Ambit would wander next" — three places the feed could go from here, each labelled with
// the walk that would have found it.
//
// This is the one piece of the item page that argues for the product: a stranger who followed a
// shared link sees, concretely, what the feed's drift actually does, before being asked to want an
// invite. So it renders on **both** variants (the BUILD_PLAN's Done bar is explicit about this,
// where the redesign prototype showed it only on the image screen), and its rows are real links —
// the prototype's were inert.
//
// Hidden entirely when there's nothing to show. An empty section with a heading is worse than no
// section: it reads as a feature that broke.
export interface WanderNextProps {
  rows: WanderRow[];
}

export function WanderNext({ rows }: WanderNextProps) {
  if (rows.length === 0) return null;

  return (
    <section className="mt-[34px]">
      <div className="bg-accent/50 h-[0.5px] w-5" />
      <h2 className="text-ink/40 mt-[14px] text-[11px] font-semibold tracking-[1.2px] uppercase">
        Where Ambit would wander next
      </h2>

      <ul className="mt-[14px] flex flex-col gap-[9px]">
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              href={`/i/${row.id}`}
              className="border-hairline border-ink/7 bg-ink/3 flex items-start gap-[11px] rounded-[14px] px-[15px] py-[13px]"
            >
              <Diamond size={9} className="text-accent mt-[6px] flex-none" />
              <span className="min-w-0">
                <span className="text-ink block text-[16px] leading-[1.3]">
                  {row.title}
                </span>
                <span className="text-ink/44 mt-[3px] block text-[11.5px]">
                  {row.reason}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
