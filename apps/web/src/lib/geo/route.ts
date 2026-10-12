import { z } from 'zod';
import { distanceM, type LonLat } from './geo';

/** How you're getting there (or back). Public transport isn't routed in-app yet. */
export type TravelMode = 'walk' | 'bike' | 'car';

export const MODE_LABEL: Record<TravelMode, string> = { walk: 'Walk', bike: 'Cycle', car: 'Drive' };

/** Speeds for estimates when the router can't be reached. */
const METRES_PER_SECOND: Record<TravelMode, number> = { walk: 80 / 60, bike: 250 / 60, car: 500 / 60 };
/** OSRM servers on FOSSGIS, one per profile (the profile segment in the path is ignored). */
const OSRM: Record<TravelMode, string> = {
  walk: 'https://routing.openstreetmap.de/routed-foot/route/v1/driving',
  bike: 'https://routing.openstreetmap.de/routed-bike/route/v1/driving',
  car: 'https://routing.openstreetmap.de/routed-car/route/v1/driving',
};

export interface WalkRoute {
  coords: LonLat[];
  distanceM: number;
  durationS: number;
  /** "osrm" = real paths/roads; "straight" = as the crow flies (offline or router down). */
  source: 'osrm' | 'straight';
  mode: TravelMode;
}

const osrmSchema = z.object({
  code: z.literal('Ok'),
  routes: z
    .array(
      z.object({
        distance: z.number().nonnegative(),
        duration: z.number().nonnegative(),
        geometry: z.object({ coordinates: z.array(z.tuple([z.number(), z.number()])).min(2).max(50_000) }),
      }),
    )
    .min(1),
});

export function straightRoute(points: LonLat[], mode: TravelMode = 'walk'): WalkRoute {
  let d = 0;
  for (let i = 0; i < points.length - 1; i++) d += distanceM(points[i]!, points[i + 1]!);
  return { coords: points, distanceM: d, durationS: d / METRES_PER_SECOND[mode], source: 'straight', mode };
}

/**
 * Route through every point in order (start, stops…, end) along real paths (OSRM on the FOSSGIS
 * server). The points are sent as-is: a route can't be planned otherwise (SECURITY.md §5.8).
 */
export async function fetchRoute(points: LonLat[], mode: TravelMode, signal?: AbortSignal): Promise<WalkRoute> {
  if (points.length < 2) throw new Error('A route needs a start and an end');
  if (!navigator.onLine) return straightRoute(points, mode);
  const pts = points.map(([lon, lat]) => `${lon.toFixed(6)},${lat.toFixed(6)}`).join(';');
  try {
    const timeout = AbortSignal.timeout(15_000);
    const res = await fetch(`${OSRM[mode]}/${pts}?overview=full&geometries=geojson`, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (!res.ok) return straightRoute(points, mode);
    const route = osrmSchema.parse(await res.json()).routes[0]!;
    return { coords: route.geometry.coordinates, distanceM: route.distance, durationS: route.duration, source: 'osrm', mode };
  } catch (e) {
    if (signal?.aborted) throw e;
    return straightRoute(points, mode);
  }
}

export const fetchWalkingRoute = (from: LonLat, to: LonLat, signal?: AbortSignal) => fetchRoute([from, to], 'walk', signal);

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

/** Minutes for a distance at a mode's typical speed (for remaining-time estimates). */
export const minutesFor = (m: number, mode: TravelMode = 'walk') => Math.max(1, Math.round(m / METRES_PER_SECOND[mode] / 60));
