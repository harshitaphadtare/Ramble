import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { serveStatic } from '@hono/node-server/serve-static';
import { requestId } from 'hono/request-id';
import { SECURITY_HEADERS } from './security';
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
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) c.header(k, v);  });

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
    // Caching rules must be registered before the static handlers, which end the chain.
    app.use('*', async (c, next) => {
      await next();
      const p = c.req.path;
      if (p.startsWith('/assets/') && c.res.ok) {
        // Hashed build assets never change, so they can be cached forever.
        c.header('Cache-Control', 'public, max-age=31536000, immutable');
      } else if (p === '/' || p.endsWith('.html') || p === '/sw.js' || !hasExtension(p)) {
        // The app shell and service worker must always be revalidated so updates arrive.
        c.header('Cache-Control', 'no-cache');
      }
    });
    app.use('/*', serveStatic({ root: staticRoot }));
    // SPA fallback only for app routes. A missing file (e.g. /wasm/x.js) is a real 404,
    // never index.html pretending to be a script.
    app.get('*', async (c, next) => {
      if (hasExtension(c.req.path)) return c.text('Not found', 404);
      return serveStatic({ root: staticRoot, path: 'index.html' })(c, next);
    });
  }

  return app;
}

export function err(code: string, message: string) {
  return { error: { code, message } };
}

function hasExtension(path: string) {
  return /\.[a-z0-9]+$/i.test(path.split('/').pop() ?? '');
}
