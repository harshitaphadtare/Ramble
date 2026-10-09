/**
 * Gemma on Cloudflare Workers AI, called only from the server so the token stays secret
 * and Cloudflare never sees users' IP addresses. See docs/ARCHITECTURE.md §7.
 */
export const GEMMA_MODEL = '@cf/google/gemma-4-26b-a4b-it';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GemmaOptions {
  maxTokens?: number;
  temperature?: number;
  /** Abort if Workers AI is slow; the client falls back to rule-based output. */
  timeoutMs?: number;
}

export class AiUnavailableError extends Error {}

function config() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = process.env.CLOUDFLARE_AI_TOKEN?.trim();
  const usable = (v?: string) => !!v && v !== 'unset';
  return usable(accountId) && usable(token) ? { accountId: accountId!, token: token! } : null;
}

export function isAiConfigured() {
  return config() !== null;
}

export async function runGemma(
  messages: ChatMessage[],
  { maxTokens = 300, temperature = 0.4, timeoutMs = 15_000 }: GemmaOptions = {},
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const cfg = config();
  if (!cfg) throw new AiUnavailableError('Workers AI is not configured');

  const res = await fetchImpl(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(cfg.accountId)}/ai/run/${GEMMA_MODEL}`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ messages, max_tokens: maxTokens, temperature }),
      signal: AbortSignal.timeout(timeoutMs),
    },
  ).catch((e: unknown) => {
    throw new AiUnavailableError(`Workers AI request failed: ${(e as Error).name}`);
  });

  if (!res.ok) throw new AiUnavailableError(`Workers AI responded ${res.status}`);
  const body = (await res.json()) as {
    success?: boolean;
    result?: { response?: unknown; choices?: { message?: { content?: unknown } }[] };
  };
  const text = body.result?.response ?? body.result?.choices?.[0]?.message?.content;
  if (body.success === false || typeof text !== 'string') {
    throw new AiUnavailableError('Workers AI returned no text');
  }
  return text;
}
