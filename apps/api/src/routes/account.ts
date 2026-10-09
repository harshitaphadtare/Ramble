import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { mediaUploadSchema, syncPullQuerySchema, syncPushSchema, vaultSchema } from '@ramble/shared';
import { err } from '../lib/errors';
import { QuotaExceededError, type SyncStore } from '../lib/syncStore';
import type { RambleAuth } from '../lib/auth';
import { createWindowLimiter, rateLimit, sameOriginOnly } from '../middleware/rateLimit';

declare module 'hono' {
  interface ContextVariableMap {
    userId: string;
  }
}

const MINUTE = 60 * 1000;

/**
 * Vault, sync, media and account deletion. Every handler scopes its queries by the user id from
 * the SESSION, never from the request (docs/SECURITY.md §7.2), so one user can't touch another's data.
 */
export function accountRoutes(auth: RambleAuth, store: SyncStore) {
  const r = new Hono();

  const requireAccount: MiddlewareHandler = async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers }).catch(() => null);
    if (!session?.user) return c.json(err('unauthorized', 'Sign in first'), 401);
    c.set('userId', session.user.id);
    await next();
  };

  const json = async <T>(c: Context, schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false } }) => {
    if (!c.req.header('content-type')?.startsWith('application/json')) return null;
    const parsed = schema.safeParse(await c.req.json().catch(() => null));
    return parsed.success ? parsed.data : null;
  };

  r.use(sameOriginOnly());
  r.use(requireAccount);

  r.get('/vault', rateLimit(createWindowLimiter({ limit: 30, windowMs: MINUTE })), async (c) => {
    const vault = await store.getVault(c.get('userId'));
    return vault ? c.json(vault) : c.json(err('not_found', 'No vault yet'), 404);
  });

  r.put('/vault', rateLimit(createWindowLimiter({ limit: 5, windowMs: MINUTE })), async (c) => {
    const vault = await json(c, vaultSchema);
    if (!vault) return c.json(err('invalid_request', 'Invalid vault'), 400);
    await store.putVault(c.get('userId'), vault);
    return c.json({ ok: true });
  });

  r.post('/sync/push', rateLimit(createWindowLimiter({ limit: 60, windowMs: MINUTE })), async (c) => {
    const body = await json(c, syncPushSchema);
    if (!body) return c.json(err('invalid_request', 'Invalid envelopes'), 400);
    try {
      const seq = await store.push(c.get('userId'), body.envelopes);
      return c.json({ seq });
    } catch (e) {
      if (e instanceof QuotaExceededError) return c.json(err('quota', 'Storage limit reached'), 413);
      throw e;
    }
  });

  r.get('/sync/pull', rateLimit(createWindowLimiter({ limit: 60, windowMs: MINUTE })), async (c) => {
    const q = syncPullQuerySchema.safeParse({ since: c.req.query('since'), limit: c.req.query('limit') });
    if (!q.success) return c.json(err('invalid_request', 'Invalid cursor'), 400);
    const envelopes = await store.pull(c.get('userId'), q.data.since, q.data.limit + 1);
    const more = envelopes.length > q.data.limit;
    const page = envelopes.slice(0, q.data.limit);
    return c.json({ envelopes: page, nextSeq: page.at(-1)?.seq ?? q.data.since, more });
  });

  const mediaId = (c: Context) => (/^[0-9a-f-]{36}$/.test(c.req.param('id') ?? '') ? c.req.param('id')! : null);

  r.put('/media/:id', rateLimit(createWindowLimiter({ limit: 30, windowMs: MINUTE })), bodyLimit({ maxSize: 3 * 1024 * 1024, onError: (c) => c.json(err('too_large', 'Photo too large'), 413) }), async (c) => {
    const id = mediaId(c);
    const body = await json(c, mediaUploadSchema);
    if (!id || !body) return c.json(err('invalid_request', 'Invalid photo'), 400);
    try {
      await store.putMedia(c.get('userId'), id, body);
      return c.json({ ok: true });
    } catch (e) {
      if (e instanceof QuotaExceededError) return c.json(err('quota', 'Photo storage is full'), 413);
      throw e;
    }
  });

  r.get('/media/:id', rateLimit(createWindowLimiter({ limit: 120, windowMs: MINUTE })), async (c) => {
    const id = mediaId(c);
    const media = id ? await store.getMedia(c.get('userId'), id) : null;
    return media ? c.json(media) : c.json(err('not_found', 'Not found'), 404);
  });

  /** Deletes everything this account stored, then the account itself. */
  r.delete('/', rateLimit(createWindowLimiter({ limit: 2, windowMs: 60 * MINUTE })), async (c) => {
    const userId = c.get('userId');
    await store.deleteUser(userId);
    const ctx = await auth.$context;
    await ctx.internalAdapter.deleteUserSessions(userId);
    await ctx.internalAdapter.deleteAccounts(userId);
    await ctx.internalAdapter.deleteUser(userId);
    return c.json({ ok: true });
  });

  return r;
}
