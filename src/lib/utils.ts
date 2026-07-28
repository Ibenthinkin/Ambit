import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

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
