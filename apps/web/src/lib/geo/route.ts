import { z } from 'zod';
import { distanceM, type LonLat } from './geo';

/** Walking speed for estimates when the router can't be reached (~4.8 km/h). */
const METRES_PER_SECOND = 80 / 60;
const OSRM_FOOT = 'https://routing.openstreetmap.de/routed-foot/route/v1/foot';

export interface WalkRoute {
  coords: LonLat[];
  distanceM: number;
  durationS: number;
  /** "osrm" = real footpaths; "straight" = as the crow flies (offline or router down). */
  source: 'osrm' | 'straight';
}

const osrmSchema = z.object({
  code: z.literal('Ok'),
  routes: z
    .array(
      z.object({
        distance: z.number().nonnegative(),
        duration: z.number().nonnegative(),
        geometry: z.object({ coordinates: z.array(z.tuple([z.number(), z.number()])).min(2).max(20_000) }),
      }),
    )
    .min(1),
});

export function straightRoute(from: LonLat, to: LonLat): WalkRoute {
  const d = distanceM(from, to);
  return { coords: [from, to], distanceM: d, durationS: d / METRES_PER_SECOND, source: 'straight' };
}

/**
 * Walking route along real paths (OSRM foot profile on the FOSSGIS server). The start and end
 * points are sent as-is: a route can't be planned otherwise (disclosed in SECURITY.md §5.8).
 */
export async function fetchWalkingRoute(from: LonLat, to: LonLat, signal?: AbortSignal): Promise<WalkRoute> {
  if (!navigator.onLine) return straightRoute(from, to);
  const pts = [from, to].map(([lon, lat]) => `${lon.toFixed(6)},${lat.toFixed(6)}`).join(';');
  try {
    const timeout = AbortSignal.timeout(12_000);
    const res = await fetch(`${OSRM_FOOT}/${pts}?overview=full&geometries=geojson`, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (!res.ok) return straightRoute(from, to);
    const route = osrmSchema.parse(await res.json()).routes[0]!;
    return { coords: route.geometry.coordinates, distanceM: route.distance, durationS: route.duration, source: 'osrm' };
  } catch (e) {
    if (signal?.aborted) throw e;
    return straightRoute(from, to);
  }
}

/** Remaining distance along the route from the point on it closest to `pos`. */
export function remainingAlongRoute(coords: LonLat[], pos: LonLat): number {
  if (coords.length < 2) return 0;
  let best = 0;
  let bestD = Infinity;
  coords.forEach((c, i) => {
    const d = distanceM(c, pos);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  let rest = distanceM(pos, coords[best]!);
  for (let i = best; i < coords.length - 1; i++) rest += distanceM(coords[i]!, coords[i + 1]!);
  return rest;
}
