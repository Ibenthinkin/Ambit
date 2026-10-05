import { Column } from "~/components/ui/column";

// The questionnaire's fixed bottom bar — the one place Back / Skip / Next / Continue / Start
// live, on every step. Fixed rather than at the end of the content so the way forward is always
// on screen, however tall a step is (the reveal can be twelve rows).
//
// The gradient spans the viewport (content scrolls out from under it); the buttons sit in the
// same column as the step above — narrow for words, wide for pictures (lib/interview/layout.ts),
// so Next stays at the right edge of what the reader is looking at. Not wrapped in <Rise>, which
// would fight `fixed`.
export function StepBar({
  error,
  width = "narrow",
  children,
}: {
  /** A failure to show above the buttons — here, not in the scrolling column, so it is seen. */
  error?: string;
  /** The step's own column width. */
  width?: "narrow" | "wide";
  children: React.ReactNode;
}) {
  return (
    <div className="from-bg to-bg/0 fixed inset-x-0 bottom-0 z-20 bg-linear-to-t from-62% pt-5 pb-10">
      <Column width={width} className="px-6">
        {error && (
          <div
            role="alert"
            data-testid="onboarding-error"
            className="text-error mb-3 text-center font-sans text-[12.5px]"
          >
            {error}
          </div>
        )}
        <div className="flex items-center justify-end gap-[14px]">
          {children}
        </div>
      </Column>
    </div>
  );
}
