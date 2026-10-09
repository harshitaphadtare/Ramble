import { serve } from '@hono/node-server';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { MongoClient } from 'mongodb';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { createApp, type AppOptions } from './app';
import { rootLogger } from './middleware/logger';
import { initTelemetry } from './lib/telemetry';
import { createAuth, resendSender } from './lib/auth';
import { MongoSyncStore } from './lib/syncStore';

initTelemetry();

const here = path.dirname(fileURLToPath(import.meta.url));
// The built PWA sits at apps/web/dist; serve it whenever it has been built (in dev, Vite serves it instead).
const staticRoot = path.relative(process.cwd(), path.resolve(here, '../../web/dist'));
const port = Number(process.env.PORT ?? 8787);

const env = (name: string) => {
  const v = process.env[name]?.trim();
  return v && v !== 'unset' ? v : undefined;
};

/** Accounts + encrypted sync switch on only when MongoDB and the auth settings are present. */
async function setUpAccounts(): Promise<AppOptions['accounts']> {
  const uri = env('MONGODB_URI');
  const secret = env('BETTER_AUTH_SECRET');
  const baseURL = env('BETTER_AUTH_URL');
  if (!uri || !secret || !baseURL) {
    rootLogger.info('accounts off (MONGODB_URI, BETTER_AUTH_SECRET or BETTER_AUTH_URL missing)');
    return undefined;
  }
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000, appName: 'ramble' });
  await client.connect();
  const db = client.db(env('MONGODB_DB') ?? 'ramble');
  const store = new MongoSyncStore(db);
  await store.ensureIndexes();
  rootLogger.info('accounts on (MongoDB connected)');
  return { auth: createAuth({ database: mongodbAdapter(db, { client }), baseURL, secret, sendEmail: resendSender() }), store };
}

const accounts = await setUpAccounts().catch((e: unknown) => {
  // The rest of Ramble keeps working without accounts.
  rootLogger.error({ err: (e as Error).message }, 'accounts unavailable: MongoDB connection failed');
  return undefined;
});

const app = createApp({ staticRoot: existsSync(staticRoot) ? staticRoot : undefined, accounts });

serve({ fetch: app.fetch, port }, (info) => {
  rootLogger.info(`Ramble API listening on :${info.port}`);
});
