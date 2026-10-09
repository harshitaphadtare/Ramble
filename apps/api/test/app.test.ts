import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';

describe('api', () => {
  const app = createApp();

  it('answers health checks', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('sets the strict security headers on every response', async () => {
    const res = await app.request('/api/health');
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(res.headers.get('strict-transport-security')).toContain('max-age=63072000');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('returns a generic JSON 404 for unknown API routes', async () => {
    const res = await app.request('/api/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: 'not_found', message: 'Not found' } });
  });

  it('rejects oversized bodies', async () => {
    const size = 300 * 1024;
    const res = await app.request('/api/health', {
      method: 'POST',
      body: 'x'.repeat(size),
      headers: { 'content-type': 'application/json', 'content-length': String(size) },
    });
    expect(res.status).toBe(413);
  });
});
