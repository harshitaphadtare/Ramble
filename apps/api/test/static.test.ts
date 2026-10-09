import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app';

describe('static app serving', () => {
  let root: string;
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'ramble-static-'));
    writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>Ramble</title>');
    mkdirSync(path.join(root, 'assets'));
    writeFileSync(path.join(root, 'assets', 'main-abc123.js'), 'console.log(1)');
    // serveStatic resolves roots relative to the working directory.
    app = createApp({ staticRoot: path.relative(process.cwd(), root) });
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('serves the app shell with no-cache', async () => {
    const res = await app.request('/');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<title>Ramble</title>');
    expect(res.headers.get('cache-control')).toBe('no-cache');
  });

  it('falls back to the app shell for app routes', async () => {
    const res = await app.request('/journal');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<title>Ramble</title>');
    expect(res.headers.get('cache-control')).toBe('no-cache');
  });

  it('returns a real 404 for missing files instead of the app shell', async () => {
    const res = await app.request('/wasm/litertlm/missing.js');
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain('<title>Ramble</title>');
  });

  it('caches hashed assets forever', async () => {
    const res = await app.request('/assets/main-abc123.js');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });

  it('serves the same strict script-src on every page', async () => {
    const scriptSrc = async (url: string) =>
      ((await app.request(url)).headers.get('content-security-policy') ?? '')
        .split(';')
        .map((d) => d.trim())
        .find((d) => d.startsWith('script-src'));
    expect(await scriptSrc('/')).toBe("script-src 'self' 'wasm-unsafe-eval'");
    expect(await scriptSrc('/journal')).toBe("script-src 'self' 'wasm-unsafe-eval'");
  });
});
