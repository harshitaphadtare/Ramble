/**
 * Local testing only: runs the full app with accounts backed by memory instead of MongoDB.
 *   npm run build && npm run dev:accounts   → http://localhost:8788
 * Everything is lost when it stops. Never used in production (render.yaml starts index.ts).
 */
import { serve } from '@hono/node-server';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { createApp } from './app';
import { createAuth } from './lib/auth';
import { MemorySyncStore } from './lib/syncStore';

const port = 8788;
const here = path.dirname(fileURLToPath(import.meta.url));
const staticRoot = path.relative(process.cwd(), path.resolve(here, '../../web/dist'));
const auth = createAuth({
  database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
  baseURL: `http://localhost:${port}`,
  secret: 'local-dev-only-secret-not-for-production',
});

serve({ fetch: createApp({ staticRoot, accounts: { auth, store: new MemorySyncStore() } }).fetch, port }, () => {
  console.log(`Ramble with in-memory accounts on http://localhost:${port}`);
});
