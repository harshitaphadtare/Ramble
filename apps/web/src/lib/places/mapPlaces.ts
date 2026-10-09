import type { Map as MapLibreMap, GeoJSONFeature } from 'maplibre-gl';
import type { OutdoorPlace, PlaceKind } from '@ramble/shared';

/**
 * Fallback place source: the OpenMapTiles vector tiles already on screen (OpenFreeMap) carry
 * named parks and points of interest. Reading them needs no server, no third party and works
 * offline for any area the map has shown. Used when the Overpass-backed API is unavailable.
 */
const SOURCE = 'openmaptiles';

/** OpenMapTiles `poi` class/subclass values we treat as outdoor places. */
function kindFromPoi(cls: string, subclass: string): PlaceKind | null {
  switch (subclass) {
    case 'viewpoint':
      return 'viewpoint';
    case 'garden':
      return 'garden';
    case 'nature_reserve':
      return 'reserve';
    case 'picnic_site':
      return 'picnic';
    case 'beach':
      return 'beach';
    case 'peak':
      return 'peak';
    case 'waterfall':
      return 'water';
    case 'park':
    case 'playground':
      return 'park';
  }
  if (cls === 'park') return 'park';
  return null;
}

/** A representative point for any geometry: the point itself, or the middle of its bounding box. */
function anchor(f: GeoJSONFeature): [number, number] | null {
  const g = f.geometry;
  if (g.type === 'Point') return g.coordinates as [number, number];
  const coords: number[][] =
    g.type === 'Polygon' ? g.coordinates.flat() : g.type === 'MultiPolygon' ? g.coordinates.flat(2) : g.type === 'MultiPoint' ? g.coordinates : [];
  if (coords.length === 0) return null;
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of coords) {
    if (x! < minX) minX = x!;
    if (x! > maxX) maxX = x!;
    if (y! < minY) minY = y!;
    if (y! > maxY) maxY = y!;
  }
  return [(minX + maxX) / 2, (minY + maxY) / 2];
}

function clean(name: unknown): string {
  return typeof name === 'string'
    ? name.replace(/[^\p{L}\p{M}\p{N} '’.,&()\-/]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
    : '';
}

export function placesFromMap(map: MapLibreMap): OutdoorPlace[] {
  if (!map.getSource(SOURCE)) return [];
  const out = new Map<string, OutdoorPlace>();

  const add = (f: GeoJSONFeature, kind: PlaceKind | null) => {
    const name = clean(f.properties?.name ?? f.properties?.['name:latin']);
    const at = anchor(f);
    if (!kind || !name || !at) return;
    // Tiles split big parks across tiles: one entry per name + kind.
    const key = `${kind}:${name.toLowerCase()}`;
    if (out.has(key)) return;
    const id = `m${Math.abs(hash(key))}`.slice(0, 16);
    out.set(key, { id, name, kind, lon: Number(at[0].toFixed(6)), lat: Number(at[1].toFixed(6)) });
  };

  for (const f of map.querySourceFeatures(SOURCE, { sourceLayer: 'poi' })) {
    add(f, kindFromPoi(String(f.properties?.class ?? ''), String(f.properties?.subclass ?? '')));
  }
  for (const f of map.querySourceFeatures(SOURCE, { sourceLayer: 'park' })) {
    add(f, String(f.properties?.class ?? '') === 'nature_reserve' ? 'reserve' : 'park');
  }
  return [...out.values()].slice(0, 400);
}

/**
 * Named parks and POIs only appear in OpenMapTiles data from zoom 14, so zoom in around the
 * origin first and wait for those tiles before reading them.
 */
export async function placesFromMapAround(map: MapLibreMap, origin: [number, number], timeoutMs = 8000): Promise<OutdoorPlace[]> {
  if (map.getZoom() < 14.5 || map.getBounds().contains(origin) === false) {
    const idle = new Promise<void>((resolve) => {
      const t = setTimeout(resolve, timeoutMs);
      map.once('idle', () => {
        clearTimeout(t);
        resolve();
      });
    });
    map.easeTo({ center: origin, zoom: 14.5, duration: 500 });
    await idle;
  }
  return placesFromMap(map);
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
