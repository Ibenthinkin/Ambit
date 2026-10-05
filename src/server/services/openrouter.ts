// The OpenRouter transport: one chat completion that must answer in JSON. A leaf (its only
// import is the abort error) so two very different callers can share it:
//
//   - services/curator.ts — ingest's judge: thousands of calls, retried, cached (it was the
//     only caller until 10-02-26, and this function lived there);
//   - services/interview-interpret.ts — the questionnaire's free-text questions: one call per
//     sign-up, inside a web request, with a timeout and no retry.
//
// Lifted out rather than imported from the curator so the web server doesn't bundle the curator
// (sharp, the Claude CLI judge, the prompts) to make one request. One client, two callers.
import { CuratorAbortError } from "./curator-errors";

/**
 * OpenRouter statuses that describe the *account*, not the request (09-08-26). 401 is a bad key;
 * 402 is an empty wallet. Neither is transient, so a caller with a retry loop must not retry
 * them — walk 3 retried a 402 four times per item for eighteen hours. Thrown as
 * CuratorAbortError so every caller can tell them from an ordinary failure.
 */
export const OPENROUTER_ABORT_STATUSES: ReadonlySet<number> = new Set([
  401, 402,
]);

export type OpenRouterContent =
  | string
  | (
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    )[];

/** One chat completion. An account-level status throws CuratorAbortError; any other non-2xx a
 *  plain Error; a missing key a plain Error too (callers that can run without one check first). */
export async function openRouterComplete(req: {
  model: string;
  system: string;
  content: OpenRouterContent;
  /** Reserved against the key's budget before dispatch — always set it (see the curator's
   *  CURATOR_MAX_TOKENS for what happens when a provider reserves a whole output window). */
  maxTokens: number;
  /** Lets a caller with a deadline abandon the request. */
  signal?: AbortSignal;
}): Promise<{ reply: string; tokens: number }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not set — required for curateItems() (add it to .env).",
    );
  }
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: req.model,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.content },
      ],
      // Asks the provider to guarantee syntactically valid JSON output.
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: req.maxTokens,
    }),
    signal: req.signal,
  });
  if (!res.ok) {
    const detail = `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`;
    // Account-level, not item-level: thrown past the retry in callCurator and past the fallback
    // in curateItems. Retrying a 402 four times per item is how walk 3 ran for eighteen hours.
    if (OPENROUTER_ABORT_STATUSES.has(res.status))
      throw new CuratorAbortError(
        `OpenRouter ${detail} — ${res.status === 402 ? "the account is out of credits" : "the API key was rejected"}; nothing written, re-run after fixing the account`,
        res.status,
      );
    throw new Error(detail);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { total_tokens?: number };
  };
  return {
    reply: json.choices?.[0]?.message?.content ?? "{}",
    tokens: json.usage?.total_tokens ?? 0,
  };
}
