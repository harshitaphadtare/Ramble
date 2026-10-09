import { Hono } from 'hono';
import { placeUpdatesQuerySchema, type PlaceUpdatesResponse } from '@ramble/shared';
import { searchPlaceUpdates, serpApiKey, SerpApiUnavailableError } from '../lib/serpapi';
import { summariseUpdates } from '../lib/updatesSummary';
import { createDailyBudget, createWindowLimiter, rateLimit, sameOriginOnly } from '../middleware/rateLimit';
import { err } from '../lib/errors';
import type { runGemma } from '../lib/workersAi';

export interface PlaceUpdatesRouteOptions {
  perHour?: number;
  /** SerpApi's free plan is ~250 searches/month, so cap fresh searches per day. */
  dailySearches?: number;
  search?: typeof searchPlaceUpdates;
  run?: typeof runGemma;
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * GET /api/place-updates?name=&kind=. Results are public web data, so one 24 h cache is shared
 * by everyone looking at that place; only cache misses spend SerpApi quota.
 */
export function placeUpdatesRoutes({ perHour = 10, dailySearches = 8, search = searchPlaceUpdates, run }: PlaceUpdatesRouteOptions = {}) {
  const r = new Hono();
  const cache = new Map<string, { at: number; body: Omit<PlaceUpdatesResponse, 'cached'> }>();
  const budget = createDailyBudget(dailySearches);

  r.use(sameOriginOnly());
  r.get('/', rateLimit(createWindowLimiter({ limit: perHour, windowMs: 60 * 60 * 1000 })), async (c) => {
    if (!serpApiKey() && search === searchPlaceUpdates) return c.json(err('not_configured', 'Place updates are not switched on'), 503);
    const q = placeUpdatesQuerySchema.safeParse({ name: c.req.query('name'), kind: c.req.query('kind') || undefined });
    if (!q.success) return c.json(err('invalid_request', 'Invalid request'), 400);

    const key = `${q.data.name.toLowerCase()}|${q.data.kind ?? ''}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < DAY) return c.json({ ...hit.body, cached: true });
    if (!budget.take()) return c.json(err('busy', 'Daily limit reached; try again tomorrow'), 429);

    const log = c.get('log');
    try {
      const items = await search(q.data);
      const summary = await summariseUpdates(q.data.name, items, run);
      const body = { items, summary, fetchedAt: new Date().toISOString() };
      cache.set(key, { at: Date.now(), body });
      if (cache.size > 1000) cache.delete(cache.keys().next().value!);
      // Counts only; the place name is public but still not logged.
      log?.info({ task: 'place-updates', items: items.length, severity: summary.severity, gemma: summary.source === 'gemma' });
      return c.json({ ...body, cached: false });
    } catch (e) {
      log?.warn({ task: 'place-updates', why: e instanceof SerpApiUnavailableError ? e.message : 'unexpected error' }, 'place updates failed');
      if (hit) return c.json({ ...hit.body, cached: true });
      return c.json(err('upstream_unavailable', 'Updates are unavailable right now'), 503);
    }
  });
  return r;
}
