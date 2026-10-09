import { serve } from '@hono/node-server';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createApp } from './app';
import { rootLogger } from './middleware/logger';

const here = path.dirname(fileURLToPath(import.meta.url));
// The built PWA sits at apps/web/dist; serve it whenever it has been built (in dev, Vite serves it instead).
const staticRoot = path.relative(process.cwd(), path.resolve(here, '../../web/dist'));
const port = Number(process.env.PORT ?? 8787);

const app = createApp({ staticRoot: existsSync(staticRoot) ? staticRoot : undefined });

serve({ fetch: app.fetch, port }, (info) => {
  rootLogger.info(`Ramble API listening on :${info.port}`);
});
