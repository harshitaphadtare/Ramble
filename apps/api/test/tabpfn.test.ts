import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERSONALIZE_COLUMNS_V1 } from '@ramble/shared';
import { createApp } from '../src/app';
import { lovedProbabilities, predictLoved, toCsv } from '../src/lib/tabpfn';

const row = (kind: number) => [kind, 0, 1, 0, 0, 0, 0, 2, 3, 0, 0, 2, 1];
const req = {
  columns: 'v1' as const,
  train: Array.from({ length: 16 }, (_, i) => row(i % 9)),
  labels: Array.from({ length: 16 }, (_, i) => (i % 4 === 0 ? 1 : 0)) as (0 | 1)[],
  test: [row(2), row(5)],
};

describe('tabpfn helpers', () => {
  it('writes CSV with a header row', () => {
    expect(toCsv(['a', 'b'], [[1, 2], [3, 4]])).toBe('a,b\n1,2\n3,4\n');
  });

  it('picks the probability of class 1 using the reported class order', () => {
    expect(lovedProbabilities([[0.3, 0.7], [0.9, 0.1]], [0, 1], 2)).toEqual([0.7, 0.1]);
    expect(lovedProbabilities([[0.7, 0.3]], ['1', '0'], 1)).toEqual([0.7]);
    expect(() => lovedProbabilities([[0.5, 0.5]], [0, 1], 2)).toThrow();
  });
});

describe('predictLoved (full REST flow against a fake Prior Labs)', () => {
  beforeEach(() => vi.stubEnv('TABPFN_API_KEY', 'test-key'));
  afterEach(() => vi.unstubAllEnvs());

  it('prepares, uploads anonymous CSVs, fits and predicts', async () => {
    const uploads: Record<string, string> = {};
    const target = (name: string) => ({ signed_urls: [`https://storage.example/${name}`], required_headers: { 'content-type': 'text/csv' } });
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (init.method === 'PUT') {
        uploads[url.split('/').pop()!] = String(init.body);
        return new Response('', { status: 200 });
      }
      expect((init.headers as Record<string, string>).authorization).toBe('Bearer test-key');
      const path = new URL(url).pathname;
      const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });
      if (path === '/tabpfn/prepare_train_set_upload') return json({ train_set_upload_id: 't1', x_train_info: target('x_train'), y_train_info: target('y_train') });
      if (path === '/tabpfn/fit') return new Response('   \n' + JSON.stringify({ fitted_train_set_id: 'f1' }), { status: 200 }); // keepalive whitespace
      if (path === '/tabpfn/prepare_test_set_upload') return json({ test_set_upload_id: 's1', x_test_info: target('x_test') });
      if (path === '/tabpfn/predict') return json({ prediction: [[0.2, 0.8], [0.6, 0.4]], metadata: { classes: [0, 1] } });
      return new Response('nope', { status: 404 });
    });

    const scores = await predictLoved(req, fetchMock as unknown as typeof fetch);
    expect(scores).toEqual([0.8, 0.4]);
    expect(uploads.x_train!.split('\n')[0]).toBe(PERSONALIZE_COLUMNS_V1.map((c) => c.name).join(','));
    expect(uploads.y_train!.startsWith('loved\n')).toBe(true);
    expect(uploads.x_test!.trim().split('\n')).toHaveLength(3);
    // Nothing but integers in the data rows: no names, coordinates or ids.
    expect(uploads.x_train!.split('\n').slice(1).join(',')).toMatch(/^[0-9,]*$/);
  });
});

describe('POST /api/personalize', () => {
  afterEach(() => vi.unstubAllEnvs());
  const post = (app: ReturnType<typeof createApp>, body: unknown) =>
    app.request('/api/personalize', { method: 'POST', headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' }, body: JSON.stringify(body) });

  it('is off without a key', async () => {
    vi.stubEnv('TABPFN_API_KEY', '');
    expect((await post(createApp(), req)).status).toBe(503);
  });

  it('validates rows strictly and returns scores', async () => {
    const app = createApp({ personalize: { predict: vi.fn(async () => [0.8, 0.4]) } });
    expect((await post(app, { ...req, train: req.train.slice(0, 5), labels: req.labels.slice(0, 5) })).status).toBe(400); // too few rows
    expect((await post(app, { ...req, test: [[...row(1).slice(0, 12), 99]] })).status).toBe(400); // value out of range
    expect((await post(app, { ...req, test: [['Edinburgh Gardens', ...row(1).slice(1)]] })).status).toBe(400); // text sneaking in
    expect(await (await post(app, req)).json()).toEqual({ scores: [0.8, 0.4] });
  });
});
