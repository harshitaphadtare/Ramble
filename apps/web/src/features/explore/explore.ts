import * as SunCalc from 'suncalc';
import {
  rankByRules,
  rulePicks,
  personalizeResponseSchema,
  suggestResponseSchema,
  walkMinutes,
  type Candidate,
  type Energy,
  type Mood,
  type Pick,
  type OutdoorPlace,
  type Place,
  type SuggestContext,
  type Visit,
  snapToGrid,
} from '@ramble/shared';
import { distanceM, type LonLat } from '../../lib/geo/geo';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { fetchPlacesNear } from '../../lib/places/places';
import { placesFromMapAround } from '../../lib/places/mapPlaces';
import { buildRequest } from '../../lib/personalize/features';
import { traced } from '../../lib/telemetry';

export interface ExplorePrefs {
  minutes: number;
  mood: Mood;
  energy: Energy;
}

export interface ExploreCard {
  place: OutdoorPlace;
  reason: string;
  walkMin: number;
  /** TabPFN's estimate (0-1) that this is your kind of place, when personalisation is on. */
  love?: number;
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
export async function placesNear(origin: LonLat, map: MapLibreMap | null, signal?: AbortSignal): Promise<OutdoorPlace[]> {
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

function toCards(picks: Pick[], byId: Map<string, OutdoorPlace>, distById: Map<string, number>, love: Map<string, number>): ExploreCard[] {
  return picks.flatMap((p) => {
    const place = byId.get(p.id);
    return place ? [{ place, reason: p.reason, walkMin: walkMinutes(distById.get(p.id) ?? 0), love: love.get(p.id) }] : [];
  });
}

/**
 * Asks TabPFN how likely you are to love each candidate (anonymous rows only) and re-ranks:
 * 45% TabPFN, 55% the rule order. Returns the input unchanged if anything is missing or slow.
 */
async function personalise(
  shortlist: Candidate[],
  byId: Map<string, OutdoorPlace>,
  user: { places: Place[]; visits: Visit[] },
  signal?: AbortSignal,
): Promise<{ ranked: Candidate[]; love: Map<string, number> }> {
  const unchanged = { ranked: shortlist, love: new Map<string, number>() };
  const req = buildRequest(
    user.places,
    user.visits,
    shortlist.map((c) => ({ id: c.id, kind: c.kind, lonLat: [byId.get(c.id)!.lon, byId.get(c.id)!.lat] as LonLat })),
  );
  if (!req) return unchanged;
  try {
    const timeout = AbortSignal.timeout(30_000);
    const res = await fetch('/api/personalize', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
      credentials: 'same-origin',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (!res.ok) return unchanged;
    const { scores } = personalizeResponseSchema.parse(await res.json());
    if (scores.length !== shortlist.length) return unchanged;
    const love = new Map(shortlist.map((c, i) => [c.id, scores[i]!]));
    const blended = (c: Candidate, i: number) => 0.45 * love.get(c.id)! + 0.55 * (1 - i / shortlist.length);
    const ranked = shortlist
      .map((c, i) => ({ c, s: blended(c, i) }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.c);
    return { ranked, love };
  } catch (e) {
    if (signal?.aborted) throw e;
    return unchanged;
  }
}

/**
 * Rules first (instant, works offline), then Gemma refines the same cards when online.
 * `onResult` is called once or twice. Throws only if places can't be loaded at all.
 */
export async function explore(
  origin: LonLat,
  prefs: ExplorePrefs,
  onResult: (r: ExploreResult) => void,
  {
    map = null,
    signal,
    user = { places: [], visits: [] },
    personalize = false,
  }: { map?: MapLibreMap | null; signal?: AbortSignal; user?: { places: Place[]; visits: Visit[] }; personalize?: boolean } = {},
) {
  const places = await traced('explore.places', {}, async (set) => {
    const found = await placesNear(origin, map, signal);
    set({ 'ramble.places': found.length });
    return found;
  });
  const byId = new Map(places.map((p) => [p.id, p]));
  const distById = new Map(places.map((p) => [p.id, Math.round(distanceM(origin, [p.lon, p.lat]))]));

  // How often you've been to each map place (via the places you saved from it).
  const visitsBySource = new Map<string, number>();
  for (const p of user.places) {
    if (!p.sourceId) continue;
    visitsBySource.set(p.sourceId, user.visits.filter((v) => v.placeId === p.id).length);
  }

  const context: SuggestContext = { ...prefs, sunsetInMin: minutesToSunset(origin) };
  const candidates: Candidate[] = places
    .map((p) => ({ id: p.id, kind: p.kind, name: p.name, distM: Math.min(50_000, distById.get(p.id)!), visits: Math.min(10_000, visitsBySource.get(p.id) ?? 0) }))
    .filter((c) => c.distM > 30); // you're already there
  let shortlist = rankByRules(context, candidates).slice(0, 15);
  let love = new Map<string, number>();

  if (shortlist.length === 0) {
    onResult({ cards: [], source: 'rules', refining: false });
    return;
  }

  const online = navigator.onLine;
  onResult({ cards: toCards(rulePicks(context, shortlist), byId, distById, love), source: 'rules', refining: online });
  if (!online) return;

  if (personalize) {
    ({ ranked: shortlist, love } = await traced('explore.tabpfn', { 'ramble.candidates': shortlist.length }, async (set) => {
      const out = await personalise(shortlist, byId, user, signal);
      set({ 'ramble.scored': out.love.size });
      return out;
    }));
  }

  try {
    const res = await traced('explore.gemma', { 'ramble.candidates': shortlist.length }, () => fetch('/api/ai/suggest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ context, candidates: shortlist }),
      credentials: 'same-origin',
      // Render's free instance can take ~50 s to wake up; rule cards are already showing.
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(70_000)]) : AbortSignal.timeout(70_000),
    }));
    if (!res.ok) throw new Error(`suggest ${res.status}`);
    const body = suggestResponseSchema.parse(await res.json());
    const cards = toCards(body.picks, byId, distById, love);
    if (cards.length) onResult({ cards, source: body.source, refining: false });
    else onResult({ cards: toCards(rulePicks(context, shortlist), byId, distById, love), source: 'rules', refining: false });
  } catch (e) {
    if ((e as Error).name === 'AbortError' && signal?.aborted) return;
    onResult({ cards: toCards(rulePicks(context, shortlist), byId, distById, love), source: 'rules', refining: false });
  }
}
