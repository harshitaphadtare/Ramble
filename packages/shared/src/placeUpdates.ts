import { z } from 'zod';

/** Letters (any language), digits, spaces and basic punctuation only. */
const safeText = (max: number) =>
  z
    .string()
    .trim()
    .min(2)
    .max(max)
    .regex(/^[\p{L}\p{N} '’.,&()-]+$/u, 'unsupported characters');

export const placeUpdatesQuerySchema = z.object({
  name: safeText(80),
  area: safeText(60).optional(),
});
export type PlaceUpdatesQuery = z.infer<typeof placeUpdatesQuerySchema>;

export const placeUpdateItemSchema = z.object({
  title: z.string().max(200),
  snippet: z.string().max(400),
  source: z.string().max(100),
  date: z.string().max(40).optional(),
  url: z.string().url().startsWith('https://').max(2048),
});

export const placeUpdatesResponseSchema = z.object({
  items: z.array(placeUpdateItemSchema).max(5),
  fetchedAt: z.string(),
  cached: z.boolean(),
});
export type PlaceUpdatesResponse = z.infer<typeof placeUpdatesResponseSchema>;
