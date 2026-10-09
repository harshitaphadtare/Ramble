import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { serveStatic } from '@hono/node-server/serve-static';
import { requestId } from 'hono/request-id';
import { SECURITY_HEADERS, contentSecurityPolicy } from './security';
import { logger } from './middleware/logger';

export interface AppOptions {
  /** Directory with the built PWA. Omit to serve the API only (dev / tests). */
  staticRoot?: string;
}

export function createApp({ staticRoot }: AppOptions = {}) {
  const app = new Hono();

  app.use(requestId());
  app.use(logger());

  // Security headers on every response, static files included.
  app.use(async (c, next) => {
    await next();
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) c.header(k, v);
    c.header('Content-Security-Policy', contentSecurityPolicy({ allowBlobScripts: c.req.path === '/spike.html' }));
  });

  const api = new Hono();
  api.use(bodyLimit({ maxSize: 256 * 1024, onError: (c) => c.json(err('too_large', 'Request too large'), 413) }));
  api.use(async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
  });

  api.get('/health', (c) => c.json({ ok: true }));

  // Catch-all must be registered last: a mounted sub-app's notFound handler is never used by the parent.
  api.all('*', (c) => c.json(err('not_found', 'Not found'), 404));
  api.onError((e, c) => {
    c.get('log')?.error({ err: e }, 'unhandled');
    return c.json(err('internal', 'Something went wrong'), 500);
  });

  app.route('/api', api);

  if (staticRoot) {
    // Hashed build assets never change, so they can be cached forever.
    app.use('/assets/*', async (c, next) => {
      await next();
      if (c.res.ok) c.header('Cache-Control', 'public, max-age=31536000, immutable');
    });
    app.use('/*', serveStatic({ root: staticRoot }));
    // SPA fallback: unknown paths get the app shell, which must always be revalidated.
    app.get('*', serveStatic({ root: staticRoot, path: 'index.html' }));
    app.use('*', async (c, next) => {
      await next();
      const p = c.req.path;
      if (p === '/' || p.endsWith('.html') || p === '/sw.js') c.header('Cache-Control', 'no-cache');
    });
  }

  return app;
}

export function err(code: string, message: string) {
  return { error: { code, message } };
}
