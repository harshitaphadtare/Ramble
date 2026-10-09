import { z } from 'zod';
import { PLACE_KINDS } from './suggest';

/**
 * Outdoor places come from OpenStreetMap via our API. The device only ever sends the centre
 * of a ~5 km grid cell, never its position (docs/SECURITY.md §5.8).
 */
export const PLACES_GRID = 0.05;

export function snapToGrid(value: number): number {
  return Number((Math.round(value / PLACES_GRID) * PLACES_GRID).toFixed(2));
}

const onGrid = (v: number) => Math.abs(v / PLACES_GRID - Math.round(v / PLACES_GRID)) < 1e-6;

export const placesQuerySchema = z.object({
  lat: z.coerce.number().min(-85).max(85).refine(onGrid, 'must be snapped to the grid'),
  lon: z.coerce.number().min(-180).max(180).refine(onGrid, 'must be snapped to the grid'),
});
export type PlacesQuery = z.infer<typeof placesQuerySchema>;

export const outdoorPlaceSchema = z.object({
  id: z.string().regex(/^[nwr]\d{1,15}$/),
  name: z.string().min(1).max(80),
  kind: z.enum(PLACE_KINDS),
  lon: z.number(),
  lat: z.number(),
});
export type OutdoorPlace = z.infer<typeof outdoorPlaceSchema>;

export const placesResponseSchema = z.object({
  places: z.array(outdoorPlaceSchema).max(400),
});
