import { describe, expect, it } from 'vitest';
import { distanceM, type LonLat } from '../src/lib/geo/geo';
import { remainingAlongRoute, straightRoute } from '../src/lib/geo/route';

const A: LonLat = [144.96, -37.81];
const B: LonLat = [144.965, -37.81];
const C: LonLat = [144.965, -37.815];

describe('route maths', () => {
  it('straight-line fallback estimates time at walking pace', () => {
    const r = straightRoute(A, B);
    expect(r.source).toBe('straight');
    expect(r.distanceM).toBeCloseTo(distanceM(A, B), 5);
    expect(r.durationS).toBeCloseTo(r.distanceM / (80 / 60), 5);
  });

  it('measures what is left along the route from the nearest point', () => {
    const total = distanceM(A, B) + distanceM(B, C);
    expect(remainingAlongRoute([A, B, C], A)).toBeCloseTo(total, 0);
    expect(remainingAlongRoute([A, B, C], B)).toBeCloseTo(distanceM(B, C), 0);
    expect(remainingAlongRoute([A, B, C], C)).toBeCloseTo(0, 0);
  });
});
