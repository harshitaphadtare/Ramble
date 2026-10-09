import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlaceUpdateItem } from '@ramble/shared';
import { createApp } from '../src/app';
import { buildSearchQuery, toItems } from '../src/lib/serpapi';
import { summariseUpdates } from '../src/lib/updatesSummary';

const reply = (text: string) => ({ text, meta: { contentChars: text.length, reasoningChars: 0 } });
const item: PlaceUpdateItem = { title: 'Merri Creek Trail closed near Arthurton Rd for works', snippet: 'Until 20 Oct.', source: 'City of Darebin', url: 'https://example.org/a' };

describe('serpapi helpers', () => {
  it('builds a focused query and adds the kind word only when missing', () => {
    expect(buildSearchQuery({ name: 'Edinburgh Gardens', kind: 'garden' })).toBe('"Edinburgh Gardens" (closure OR closed OR works OR event OR alert OR upgrade)');
    expect(buildSearchQuery({ name: 'Merri Creek', kind: 'trail' })).toContain('"Merri Creek" trail');
  });

  it('keeps only https links, cleans text and caps the count', () => {
    const items = toItems({
      organic_results: [
        { title: 'Good', link: 'https://example.org/x', snippet: 'ok' },
        { title: 'Script', link: 'javascript:alert(1)' },
        { title: 'Plain http', link: 'http://example.org/y' },
        ...Array.from({ length: 8 }, (_, i) => ({ title: `T${i}`, link: `https://e.org/${i}` })),
      ],
    });
    expect(items).toHaveLength(5);
    expect(items.every((i) => i.url.startsWith('https://'))).toBe(true);
    expect(toItems({ nonsense: true })).toEqual([]);
  });
});

describe('summariseUpdates', () => {
  it("says so plainly when there's nothing", async () => {
    expect(await summariseUpdates('X', [])).toMatchObject({ severity: 'none', source: 'none' });
  });

  it("uses Gemma's verdict, or the first headline if Gemma fails", async () => {
    const ok = await summariseUpdates('Merri Creek Trail', [item], vi.fn(async () => reply('{"headline":"Part of the trail is closed for works until 20 Oct.","severity":"caution"}')));
    expect(ok).toMatchObject({ severity: 'caution', source: 'gemma' });
    const bad = await summariseUpdates('Merri Creek Trail', [item], vi.fn(async () => reply('{"headline":"x","severity":"apocalypse"}')));
    expect(bad).toMatchObject({ headline: item.title, source: 'none' });
  });
});

describe('GET /api/place-updates', () => {
  afterEach(() => vi.unstubAllEnvs());
  const get = (app: ReturnType<typeof createApp>, q: string) => app.request(`/api/place-updates?${q}`, { headers: { 'sec-fetch-site': 'same-origin' } });

  it('is off (503) without a SerpApi key, and /api/features says so', async () => {
    vi.stubEnv('SERPAPI_KEY', '');
    const app = createApp();
    expect((await get(app, 'name=Edinburgh%20Gardens')).status).toBe(503);
    expect(await (await app.request('/api/features')).json()).toMatchObject({ placeUpdates: false });
  });

  it('caches per place for everyone and respects the daily search cap', async () => {
    const search = vi.fn(async () => [item]);
    const run = vi.fn(async () => reply('{"headline":"Partly closed for works.","severity":"caution"}'));
    const app = createApp({ placeUpdates: { search, run, dailySearches: 1 } });
    const first = await (await get(app, 'name=Merri%20Creek%20Trail&kind=trail')).json();
    const again = await (await get(app, 'name=merri%20creek%20trail&kind=trail')).json();
    expect(first).toMatchObject({ cached: false, summary: { severity: 'caution' } });
    expect(again).toMatchObject({ cached: true });
    expect(search).toHaveBeenCalledTimes(1);
    expect((await get(app, 'name=Another%20Park')).status).toBe(429); // cap of 1 used up
  });

  it('rejects odd input', async () => {
    const app = createApp({ placeUpdates: { search: vi.fn(async () => []) } });
    expect((await get(app, 'name=%3Cscript%3E')).status).toBe(400);
  });
});
