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

/** Safe-to-log facts about a reply: no prompt or output text, ever. */
export interface GemmaMeta {
  finishReason?: string;
  contentChars: number;
  reasoningChars: number;
  promptTokens?: number;
  completionTokens?: number;
}

export interface GemmaResult {
  text: string;
  meta: GemmaMeta;
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

interface WorkersAiBody {
  success?: boolean;
  result?: {
    response?: unknown;
    choices?: { finish_reason?: string; message?: { content?: unknown; reasoning_content?: unknown; reasoning?: unknown } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
}

export async function runGemma(
  messages: ChatMessage[],
  { maxTokens = 1200, temperature = 0.4, timeoutMs = 20_000 }: GemmaOptions = {},
  fetchImpl: typeof fetch = fetch,
): Promise<GemmaResult> {
  const cfg = config();
  if (!cfg) throw new AiUnavailableError('Workers AI is not configured');

  const res = await fetchImpl(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(cfg.accountId)}/ai/run/${GEMMA_MODEL}`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        messages,
        // Gemma 4 is a reasoning model: thinking would eat the token budget for a short JSON
        // answer, so it's switched off for these tasks.
        chat_template_kwargs: { enable_thinking: false },
        max_completion_tokens: maxTokens,
        temperature,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    },
  ).catch((e: unknown) => {
    throw new AiUnavailableError(`Workers AI request failed: ${(e as Error).name}`);
  });

  if (!res.ok) throw new AiUnavailableError(`Workers AI responded ${res.status}`);
  const body = (await res.json()) as WorkersAiBody;
  const choice = body.result?.choices?.[0];
  const raw = body.result?.response ?? choice?.message?.content;
  const reasoning = choice?.message?.reasoning_content ?? choice?.message?.reasoning;
  // Some models return already-parsed JSON in `response`.
  const text = typeof raw === 'string' ? raw : raw && typeof raw === 'object' ? JSON.stringify(raw) : undefined;
  if (body.success === false || text === undefined) {
    throw new AiUnavailableError('Workers AI returned no text');
  }
  return {
    text,
    meta: {
      finishReason: choice?.finish_reason,
      contentChars: text.length,
      reasoningChars: typeof reasoning === 'string' ? reasoning.length : 0,
      promptTokens: body.result?.usage?.prompt_tokens,
      completionTokens: body.result?.usage?.completion_tokens,
    },
  };
}
