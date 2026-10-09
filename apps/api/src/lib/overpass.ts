import { queryOverpass, type OutdoorPlace } from '@ramble/shared';

export { buildQuery, cleanName, parseElements } from '@ramble/shared';

/** Identifies Ramble to Overpass, as its usage policy asks of server-side clients. */
const USER_AGENT = 'Ramble/0.1 (+https://github.com/harshitaphadtare/Ramble)';

/**
 * Server-side Overpass call. Overpass is a busy, free community service: answers take 5–20 s
 * and it limits requests per IP (often hitting Render's shared IPs), so one retry after a
 * short pause covers transient failures.
 */
export async function fetchOutdoorPlaces(
  lat: number,
  lon: number,
  fetchImpl: typeof fetch = fetch,
  { timeoutMs = 30_000, retryDelayMs = 3_000 } = {},
): Promise<OutdoorPlace[]> {
  const run = () => queryOverpass(lat, lon, { fetchImpl, timeoutMs, init: { headers: { 'user-agent': USER_AGENT } } });
  try {
    return await run();
  } catch {
    await new Promise((r) => setTimeout(r, retryDelayMs));
    return run();
  }
}
