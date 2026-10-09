import { z } from 'zod';
import { PLACE_KINDS } from './suggest';

/**
 * Trail & park updates (SerpApi): recent closures, works and events for a PUBLIC place.
 * Only public OSM names are ever looked up, never spots the user named (SECURITY.md §8).
 */

/** Letters (any language), digits, spaces and basic punctuation only. */
const safeText = (max: number) =>
  z
    .string()
    .trim()
    .min(2)
    .max(max)
    .regex(/^[\p{L}\p{M}\p{N} '’.,&()\-/]+$/u, 'unsupported characters');

export const placeUpdatesQuerySchema = z.object({
  name: safeText(80),
  kind: z.enum(PLACE_KINDS).optional(),
});
export type PlaceUpdatesQuery = z.infer<typeof placeUpdatesQuerySchema>;

export const placeUpdateItemSchema = z.object({
  title: z.string().max(200),
  snippet: z.string().max(400),
  source: z.string().max(100),
  date: z.string().max(40).optional(),
  url: z.string().url().startsWith('https://').max(2048),
});
export type PlaceUpdateItem = z.infer<typeof placeUpdateItemSchema>;

export const UPDATE_SEVERITIES = ['none', 'info', 'caution', 'closed'] as const;
export type UpdateSeverity = (typeof UPDATE_SEVERITIES)[number];

export const placeUpdatesResponseSchema = z.object({
  items: z.array(placeUpdateItemSchema).max(5),
  summary: z.object({ headline: z.string().max(140), severity: z.enum(UPDATE_SEVERITIES), source: z.enum(['gemma', 'none']) }),
  fetchedAt: z.string(),
  cached: z.boolean(),
});
export type PlaceUpdatesResponse = z.infer<typeof placeUpdatesResponseSchema>;
