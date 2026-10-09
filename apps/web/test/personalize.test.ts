import { describe, expect, it } from 'vitest';
import { personalizeRequestSchema, type Place, type Visit } from '@ramble/shared';
import { buildRequest, distBucket, hourBucket, readiness } from '../src/lib/personalize/features';

const place = (i: number, kind: Place['kind'] = 'park'): Place => ({
  id: `p${i}`,
  name: `Secret spot ${i}`,
  kind,
  lonLat: [144.95 + i * 0.002, -37.8],
  wantToGo: false,
  createdAt: 1,
  updatedAt: 1,
});
const visit = (placeId: string, n: number): Visit => ({ id: `${placeId}-v${n}`, placeId, at: new Date(2026, 9, 10, 17, n).getTime(), updatedAt: 1 });

const places = Array.from({ length: 16 }, (_, i) => place(i, i % 2 ? 'viewpoint' : 'park'));
const visits = places.flatMap((p, i) => (i < 4 ? [visit(p.id, 1), visit(p.id, 2)] : [visit(p.id, 1)]));

describe('personalisation features', () => {
  it('buckets distances and hours', () => {
    expect([100, 700, 1500, 3000, 8000, 20000].map(distBucket)).toEqual([0, 1, 2, 3, 4, 5]);
    expect([6, 9, 12, 15, 18, 23].map(hourBucket)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('waits until there is enough history (cold start)', () => {
    expect(readiness(places.slice(0, 5), visits)).toMatchObject({ ready: false, needed: 15 });
    expect(buildRequest(places.slice(0, 5), visits, [])).toBeNull();
  });

  it('builds a request the server accepts, made only of small integers', () => {
    const req = buildRequest(places, visits, [{ id: 'n1', kind: 'viewpoint', lonLat: [144.96, -37.8] }])!;
    expect(personalizeRequestSchema.safeParse(req).success).toBe(true);
    expect(req.labels.filter((l) => l === 1)).toHaveLength(4);
    const serialised = JSON.stringify(req);
    expect(serialised).not.toMatch(/Secret|144\.9|-37\.8|p\d/); // no names, coordinates or ids
  });
});
