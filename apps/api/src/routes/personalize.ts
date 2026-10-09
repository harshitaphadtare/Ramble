import { Hono } from 'hono';
import { personalizeRequestSchema } from '@ramble/shared';
import { predictLoved, tabPfnKey, TabPfnUnavailableError } from '../lib/tabpfn';
import { createDailyBudget, createWindowLimiter, rateLimit, sameOriginOnly } from '../middleware/rateLimit';
import { err } from '../lib/errors';

export interface PersonalizeRouteOptions {
  perHour?: number;
  dailyBudget?: number;
  predict?: typeof predictLoved;
}

/** POST /api/personalize: anonymous numeric rows in, P(loved) per candidate out. Nothing is stored or logged. */
export function personalizeRoutes({ perHour = 10, dailyBudget = 200, predict = predictLoved }: PersonalizeRouteOptions = {}) {
  const r = new Hono();
  const budget = createDailyBudget(dailyBudget);

  r.use(sameOriginOnly());
  r.post('/', rateLimit(createWindowLimiter({ limit: perHour, windowMs: 60 * 60 * 1000 })), async (c) => {
    if (!tabPfnKey() && predict === predictLoved) return c.json(err('not_configured', 'Personalisation is not switched on'), 503);
    if (!c.req.header('content-type')?.startsWith('application/json')) return c.json(err('unsupported_media_type', 'Expected JSON'), 415);
    const parsed = personalizeRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json(err('invalid_request', 'Invalid request'), 400);
    if (!budget.take()) return c.json(err('busy', 'Daily limit reached'), 429);

    const log = c.get('log');
    const started = performance.now();
    try {
      const scores = await predict(parsed.data);
      log?.info({ task: 'personalize', train: parsed.data.train.length, test: parsed.data.test.length, ms: Math.round(performance.now() - started) });
      return c.json({ scores });
    } catch (e) {
      log?.warn({ task: 'personalize', why: e instanceof TabPfnUnavailableError ? e.message : 'unexpected error' }, 'tabpfn failed');
      return c.json(err('upstream_unavailable', 'Personalisation is unavailable right now'), 503);
    }
  });
  return r;
}
