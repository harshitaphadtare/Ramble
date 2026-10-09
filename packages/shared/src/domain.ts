import { z } from 'zod';
import { PLACE_KINDS } from './suggest';

/**
 * The user's own data. On the device it lives encrypted in IndexedDB (docs/ARCHITECTURE.md §6);
 * these schemas validate every record after decryption, so a corrupted or tampered record can't
 * crash the app.
 */

const id = z.string().min(1).max(64);
const timestamp = z.number().int().nonnegative();
const lonLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

export const placeSchema = z.object({
  id,
  name: z.string().trim().min(1).max(80),
  kind: z.enum(PLACE_KINDS),
  lonLat,
  /** OSM / map-tile id when the place came from the map; absent for spots the user named. */
  sourceId: z.string().max(40).optional(),
  wantToGo: z.boolean(),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type Place = z.infer<typeof placeSchema>;

export const visitSchema = z.object({
  id,
  placeId: id,
  at: timestamp,
  updatedAt: timestamp,
});
export type Visit = z.infer<typeof visitSchema>;

export const journalSchema = z.object({
  id,
  placeId: id.optional(),
  visitId: id.optional(),
  title: z.string().max(80),
  body: z.string().max(4000),
  tags: z.array(z.string().max(30)).max(8),
  photoId: id.optional(),
  /** True once the text was polished by Gemma (and reviewed by the user). */
  aiAssisted: z.boolean(),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type JournalEntry = z.infer<typeof journalSchema>;

export const RECORD_KINDS = ['place', 'visit', 'journal'] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

export const recordSchemas = { place: placeSchema, visit: visitSchema, journal: journalSchema } as const;
export type RecordOf<K extends RecordKind> = z.infer<(typeof recordSchemas)[K]>;

// ---------------------------------------------------------------- levels

/** Same ladder and colours as Wander, where the idea started. */
export const LEVELS = [
  { id: 'want', label: 'Want to go', min: 0, color: '#8C877E' },
  { id: 'visited', label: 'Visited', min: 1, color: '#12A187' },
  { id: 'favourite', label: 'Favourite', min: 2, color: '#F29D0C' },
  { id: 'regular', label: 'Regular', min: 5, color: '#E8457A' },
  { id: 'legend', label: 'Local legend', min: 10, color: '#7357F6' },
] as const;
export type LevelId = (typeof LEVELS)[number]['id'];

/** Levels are derived from visits, never stored, so they can't drift out of sync. */
export function levelFor(visitCount: number) {
  let level: (typeof LEVELS)[number] = LEVELS[0];
  for (const l of LEVELS) if (visitCount >= l.min) level = l;
  const next = LEVELS.find((l) => l.min > visitCount);
  return { ...level, next: next ? { ...next, visitsToGo: next.min - visitCount } : null };
}

// ---------------------------------------------------------------- streak

/** ISO-8601 week key for the local calendar date, e.g. "2026-W41". */
export function weekKey(t: number): string {
  const local = new Date(t);
  // Work on the local date as a UTC date so daylight-saving shifts can't move it.
  const d = new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));
  const dayNum = d.getUTCDay() || 7; // Mon = 1 … Sun = 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // the Thursday of this week decides the year
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Consecutive weeks (ending this week or last week) with at least one visit. */
export function touchedGrassStreak(visitTimes: number[], now = Date.now()): number {
  const weeks = new Set(visitTimes.map(weekKey));
  const WEEK = 7 * 86_400_000;
  let cursor = now;
  // A streak isn't broken just because this week hasn't had a walk yet.
  if (!weeks.has(weekKey(cursor))) cursor -= WEEK;
  let streak = 0;
  while (weeks.has(weekKey(cursor))) {
    streak++;
    cursor -= WEEK;
  }
  return streak;
}
