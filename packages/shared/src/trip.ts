import { z } from 'zod';

/** Kinds of stop Gemma may name; the app finds a real one nearby with an OSM tag filter. */
export const STOP_CATEGORIES = [
  'cafe',
  'restaurant',
  'fast_food',
  'bar',
  'bakery',
  'ice_cream',
  'supermarket',
  'bank',
  'atm',
  'pharmacy',
  'park',
  'beach',
  'viewpoint',
  'museum',
  'library',
  'shop',
] as const;
export type StopCategory = (typeof STOP_CATEGORIES)[number];

export const TRAVEL_MODES = ['walk', 'bike', 'car'] as const;

/** "I'm going to St Kilda, coffee on the way…": what the user typed. */
export const tripPlanRequestSchema = z.object({
  text: z.string().trim().min(3).max(500),
});
export type TripPlanRequest = z.infer<typeof tripPlanRequestSchema>;

export const plannedStopSchema = z.object({
  /** What to search for: a place name ("St Kilda Pier") or a thing ("fish and chips"). */
  query: z.string().min(1).max(80),
  category: z.enum(STOP_CATEGORIES).nullable(),
  leg: z.enum(['out', 'back']),
});
export type PlannedStop = z.infer<typeof plannedStopSchema>;

export const tripPlanResponseSchema = z.object({
  /** Ordered; the last "out" stop is the destination. */
  stops: z.array(plannedStopSchema).max(8),
  returnHome: z.boolean(),
  mode: z.enum(TRAVEL_MODES).nullable(),
  backMode: z.enum(TRAVEL_MODES).nullable(),
  source: z.enum(['gemma', 'none']),
});
export type TripPlanResponse = z.infer<typeof tripPlanResponseSchema>;
