import { describe, expect, it, vi } from 'vitest';
import { candidateSchema, rankByRules, rulePicks, snapToGrid, type Candidate, type OutdoorPlace } from '@ramble/shared';
import { buildQuery, cleanName, fetchOutdoorPlaces, parseElements } from '../src/lib/overpass';
import { createApp } from '../src/app';

describe('overpass', () => {
  it('queries a box around the grid-cell centre', () => {
    expect(buildQuery(-37.8, 144.95)).toContain('(-37.840,144.910,-37.760,144.990)');
  });

  it('parses named places, maps kinds and drops unnamed ones', () => {
    const places = parseElements([
      { type: 'node', id: 1, lat: -37.8, lon: 144.9, tags: { tourism: 'viewpoint', name: 'Lookout' } },
      { type: 'way', id: 2, center: { lat: -37.81, lon: 144.91 }, tags: { leisure: 'park', name: 'Edinburgh Gardens' } },
      { type: 'relation', id: 3, center: { lat: -37.82, lon: 144.92 }, tags: { route: 'hiking', name: 'Merri Creek Trail' } },
      { type: 'node', id: 4, lat: -37.8, lon: 144.9, tags: { leisure: 'park' } },
    ]);
    expect(places.map((p) => [p.id, p.kind])).toEqual([
      ['n1', 'viewpoint'],
      ['w2', 'park'],
      ['r3', 'trail'],
    ]);
  });

  it('cleans OSM names so they pass the suggest schema', () => {
    const name = cleanName('<img src=x onerror=alert(1)> Park 🌳');
    expect(name).not.toMatch(/[<>=]/);
    expect(candidateSchema.safeParse({ id: 'n1', kind: 'park', name, distM: 10, visits: 0 }).success).toBe(true);
  });

  it('identifies itself to Overpass with a User-Agent', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ elements: [] }), { status: 200 }));
    await fetchOutdoorPlaces(-37.8, 144.95, fetchMock as unknown as typeof fetch);
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)['user-agent']).toMatch(/^Ramble\//);
  });
});

describe('GET /api/places', () => {
  const sample: OutdoorPlace[] = [{ id: 'n1', name: 'Lookout', kind: 'viewpoint', lon: 144.9, lat: -37.8 }];
  const get = (app: ReturnType<typeof createApp>, q: string) => app.request(`/api/places?${q}`, { headers: { 'sec-fetch-site': 'same-origin' } });

  it('only accepts grid-snapped coordinates (never an exact position)', async () => {
    const app = createApp({ places: { fetchPlaces: vi.fn(async () => sample) } });
    expect((await get(app, 'lat=-37.81234&lon=144.98765')).status).toBe(400);
    expect(snapToGrid(-37.81234)).toBe(-37.8);
    expect((await get(app, 'lat=-37.80&lon=145.00')).status).toBe(200);
  });

  it('caches per cell so Overpass is called once', async () => {
    const fetchPlaces = vi.fn(async () => sample);
    const app = createApp({ places: { fetchPlaces } });
    const a = await (await get(app, 'lat=-37.80&lon=144.95')).json();
    await get(app, 'lat=-37.80&lon=144.95');
    expect(a).toEqual({ places: sample });
    expect(fetchPlaces).toHaveBeenCalledTimes(1);
  });

  it('returns 503 when Overpass is down and nothing is cached', async () => {
    const app = createApp({ places: { fetchPlaces: vi.fn(async () => { throw new Error('busy'); }) } });
    expect((await get(app, 'lat=-37.80&lon=144.95')).status).toBe(503);
  });
});

describe('rule ranker', () => {
  const ctx = { minutes: 60, mood: 'views' as const, energy: 'easy' as const, sunsetInMin: 90 };
  const c = (id: string, kind: Candidate['kind'], distM: number, visits = 0): Candidate => ({ id, kind, name: id, distM, visits });

  it('drops places that do not fit the time budget and prefers the mood', () => {
    const ranked = rankByRules(ctx, [c('far', 'viewpoint', 5000), c('park', 'park', 800), c('view', 'viewpoint', 900)]);
    expect(ranked.map((x) => x.id)).toEqual(['view', 'park']);
  });

  it('writes a reason with the walking time', () => {
    const [pick] = rulePicks(ctx, [c('view', 'viewpoint', 800)]);
    expect(pick!.reason).toMatch(/^10 min walk to this lookout/);
  });
});
