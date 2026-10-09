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
import { fetchPlacesNear } from '../../lib/places/places';

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

// Places don't change minute to minute: keep the last few areas for this session.
const areaCache = new Map<string, OutdoorPlace[]>();

async function placesNear(origin: LonLat, signal?: AbortSignal): Promise<OutdoorPlace[]> {
  const key = `${snapToGrid(origin[0])},${snapToGrid(origin[1])}`;
  const hit = areaCache.get(key);
  if (hit) return hit;
  const places = await fetchPlacesNear(origin, signal);
  areaCache.set(key, places);
  if (areaCache.size > 8) areaCache.delete(areaCache.keys().next().value!);
  return places;
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
export async function explore(origin: LonLat, prefs: ExplorePrefs, onResult: (r: ExploreResult) => void, signal?: AbortSignal) {
  const places = await placesNear(origin, signal);
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
