import type { OutdoorPlace, PlaceKind } from '@ramble/shared';

/**
 * Named outdoor places from OpenStreetMap (Overpass API), fetched by the server so we can
 * identify ourselves as Overpass asks, cache per grid cell, and keep users' IPs private.
 */
const MIRRORS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
const USER_AGENT = 'Ramble/0.1 (+https://github.com/harshitaphadtare/Ramble)';

/** Half-width of the box around a grid cell centre, in degrees (~4.4 km north-south). */
const HALF = 0.04;

/**
 * Named lakes (natural=water polygons) and hiking-route relations are left out: they made
 * Overpass time out (504) in testing on Oct 10. The light query answers in ~5 s.
 */
export function buildQuery(lat: number, lon: number): string {
  const bbox = [lat - HALF, lon - HALF, lat + HALF, lon + HALF].map((v) => v.toFixed(3)).join(',');
  return `[out:json][timeout:20];
(
  nwr["leisure"~"^(park|garden|nature_reserve)$"]["name"](${bbox});
  nwr["tourism"~"^(viewpoint|picnic_site)$"]["name"](${bbox});
  nwr["natural"~"^(peak|beach)$"]["name"](${bbox});
  node["waterway"="waterfall"]["name"](${bbox});
);
out center tags 800;`;
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function kindOf(t: Record<string, string>): PlaceKind {
  if (t.tourism === 'viewpoint') return 'viewpoint';
  if (t.tourism === 'picnic_site') return 'picnic';
  if (t.natural === 'peak') return 'peak';
  if (t.natural === 'beach') return 'beach';
  if (t.natural === 'water' || t.waterway === 'waterfall') return 'water';
  if (t.route === 'hiking') return 'trail';
  if (t.leisure === 'nature_reserve') return 'reserve';
  if (t.leisure === 'garden') return 'garden';
  if (t.leisure === 'park') return 'park';
  return 'other';
}

/** OSM names are untrusted: keep only characters the rest of the system accepts, cap length. */
export function cleanName(name: string): string {
  return name
    .replace(/[^\p{L}\p{M}\p{N} '’.,&()\-/]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

export function parseElements(elements: OverpassElement[], centre?: { lat: number; lon: number }): OutdoorPlace[] {
  const out = new Map<string, OutdoorPlace>();
  for (const e of elements) {
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    const name = cleanName(e.tags?.name ?? '');
    if (lat === undefined || lon === undefined || !name || !Number.isInteger(e.id)) continue;
    const id = `${e.type[0]}${e.id}`;
    out.set(id, { id, name, kind: kindOf(e.tags ?? {}), lon: Number(lon.toFixed(6)), lat: Number(lat.toFixed(6)) });
  }
  const places = [...out.values()];
  // Overpass returns places in id order, so cap by distance from the cell centre, not arbitrarily.
  if (centre) {
    const d = (p: OutdoorPlace) => (p.lat - centre.lat) ** 2 + ((p.lon - centre.lon) * Math.cos((centre.lat * Math.PI) / 180)) ** 2;
    places.sort((a, b) => d(a) - d(b));
  }
  return places.slice(0, 400);
}

/**
 * Overpass is a busy, free community service: answers take 5–20 s and it limits concurrent
 * requests per IP (429). One retry after a short pause covers most transient failures.
 */
export async function fetchOutdoorPlaces(
  lat: number,
  lon: number,
  fetchImpl: typeof fetch = fetch,
  { timeoutMs = 30_000, retryDelayMs = 3_000 } = {},
): Promise<OutdoorPlace[]> {
  try {
    return await raceMirrors(lat, lon, fetchImpl, timeoutMs);
  } catch {
    await new Promise((r) => setTimeout(r, retryDelayMs));
    return raceMirrors(lat, lon, fetchImpl, timeoutMs);
  }
}

/** Races the mirrors; the first good answer wins and the others are cancelled. */
async function raceMirrors(lat: number, lon: number, fetchImpl: typeof fetch, timeoutMs: number): Promise<OutdoorPlace[]> {
  const body = new URLSearchParams({ data: buildQuery(lat, lon) }).toString();
  const controllers = MIRRORS.map(() => new AbortController());
  const timer = setTimeout(() => controllers.forEach((c) => c.abort()), timeoutMs);
  try {
    const json = await Promise.any(
      MIRRORS.map(async (url, i) => {
        const res = await fetchImpl(url, {
          method: 'POST',
          body,
          headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': USER_AGENT, accept: 'application/json' },
          signal: controllers[i]!.signal,
        });
        if (!res.ok) throw new Error(`Overpass ${res.status}`);
        return (await res.json()) as { elements?: OverpassElement[] };
      }),
    );
    return parseElements(json.elements ?? [], { lat, lon });
  } finally {
    clearTimeout(timer);
    controllers.forEach((c) => c.abort());
  }
}
