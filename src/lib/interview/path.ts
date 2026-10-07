// "Which answers lead to these topics?" — the pure mirror of e2e's `answerQuestionnaire` helper.
// The Playwright helper reads each answer's `data-topics` and presses the ones that hold a wanted
// topic; this function makes the same decisions from the bank alone, so bank.test.ts can prove —
// without a browser — that a path to astronomy + botany + music (every spec's reader) and to
// geology + music (the retake spec's) exists on both database shapes. If you change the rules
// here, change the helper in e2e/support.ts to match.
//
// How each answer below is said on bank v3's screens (question-step.tsx), so the two stay one:
//   SKIP      rooms' and pairs' "Skip", "I’d rather look at pictures", "Nowhere in particular",
//             Rather not's "Continue" with nothing chosen, the bonus's blank "Continue to your
//             exhibition", or Pass on every card of the keep stack
//   EITHER    a pair's "Both, equally"
//   one key   a tap on a pair's side or a choice's card (the screen moves on by itself)
//   keys      the keep stack's Keep on each hit card (Pass on the rest); any other multi's hits,
//             then "Continue"
import { askable } from "./askable";
import { EITHER, SKIP } from "./config";
import { scoreAnswers } from "./score";
import { shown } from "./show";
import { optionAdds } from "./targets";
import type { Answer, Question } from "./types";

export function answersToward(
  bank: readonly Question[],
  listed: ReadonlySet<string>,
  wanted: readonly string[],
): Answer[] {
  const want = new Set(wanted);
  const skip = (q: Question): Answer => ({ questionId: q.id, keys: [SKIP] });
  const out: Answer[] = [];

  // Sequential, not a map: a `show.top` question's options depend on the answers before it,
  // exactly as the screen computes them (show.ts over the scores so far).
  for (const asked of askable(bank, listed)) {
    const q = shown(asked, scoreAnswers(bank, out, listed), listed);

    // Free text is the model's business: skipped. (Bank v2's reading-amount question was
    // skipped here too; v3 moved it to the reveal, where e2e sets it.)
    if (q.kind === "text") {
      out.push(skip(q));
      continue;
    }

    // The answers that would *add* something wanted, in the order they're shown.
    const hits = q.options
      .filter((o) => optionAdds(o, listed).some((t) => want.has(t)))
      .map((o) => o.key);
    if (hits.length === 0) {
      out.push(skip(q));
      continue;
    }

    if (q.kind === "pair")
      out.push({ questionId: q.id, keys: hits.length > 1 ? [EITHER] : hits });
    else if (q.kind === "choice")
      out.push({ questionId: q.id, keys: [hits[0]!] });
    else
      out.push({ questionId: q.id, keys: hits.slice(0, q.max ?? hits.length) });
  }
  return out;
}
