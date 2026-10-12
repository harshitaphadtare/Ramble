import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { parseTripPlan, planTrip } from '../src/lib/tripPlan';

const reply = (text: string) => ({ text, meta: { contentChars: text.length, reasoningChars: 0 } });
const ST_KILDA = JSON.stringify({
  stops: [
    { query: 'coffee', category: 'cafe', leg: 'out' },
    { query: 'fish and chips', category: 'fast_food', leg: 'out' },
    { query: 'St Kilda', category: null, leg: 'out' },
    { query: 'Commonwealth Bank', category: 'bank', leg: 'back' },
  ],
  returnHome: true,
  mode: null,
  backMode: null,
});

describe('trip planning', () => {
  it('keeps well-formed stops in order and drops junk', () => {
    const plan = parseTripPlan(`Sure! ${ST_KILDA}`)!;
    expect(plan.stops.map((s) => s.query)).toEqual(['coffee', 'fish and chips', 'St Kilda', 'Commonwealth Bank']);
    expect(plan.returnHome).toBe(true);
    const odd = parseTripPlan(JSON.stringify({ stops: [{ query: 'x', category: 'casino', leg: 'sideways' }, { nope: 1 }], mode: 'teleport' }))!;
    expect(odd.stops).toEqual([{ query: 'x', category: null, leg: 'out' }]);
    expect(odd.mode).toBeNull();
    expect(parseTripPlan('{"stops":[]}')).toBeNull();
  });

  it('falls back to an empty plan when Gemma fails', async () => {
    const plan = await planTrip({ text: 'beach then home' }, { run: vi.fn(async () => reply('no idea')) });
    expect(plan).toMatchObject({ stops: [], source: 'none' });
  });

  it('POST /api/ai/plan-trip validates input and returns stops', async () => {
    const app = createApp({ ai: { run: vi.fn(async () => reply(ST_KILDA)) } });
    const post = (body: unknown) =>
      app.request('/api/ai/plan-trip', { method: 'POST', headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' }, body: JSON.stringify(body) });
    expect((await post({ text: '' })).status).toBe(400);
    const res = await post({ text: 'St Kilda today, coffee and fish and chips on the way, Comm Bank on the way back' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ source: 'gemma', returnHome: true });
  });
});
