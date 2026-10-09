import { placesResponseSchema, snapToGrid, type OutdoorPlace } from '@ramble/shared';
import type { LonLat } from '../geo/geo';

/**
 * Outdoor places near a point, via our API. Only the ~5 km grid cell leaves the device.
 * Render's free instance may need ~50 s to wake up, hence the generous timeout.
 */
export async function fetchPlacesNear([lon, lat]: LonLat, signal?: AbortSignal): Promise<OutdoorPlace[]> {
  const params = new URLSearchParams({ lat: snapToGrid(lat).toFixed(2), lon: snapToGrid(lon).toFixed(2) });
  const timeout = AbortSignal.timeout(70_000);
  const res = await fetch(`/api/places?${params}`, {
    credentials: 'same-origin',
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!res.ok) throw new Error(`places ${res.status}`);
  return placesResponseSchema.parse(await res.json()).places;
}
