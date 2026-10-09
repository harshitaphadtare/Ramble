import { Hono } from 'hono';
import { placesQuerySchema, type OutdoorPlace } from '@ramble/shared';
import { fetchOutdoorPlaces } from '../lib/overpass';
import { createWindowLimiter, rateLimit, sameOriginOnly } from '../middleware/rateLimit';
import { err } from '../lib/errors';

export interface PlacesRouteOptions {
  perHour?: number;
  fetchPlaces?: (lat: number, lon: number) => Promise<OutdoorPlace[]>;
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * GET /api/places?lat=&lon= with a grid-snapped centre. Public OSM data, so one cache serves
 * everyone and Overpass (a free community service) sees one request per cell per day.
 */
export function placesRoutes({ perHour = 60, fetchPlaces = (lat, lon) => fetchOutdoorPlaces(lat, lon) }: PlacesRouteOptions = {}) {
  const r = new Hono();
  const cache = new Map<string, { places: OutdoorPlace[]; at: number }>();
  const inflight = new Map<string, Promise<OutdoorPlace[]>>();

  r.use(sameOriginOnly());
  r.get('/', rateLimit(createWindowLimiter({ limit: perHour, windowMs: 60 * 60 * 1000 })), async (c) => {
    const q = placesQuerySchema.safeParse({ lat: c.req.query('lat'), lon: c.req.query('lon') });
    if (!q.success) return c.json(err('invalid_request', 'Invalid request'), 400);
    const key = `${q.data.lat.toFixed(2)},${q.data.lon.toFixed(2)}`;

    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < DAY) return c.json({ places: hit.places });

    try {
      // Concurrent requests for the same cell share one Overpass call.
      let pending = inflight.get(key);
      if (!pending) {
        pending = fetchPlaces(q.data.lat, q.data.lon).finally(() => inflight.delete(key));
        inflight.set(key, pending);
      }
      const places = await pending;
      cache.set(key, { places, at: Date.now() });
      if (cache.size > 500) cache.delete(cache.keys().next().value!);
      return c.json({ places });
    } catch (e) {
      // Upstream status codes only (e.g. "Overpass 429"), never coordinates.
      const reasons = e instanceof AggregateError ? e.errors.map((x: unknown) => String((x as Error)?.message ?? x)) : [String((e as Error)?.message ?? e)];
      c.get('log')?.warn({ task: 'places', reasons }, 'overpass unavailable');
      if (hit) return c.json({ places: hit.places }); // stale beats nothing
      return c.json(err('upstream_unavailable', 'Places are unavailable right now'), 503);
    }
  });
  return r;
}
