import type { Context, MiddlewareHandler } from 'hono';

/**
 * Small in-memory limiters. Good enough for one Render instance; they move to MongoDB with
 * sessions in P2 (docs/ARCHITECTURE.md §11). Counters reset if the instance restarts.
 */

/**
 * Client IP as seen by Render's proxy. A client can prepend fake X-Forwarded-For values, but
 * the proxy appends the real address, so we use the right-most entry.
 */
export function clientIp(c: Context): string {
  const xff = c.req.header('x-forwarded-for');
  if (xff) {
    const last = xff.split(',').pop()?.trim();
    if (last) return last;
  }
  return 'unknown';
}

interface Bucket {
  count: number;
  resetAt: number;
}

export function createWindowLimiter({ limit, windowMs, now = Date.now }: { limit: number; windowMs: number; now?: () => number }) {
  const buckets = new Map<string, Bucket>();
  return {
    /** Returns true if this hit is allowed. */
    hit(key: string): boolean {
      const t = now();
      if (buckets.size > 10_000) for (const [k, b] of buckets) if (b.resetAt <= t) buckets.delete(k);
      const b = buckets.get(key);
      if (!b || b.resetAt <= t) {
        buckets.set(key, { count: 1, resetAt: t + windowMs });
        return true;
      }
      b.count += 1;
      return b.count <= limit;
    },
  };
}

/** A global per-UTC-day budget, e.g. to stay inside the Workers AI free allocation. */
export function createDailyBudget(limit: number, now = Date.now) {
  let day = '';
  let used = 0;
  return {
    take(): boolean {
      const today = new Date(now()).toISOString().slice(0, 10);
      if (today !== day) {
        day = today;
        used = 0;
      }
      if (used >= limit) return false;
      used += 1;
      return true;
    },
  };
}

export function rateLimit(limiter: ReturnType<typeof createWindowLimiter>): MiddlewareHandler {
  return async (c, next) => {
    if (!limiter.hit(clientIp(c))) {
      return c.json({ error: { code: 'rate_limited', message: 'Too many requests, try again later' } }, 429);
    }
    await next();
  };
}

/**
 * Browsers send Sec-Fetch-Site; reject requests that come from other websites. Not a substitute
 * for sessions (scripts can omit the header), but it stops other sites using our quota.
 */
export function sameOriginOnly(): MiddlewareHandler {
  return async (c, next) => {
    const site = c.req.header('sec-fetch-site');
    if (site && site !== 'same-origin' && site !== 'none') {
      return c.json({ error: { code: 'forbidden', message: 'Forbidden' } }, 403);
    }
    await next();
  };
}
