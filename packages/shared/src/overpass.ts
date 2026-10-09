import type { OutdoorPlace, PlaceKind } from './index';

/**
 * Overpass (OpenStreetMap) query + parsing, shared by the browser and the server so both build
 * exactly the same request and clean the results the same way. Callers add their own transport:
 * the server sends a User-Agent; the browser sends only its origin as referrer (Overpass rejects
 * anonymous browser requests).
 */
export const OVERPASS_MIRRORS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];

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

export interface OverpassElement {
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

/** Races the mirrors with the given request options; the first good answer wins, the rest are cancelled. */
export async function queryOverpass(
  lat: number,
  lon: number,
  { fetchImpl = fetch, init = {}, timeoutMs = 25_000, signal }: { fetchImpl?: typeof fetch; init?: RequestInit; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<OutdoorPlace[]> {
  const body = new URLSearchParams({ data: buildQuery(lat, lon) }).toString();
  const controllers = OVERPASS_MIRRORS.map(() => new AbortController());
  const abortAll = () => controllers.forEach((c) => c.abort());
  const timer = setTimeout(abortAll, timeoutMs);
  signal?.addEventListener('abort', abortAll, { once: true });
  try {
    const json = await Promise.any(
      OVERPASS_MIRRORS.map(async (url, i) => {
        const res = await fetchImpl(url, {
          ...init,
          method: 'POST',
          body,
          headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json', ...(init.headers as Record<string, string> | undefined) },
          signal: controllers[i]!.signal,
        });
        if (!res.ok) throw new Error(`Overpass ${res.status}`);
        return (await res.json()) as { elements?: OverpassElement[] };
      }),
    );
    return parseElements(json.elements ?? [], { lat, lon });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abortAll);
    abortAll();
  }
}
