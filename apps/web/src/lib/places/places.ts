import { placesResponseSchema, queryOverpass, snapToGrid, type OutdoorPlace } from '@ramble/shared';
import type { LonLat } from '../geo/geo';

/** Only the ~5 km grid cell leaves the device, never the exact position. */
const cell = ([lon, lat]: LonLat) => ({ lat: snapToGrid(lat), lon: snapToGrid(lon) });

/**
 * Overpass straight from the browser: the request comes from the user's own connection (Render's
 * shared IPs are often rate-limited). Overpass rejects anonymous browser requests, so this one
 * call sends our origin (just "https://ramble…/", no path) as the referrer.
 */
export function fetchPlacesDirect(origin: LonLat, signal?: AbortSignal): Promise<OutdoorPlace[]> {
  const { lat, lon } = cell(origin);
  return queryOverpass(lat, lon, { signal, timeoutMs: 15_000, init: { referrerPolicy: 'origin', credentials: 'omit' } });
}

/**
 * The same data via our API (shared 24 h cache, Ramble User-Agent). Render's free instance may
 * need ~50 s to wake up, hence the generous timeout.
 */
export async function fetchPlacesViaApi(origin: LonLat, signal?: AbortSignal): Promise<OutdoorPlace[]> {
  const { lat, lon } = cell(origin);
  const params = new URLSearchParams({ lat: lat.toFixed(2), lon: lon.toFixed(2) });
  const timeout = AbortSignal.timeout(70_000);
  const res = await fetch(`/api/places?${params}`, {
    credentials: 'same-origin',
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!res.ok) throw new Error(`places ${res.status}`);
  return placesResponseSchema.parse(await res.json()).places;
}

/** Whichever answers first with places wins; fails only if both fail. */
export function fetchPlacesNear(origin: LonLat, signal?: AbortSignal): Promise<OutdoorPlace[]> {
  const nonEmpty = (p: Promise<OutdoorPlace[]>) =>
    p.then((places) => {
      if (!places.length) throw new Error('no places');
      return places;
    });
  return Promise.any([nonEmpty(fetchPlacesDirect(origin, signal)), nonEmpty(fetchPlacesViaApi(origin, signal))]);
}
