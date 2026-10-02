import { Column } from "~/components/ui/column";

// The questionnaire's fixed bottom bar — the one place Back / Skip / Next / Continue / Start
// live, on every step. Fixed rather than at the end of the content so the way forward is always
// on screen, however tall a step is (the reveal can be twelve rows).
//
// The gradient spans the viewport (content scrolls out from under it); the buttons sit in the
// same narrow column as the step above. Not wrapped in <Rise>, which would fight `fixed`.
export function StepBar({
  error,
  children,
}: {
  /** A failure to show above the buttons — here, not in the scrolling column, so it is seen. */
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="from-bg to-bg/0 fixed inset-x-0 bottom-0 z-20 bg-linear-to-t from-62% pt-5 pb-10">
      <Column width="narrow" className="px-6">
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
