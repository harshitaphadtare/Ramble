import type { MiddlewareHandler } from 'hono';
import { pino, type Logger } from 'pino';

declare module 'hono' {
  interface ContextVariableMap {
    log: Logger;
  }
}

/**
 * Logs method, route, status and duration only. Bodies, cookies, auth headers and
 * query strings are never logged (docs/SECURITY.md §7.7).
 */
export const rootLogger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]', '*.body'],
    remove: true,
  },
});

export function logger(): MiddlewareHandler {
  return async (c, next) => {
    const start = performance.now();
    const log = rootLogger.child({ reqId: c.get('requestId') });
    c.set('log', log);
    await next();
    // Render pings /api/health every few seconds; logging those would bury everything else.
    if (!c.req.path.startsWith('/api') || c.req.path === '/api/health') return;
    log.info({ method: c.req.method, path: c.req.path, status: c.res.status, ms: Math.round(performance.now() - start) });
  };
}
