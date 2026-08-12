import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Plain `twMerge` doesn't know about `.border-hairline` (globals.css's custom 0.5px border-width
// utility — see its own comment there) — it falls back to treating an unrecognized `border-<word>`
// class as a border-*color* utility, which put it in the same conflict group as `border-ink/NN`
// and silently DROPPED `border-hairline` from every component that wrote the design system's own
// documented idiom, `border-hairline border-ink/12` (found via PHASE5_PLAN_5.2.md Step 1's Input
// test: `border-top-width` computed to 1px, not the specced 0.5px, on every primitive using it).
// Registering it in tailwind-merge's built-in `border-w` group fixes the classification at the
// one shared choke point instead of patching every call site, and correctly makes it conflict
// with *other* width utilities (`border`, `border-t`, ...) the way any border-width class should.
const twMerge = extendTailwindMerge({
  extend: { classGroups: { "border-w": ["border-hairline"] } },
});

// The standard shadcn/t3-ecosystem `cn` helper — every component that takes conditional or
// composable classNames should build them through this, not string concatenation.
//   - `clsx` collapses the falsy/conditional bookkeeping: `cn("p-2", isActive && "font-bold")`
//     just drops the `false` rather than stringifying it into the class list.
//   - `twMerge` then resolves same-property Tailwind conflicts by which utility wins, not by CSS
//     source order: `cn("p-2", "p-4")` keeps only `p-4` (last one wins), where clsx alone would
//     emit `"p-2 p-4"` and leave the actual winner up to stylesheet order — invisible and fragile
//     once a component's own classes are merged with a caller-supplied `className` prop.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
