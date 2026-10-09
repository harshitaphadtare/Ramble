import { Hono, type Context } from 'hono';
import type { ZodType } from 'zod';
import { polishRequestSchema, rulePicks, suggestRequestSchema } from '@ramble/shared';
import { suggest, type SuggestDeps } from '../lib/suggest';
import { polish } from '../lib/polish';
import { createDailyBudget, createWindowLimiter, rateLimit, sameOriginOnly } from '../middleware/rateLimit';
import { err } from '../lib/errors';

export interface AiRouteOptions {
  /** Per-IP limit for /suggest. */
  perHour?: number;
  /** Per-IP limit for /polish (user-initiated, so lower). */
  polishPerHour?: number;
  /** Global Gemma calls per UTC day across all tasks; after that, rules / unchanged notes. */
  dailyBudget?: number;
  run?: SuggestDeps['run'];
}

const HOUR = 60 * 60 * 1000;

/** Parses a JSON body against a schema; on failure, hands back the 4xx response to send. */
async function readJson<T>(c: Context, schema: ZodType<T>): Promise<{ ok: true; data: T } | { ok: false; res: Response }> {
  if (!c.req.header('content-type')?.startsWith('application/json')) {
    return { ok: false, res: c.json(err('unsupported_media_type', 'Expected JSON'), 415) };
  }
  const parsed = schema.safeParse(await c.req.json().catch(() => null));
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, res: c.json(err('invalid_request', 'Invalid request'), 400) };
}

export function aiRoutes({ perHour = 30, polishPerHour = 20, dailyBudget = 400, run }: AiRouteOptions = {}) {
  const r = new Hono();
  const budget = createDailyBudget(dailyBudget);

  r.use(sameOriginOnly());

  r.post('/suggest', rateLimit(createWindowLimiter({ limit: perHour, windowMs: HOUR })), async (c) => {
    const body = await readJson(c, suggestRequestSchema);
    if (!body.ok) return body.res;
    const log = c.get('log');
    const started = performance.now();
    if (!budget.take()) {
      log?.warn({ task: 'suggest' }, 'daily AI budget used up; answering with rules');
      return c.json({ picks: rulePicks(body.data.context, body.data.candidates), source: 'rules' });
    }
    const result = await suggest(body.data, {
      run,
      // Diagnostics only: finish reason, character and token counts. Never the prompt or reply.
      onMeta: (meta) => log?.info({ task: 'suggest', ...meta }, 'gemma reply'),
      onFallback: (why, meta) => log?.warn({ task: 'suggest', why, ...meta }, 'gemma fallback'),
    });
    log?.info({ task: 'suggest', source: result.source, ms: Math.round(performance.now() - started), n: body.data.candidates.length });
    return c.json(result);
  });

  // The note is private: it is never logged, only its processing metrics (docs/SECURITY.md §7.7).
  r.post('/polish', rateLimit(createWindowLimiter({ limit: polishPerHour, windowMs: HOUR })), async (c) => {
    const body = await readJson(c, polishRequestSchema);
    if (!body.ok) return body.res;
    const log = c.get('log');
    if (!budget.take()) {
      log?.warn({ task: 'polish' }, 'daily AI budget used up');
      return c.json({ title: '', body: body.data.note, tags: [], source: 'none' });
    }
    const result = await polish(body.data, {
      run,
      onMeta: (meta) => log?.info({ task: 'polish', ...meta }, 'gemma reply'),
      onFallback: (why) => log?.warn({ task: 'polish', why }, 'gemma fallback'),
    });
    return c.json(result);
  });

  return r;
}
