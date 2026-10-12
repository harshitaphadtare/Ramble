import { z } from 'zod';
import type { PlaceKind, StopCategory } from '@ramble/shared';
import { distanceM, type LonLat } from '../geo/geo';

/**
 * Place search with Photon (open-source geocoder over OpenStreetMap, by Komoot). Only the typed
 * text and a rounded bias point are sent, never your exact location.
 */
const PHOTON = 'https://photon.komoot.io/api/';

export interface FoundPlace {
  id: string;
  name: string;
  /** Street / suburb, to tell same-named places apart. */
  detail: string;
  kind: PlaceKind;
  lonLat: LonLat;
}

/** OSM tags Photon can filter on, per stop category. */
const CATEGORY_TAGS: Record<StopCategory, string[]> = {
  cafe: ['amenity:cafe'],
  restaurant: ['amenity:restaurant'],
  fast_food: ['amenity:fast_food', 'amenity:restaurant'],
  bar: ['amenity:bar', 'amenity:pub'],
  bakery: ['shop:bakery'],
  ice_cream: ['amenity:ice_cream'],
  supermarket: ['shop:supermarket', 'shop:convenience'],
  bank: ['amenity:bank'],
  atm: ['amenity:atm', 'amenity:bank'],
  pharmacy: ['amenity:pharmacy'],
  park: ['leisure:park', 'leisure:garden'],
  beach: ['natural:beach'],
  viewpoint: ['tourism:viewpoint'],
  museum: ['tourism:museum', 'tourism:gallery'],
  library: ['amenity:library'],
  shop: ['shop'],
};

const featureSchema = z.object({
  geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]) }),
  properties: z
    .object({
      name: z.string().max(200).optional(),
      street: z.string().max(200).optional(),
      housenumber: z.string().max(40).optional(),
      district: z.string().max(200).optional(),
      locality: z.string().max(200).optional(),
      city: z.string().max(200).optional(),
      osm_id: z.number().optional(),
      osm_type: z.string().max(4).optional(),
      osm_key: z.string().max(60).optional(),
      osm_value: z.string().max(60).optional(),
    })
    .passthrough(),
});
const responseSchema = z.object({ features: z.array(z.unknown()).max(50) });

function kindFor(key = '', value = ''): PlaceKind {
  if (value === 'park') return 'park';
  if (value === 'garden') return 'garden';
  if (value === 'beach') return 'beach';
  if (value === 'viewpoint') return 'viewpoint';
  if (value === 'nature_reserve') return 'reserve';
  if (value === 'peak') return 'peak';
  if (key === 'natural' && value === 'water') return 'water';
  return 'other';
}

/** Rounded to ~1 km: enough to rank results, not enough to pinpoint anyone. */
const coarse = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

export async function searchPlaces(query: string, near: LonLat, opts: { category?: StopCategory | null; limit?: number; signal?: AbortSignal } = {}): Promise<FoundPlace[]> {
  const q = query.trim().slice(0, 120);
  if (q.length < 2) return [];
  const params = new URLSearchParams({ q, lat: coarse(near[1]), lon: coarse(near[0]), limit: String(opts.limit ?? 8), lang: 'en' });
  for (const tag of opts.category ? CATEGORY_TAGS[opts.category] : []) params.append('osm_tag', tag);
  const timeout = AbortSignal.timeout(10_000);
  const res = await fetch(`${PHOTON}?${params}`, {
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    signal: opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout,
  });
  if (!res.ok) throw new Error(`Place search failed (${res.status})`);
  const out: FoundPlace[] = [];
  const seen = new Set<string>();
  for (const raw of responseSchema.parse(await res.json()).features) {
    const f = featureSchema.safeParse(raw);
    if (!f.success) continue;
    const p = f.data.properties;
    const name = (p.name ?? [p.housenumber, p.street].filter(Boolean).join(' ')).trim();
    if (!name) continue;
    const [lon, lat] = f.data.geometry.coordinates;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const id = p.osm_type && p.osm_id ? `${p.osm_type}${p.osm_id}` : `${lon.toFixed(5)},${lat.toFixed(5)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const detail = [p.street && p.name ? [p.housenumber, p.street].filter(Boolean).join(' ') : null, p.district ?? p.locality, p.city].filter(Boolean).join(', ');
    out.push({ id: `photon:${id}`, name: name.slice(0, 80), detail: detail.slice(0, 120), kind: kindFor(p.osm_key, p.osm_value), lonLat: [lon, lat] });
  }
  return out;
}

/** The best match for a stop: the closest result to where it should be on the way. */
export async function findStop(query: string, near: LonLat, category: StopCategory | null, signal?: AbortSignal): Promise<FoundPlace | null> {
  let results = await searchPlaces(query, near, { category, limit: 10, signal });
  // "fish and chips" might not be in a shop's name: fall back to any place of that category nearby.
  if (!results.length && category) results = await searchPlaces(category.replace('_', ' '), near, { category, limit: 10, signal });
  if (!results.length) return null;
  // A named place ("St Kilda", "Comm Bank Bourke St"): trust Photon's ranking (already biased to
  // here). A kind of place ("coffee"): the closest one to where it fits on the way.
  if (!category) return results[0]!;
  return results.reduce((best, r) => (distanceM(r.lonLat, near) < distanceM(best.lonLat, near) ? r : best));
}
