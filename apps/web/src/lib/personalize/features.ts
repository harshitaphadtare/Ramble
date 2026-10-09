import { PERSONALIZE_MIN_POSITIVES, PERSONALIZE_MIN_TRAIN_ROWS, type PersonalizeRequest, type Place, type PlaceKind, type Visit } from '@ramble/shared';
import { distanceM, type LonLat } from '../geo/geo';

/**
 * Turns the user's own history into ANONYMOUS numeric rows for TabPFN (docs/ARCHITECTURE.md §8.2).
 * Each row is 13 small integers in the order of PERSONALIZE_COLUMNS_V1. No names, coordinates,
 * ids or timestamps ever leave the device. Columns we can't know yet (tags, weather, temperature)
 * are sent as 0.
 */

const KIND_INDEX: Record<PlaceKind, number> = {
  park: 0,
  trail: 1,
  viewpoint: 2,
  peak: 2,
  water: 3,
  garden: 4,
  reserve: 5,
  beach: 6,
  picnic: 0,
  other: 8,
};

export function distBucket(m: number): number {
  return m < 500 ? 0 : m < 1000 ? 1 : m < 2000 ? 2 : m < 5000 ? 3 : m < 10_000 ? 4 : 5;
}

export function hourBucket(hour: number): number {
  return hour >= 5 && hour < 8 ? 0 : hour >= 8 && hour < 11 ? 1 : hour >= 11 && hour < 14 ? 2 : hour >= 14 && hour < 17 ? 3 : hour >= 17 && hour < 20 ? 4 : 5;
}

const isWeekend = (t: number) => [0, 6].includes(new Date(t).getDay());

/** The middle of the user's saved places: "where they usually are", without storing a home. */
function usualArea(places: Place[]): LonLat | null {
  if (places.length === 0) return null;
  const lons = places.map((p) => p.lonLat[0]).sort((a, b) => a - b);
  const lats = places.map((p) => p.lonLat[1]).sort((a, b) => a - b);
  const mid = (xs: number[]) => xs[Math.floor(xs.length / 2)]!;
  return [mid(lons), mid(lats)];
}

function mostCommon(xs: number[]): number {
  const counts = new Map<number, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
}

function row(kind: PlaceKind, dist: number, hour: number, weekend: boolean, accepted: boolean): number[] {
  // kind, 6 tag flags (unknown → 0), distBucket, hourBucket, weekend, weather (0), tempBucket (0), acceptedBefore
  return [KIND_INDEX[kind], 0, 0, 0, 0, 0, 0, distBucket(dist), hourBucket(hour), weekend ? 1 : 0, 0, 0, accepted ? 1 : 0];
}

export type Readiness = { ready: true; visited: number } | { ready: false; visited: number; needed: number };

export function readiness(places: Place[], visits: Visit[]): Readiness {
  const counts = new Map<string, number>();
  for (const v of visits) counts.set(v.placeId, (counts.get(v.placeId) ?? 0) + 1);
  const visited = places.filter((p) => (counts.get(p.id) ?? 0) > 0);
  const positives = visited.filter((p) => (counts.get(p.id) ?? 0) >= 2).length;
  return visited.length >= PERSONALIZE_MIN_TRAIN_ROWS && positives >= PERSONALIZE_MIN_POSITIVES
    ? { ready: true, visited: visited.length }
    : { ready: false, visited: visited.length, needed: PERSONALIZE_MIN_TRAIN_ROWS };
}

export interface ScoringCandidate {
  id: string;
  kind: PlaceKind;
  lonLat: LonLat;
}

/** Training rows = places you've been to (loved = 2+ visits); test rows = today's candidates. */
export function buildRequest(places: Place[], visits: Visit[], candidates: ScoringCandidate[], now = Date.now()): PersonalizeRequest | null {
  if (!readiness(places, visits).ready) return null;
  const area = usualArea(places);
  if (!area) return null;
  const byPlace = new Map<string, Visit[]>();
  for (const v of visits) byPlace.set(v.placeId, [...(byPlace.get(v.placeId) ?? []), v]);

  const train: number[][] = [];
  const labels: (0 | 1)[] = [];
  for (const p of places) {
    const vs = byPlace.get(p.id);
    if (!vs?.length) continue;
    const hour = mostCommon(vs.map((v) => new Date(v.at).getHours()));
    const weekend = vs.filter((v) => isWeekend(v.at)).length * 2 >= vs.length;
    train.push(row(p.kind, distanceM(area, p.lonLat), hour, weekend, p.wantToGo));
    labels.push(vs.length >= 2 ? 1 : 0);
  }

  const wanted = new Set(places.filter((p) => p.wantToGo && p.sourceId).map((p) => p.sourceId));
  const hour = new Date(now).getHours();
  // Same meaning as the training rows: distance from the user's usual area.
  const test = candidates.map((c) => row(c.kind, distanceM(area, c.lonLat), hour, isWeekend(now), wanted.has(c.id)));

  return { columns: 'v1', train: train.slice(-500), labels: labels.slice(-500), test: test.slice(0, 50) };
}
