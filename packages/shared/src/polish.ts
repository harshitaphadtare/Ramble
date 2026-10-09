import { z } from 'zod';
import { PLACE_KINDS } from './suggest';

/**
 * ✨ Polish: the user explicitly sends one journal note to Gemma for tidying.
 * Nothing is sent unless they tap the button (docs/ARCHITECTURE.md §7.4).
 */
export const polishRequestSchema = z.object({
  note: z.string().trim().min(3).max(2000),
  placeName: z.string().trim().max(80).optional(),
  kind: z.enum(PLACE_KINDS).optional(),
});
export type PolishRequest = z.infer<typeof polishRequestSchema>;

export const polishResponseSchema = z.object({
  /** Empty when the note came back unchanged (source "none"). */
  title: z.string().max(80),
  body: z.string().min(1).max(4000),
  tags: z.array(z.string().min(1).max(30)).max(6),
  source: z.enum(['gemma', 'none']),
});
export type PolishResponse = z.infer<typeof polishResponseSchema>;
