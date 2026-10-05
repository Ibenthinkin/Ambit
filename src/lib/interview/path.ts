// "Which answers lead to these topics?" — the pure mirror of e2e's `completeOnboarding` helper.
// The Playwright helper reads each answer button's `data-topics` and presses the ones that hold a
// wanted topic; this function makes the same decisions from the bank alone, so bank.test.ts can
// prove — without a browser — that a path to astronomy + botany + music exists on both database
// shapes. If you change the rules here, change the helper in e2e/support.ts to match.
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

    // Free text is the model's business and the reading amount isn't a topic: both skipped.
    if (q.kind === "text" || q.kind === "amount") {
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
