import { Hono } from 'hono';
import { rulePicks, suggestRequestSchema } from '@ramble/shared';
import { suggest, type SuggestDeps } from '../lib/suggest';
import { createDailyBudget, createWindowLimiter, rateLimit, sameOriginOnly } from '../middleware/rateLimit';
import { err } from '../lib/errors';

export interface AiRouteOptions {
  /** Per-IP limit for /suggest. */
  perHour?: number;
  /** Global Gemma calls per UTC day (the rest are answered by rules). ~13 neurons each. */
  dailyBudget?: number;
  run?: SuggestDeps['run'];
}

export function aiRoutes({ perHour = 30, dailyBudget = 400, run }: AiRouteOptions = {}) {
  const r = new Hono();
  const budget = createDailyBudget(dailyBudget);

  r.use(sameOriginOnly());

  r.post('/suggest', rateLimit(createWindowLimiter({ limit: perHour, windowMs: 60 * 60 * 1000 })), async (c) => {
    if (!c.req.header('content-type')?.startsWith('application/json')) {
      return c.json(err('unsupported_media_type', 'Expected JSON'), 415);
    }
    const parsed = suggestRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json(err('invalid_request', 'Invalid request'), 400);

    const log = c.get('log');
    const started = performance.now();
    if (!budget.take()) {
      log?.warn({ task: 'suggest' }, 'daily AI budget used up; answering with rules');
      return c.json({ picks: rulePicks(parsed.data.context, parsed.data.candidates), source: 'rules' });
    }
    const result = await suggest(parsed.data, {
      run,
      onFallback: (why) => log?.warn({ task: 'suggest', why }, 'gemma fallback'),
    });
    // Metrics only: never prompts, outputs or place names (docs/SECURITY.md §7.7).
    log?.info({ task: 'suggest', source: result.source, ms: Math.round(performance.now() - started), n: parsed.data.candidates.length });
    return c.json(result);
  });

  return r;
}
