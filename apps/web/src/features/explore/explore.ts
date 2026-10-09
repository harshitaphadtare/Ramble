import * as SunCalc from 'suncalc';
import {
  rankByRules,
  rulePicks,
  suggestResponseSchema,
  walkMinutes,
  type Candidate,
  type Energy,
  type Mood,
  type Pick,
  type OutdoorPlace,
  type SuggestContext,
  snapToGrid,
} from '@ramble/shared';
import { distanceM, type LonLat } from '../../lib/geo/geo';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { fetchPlacesNear } from '../../lib/places/places';
import { placesFromMapAround } from '../../lib/places/mapPlaces';

export interface ExplorePrefs {
  minutes: number;
  mood: Mood;
  energy: Energy;
}

export interface ExploreCard {
  place: OutdoorPlace;
  reason: string;
  walkMin: number;
}

export interface ExploreResult {
  cards: ExploreCard[];
  source: 'gemma' | 'rules';
  /** True while Gemma's picks are still on their way. */
  refining: boolean;
}

// Places don't change minute to minute. Public OSM data, so a plain on-device cache is fine.
const areaCache = new Map<string, OutdoorPlace[]>();
const WEEK = 7 * 24 * 60 * 60 * 1000;
const storeKey = (cell: string) => `ramble.places.v1.${cell}`;

function readStored(cell: string): OutdoorPlace[] | null {
  try {
    const raw = localStorage.getItem(storeKey(cell));
    if (!raw) return null;
    const { at, places } = JSON.parse(raw) as { at: number; places: OutdoorPlace[] };
    return Date.now() - at < WEEK && Array.isArray(places) ? places : null;
  } catch {
    return null;
  }
}

function writeStored(cell: string, places: OutdoorPlace[]) {
  try {
    localStorage.setItem(storeKey(cell), JSON.stringify({ at: Date.now(), places }));
  } catch {
    /* storage full or blocked: the in-memory cache still works */
  }
}

/** How long to wait for the API before using the map tiles instead. */
const API_PATIENCE_MS = 8000;

/**
 * Best source first: memory → this device (7 days) → our API (OSM via Overpass) → the map
 * tiles already on screen. Overpass is often slow or rate-limited from Render, so the API gets
 * API_PATIENCE_MS; after that the tile places are used and the API keeps going in the
 * background to fill the cache for next time. Explore never waits long and never dead-ends.
 */
async function placesNear(origin: LonLat, map: MapLibreMap | null, signal?: AbortSignal): Promise<OutdoorPlace[]> {
  const cell = `${snapToGrid(origin[1])},${snapToGrid(origin[0])}`;
  const hit = areaCache.get(cell) ?? readStored(cell);
  if (hit) return hit;

  const fromApi = fetchPlacesNear(origin, signal).then((places) => {
    areaCache.set(cell, places);
    if (areaCache.size > 8) areaCache.delete(areaCache.keys().next().value!);
    writeStored(cell, places);
    return places;
  });
  fromApi.catch(() => {}); // a late failure after we've moved on is fine

  const patience = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), API_PATIENCE_MS));
  try {
    const first = await Promise.race([fromApi, patience]);
    if (first !== 'timeout' && first.length) return first;
  } catch (e) {
    if (signal?.aborted) throw e;
  }

  const fromMap = map ? await placesFromMapAround(map, origin) : [];
  if (fromMap.length) return fromMap; // not cached: the API may still deliver the fuller list
  return fromApi; // nothing on the map either: wait for the API after all
}

export function minutesToSunset(origin: LonLat, now = new Date()): number {
  const { sunset } = SunCalc.getTimes(now, origin[1], origin[0]);
  // No sunset today (polar summer): treat as plenty of daylight.
  if (!sunset || Number.isNaN(sunset.getTime())) return 1440;
  return Math.max(-1440, Math.min(1440, Math.round((sunset.getTime() - now.getTime()) / 60_000)));
}

function toCards(picks: Pick[], byId: Map<string, OutdoorPlace>, distById: Map<string, number>): ExploreCard[] {
  return picks.flatMap((p) => {
    const place = byId.get(p.id);
    return place ? [{ place, reason: p.reason, walkMin: walkMinutes(distById.get(p.id) ?? 0) }] : [];
  });
}

/**
 * Rules first (instant, works offline), then Gemma refines the same cards when online.
 * `onResult` is called once or twice. Throws only if places can't be loaded at all.
 */
export async function explore(
  origin: LonLat,
  prefs: ExplorePrefs,
  onResult: (r: ExploreResult) => void,
  { map = null, signal }: { map?: MapLibreMap | null; signal?: AbortSignal } = {},
) {
  const places = await placesNear(origin, map, signal);
  const byId = new Map(places.map((p) => [p.id, p]));
  const distById = new Map(places.map((p) => [p.id, Math.round(distanceM(origin, [p.lon, p.lat]))]));

  const context: SuggestContext = { ...prefs, sunsetInMin: minutesToSunset(origin) };
  const candidates: Candidate[] = places
    .map((p) => ({ id: p.id, kind: p.kind, name: p.name, distM: Math.min(50_000, distById.get(p.id)!), visits: 0 }))
    .filter((c) => c.distM > 30); // you're already there
  const shortlist = rankByRules(context, candidates).slice(0, 15);

  if (shortlist.length === 0) {
    onResult({ cards: [], source: 'rules', refining: false });
    return;
  }

  const online = navigator.onLine;
  onResult({ cards: toCards(rulePicks(context, shortlist), byId, distById), source: 'rules', refining: online });
  if (!online) return;

  try {
    const res = await fetch('/api/ai/suggest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ context, candidates: shortlist }),
      credentials: 'same-origin',
      // Render's free instance can take ~50 s to wake up; rule cards are already showing.
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(70_000)]) : AbortSignal.timeout(70_000),
    });
    if (!res.ok) throw new Error(`suggest ${res.status}`);
    const body = suggestResponseSchema.parse(await res.json());
    const cards = toCards(body.picks, byId, distById);
    if (cards.length) onResult({ cards, source: body.source, refining: false });
    else onResult({ cards: toCards(rulePicks(context, shortlist), byId, distById), source: 'rules', refining: false });
  } catch (e) {
    if ((e as Error).name === 'AbortError' && signal?.aborted) return;
    onResult({ cards: toCards(rulePicks(context, shortlist), byId, distById), source: 'rules', refining: false });
  }
}
