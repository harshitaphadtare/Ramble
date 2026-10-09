import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiUnavailableError, GEMMA_MODEL, isAiConfigured, runGemma } from '../src/lib/workersAi';

const ok = (result: unknown) =>
  vi.fn(async () => new Response(JSON.stringify({ success: true, result }), { status: 200 }));

describe('workersAi', () => {
  beforeEach(() => {
    process.env.CLOUDFLARE_ACCOUNT_ID = 'acct123';
    process.env.CLOUDFLARE_AI_TOKEN = 'tok456';
  });
  afterEach(() => {
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_AI_TOKEN;
  });

  it('treats missing or "unset" credentials as not configured', async () => {
    process.env.CLOUDFLARE_AI_TOKEN = 'unset';
    expect(isAiConfigured()).toBe(false);
    await expect(runGemma([{ role: 'user', content: 'hi' }])).rejects.toBeInstanceOf(AiUnavailableError);
  });

  it('calls the pinned Gemma model with a bearer token and returns the text', async () => {
    const fetchMock = ok({ response: '{"picks":[]}' });
    const text = await runGemma([{ role: 'user', content: 'hi' }], {}, fetchMock);
    expect(text).toBe('{"picks":[]}');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.cloudflare.com/client/v4/accounts/acct123/ai/run/${GEMMA_MODEL}`);
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok456');
  });

  it('accepts OpenAI-style responses too', async () => {
    const text = await runGemma([{ role: 'user', content: 'hi' }], {}, ok({ choices: [{ message: { content: 'hello' } }] }));
    expect(text).toBe('hello');
  });

  it('turns HTTP errors and empty results into AiUnavailableError (so callers fall back to rules)', async () => {
    const failing = vi.fn(async () => new Response('nope', { status: 429 }));
    await expect(runGemma([{ role: 'user', content: 'hi' }], {}, failing)).rejects.toBeInstanceOf(AiUnavailableError);
    await expect(runGemma([{ role: 'user', content: 'hi' }], {}, ok({}))).rejects.toBeInstanceOf(AiUnavailableError);
  });
});
