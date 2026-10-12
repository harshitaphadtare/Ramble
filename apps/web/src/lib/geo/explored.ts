import type { FeatureCollection, Polygon } from 'geojson';
import type { LonLat } from './geo';

/**
 * Fog of war: the area around you is mist, and every place you've checked in at
 * clears a circle. "Explored %" = share of ~150 m cells within 1.5 km of the centre that are
 * clear. Everything is worked out on the device.
 */
export const FOG_RADIUS_M = 1500;
const DRAW_RADIUS_M = 2600;
const CLEAR_M = 220;
const CELL_M = 150;
const M_PER_DEG = 111_320;

const kx = (lat: number) => M_PER_DEG * Math.cos((lat * Math.PI) / 180);

function circle(center: LonLat, radiusM: number, steps = 48, reverse = false): LonLat[] {
  const pts: LonLat[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = ((reverse ? -1 : 1) * (i / steps) * 2 * Math.PI) % (2 * Math.PI);
    pts.push([center[0] + (Math.cos(a) * radiusM) / kx(center[1]), center[1] + (Math.sin(a) * radiusM) / M_PER_DEG]);
  }
  return pts;
}

/** The mist: a disc around the centre with a hole for every place you've been. */
export function fogGeoJSON(center: LonLat, visited: LonLat[]): FeatureCollection<Polygon> {
  const near = visited.filter((p) => Math.hypot((p[0] - center[0]) * kx(center[1]), (p[1] - center[1]) * M_PER_DEG) < DRAW_RADIUS_M);
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [circle(center, DRAW_RADIUS_M, 96), ...near.slice(0, 300).map((p) => circle(p, CLEAR_M, 32, true))] },
      },
    ],
  };
}

/** Share (0-100) of the area within FOG_RADIUS_M of the centre that you've uncovered. */
export function exploredPercent(center: LonLat, visited: LonLat[]): number {
  const k = kx(center[1]);
  const pts = visited.map((p) => [(p[0] - center[0]) * k, (p[1] - center[1]) * M_PER_DEG] as const);
  let total = 0;
  let clear = 0;
  for (let x = -FOG_RADIUS_M; x <= FOG_RADIUS_M; x += CELL_M) {
    for (let y = -FOG_RADIUS_M; y <= FOG_RADIUS_M; y += CELL_M) {
      if (Math.hypot(x, y) > FOG_RADIUS_M) continue;
      total++;
      if (pts.some(([px, py]) => Math.hypot(px - x, py - y) <= CLEAR_M)) clear++;
    }
  }
  return total ? Math.round((clear / total) * 100) : 0;
}
