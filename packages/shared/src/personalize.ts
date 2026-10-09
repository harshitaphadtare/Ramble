import { z } from 'zod';

/**
 * TabPFN feature schema v1: all numeric and anonymous. No names, coordinates or ids.
 * See docs/ARCHITECTURE.md §8.2. The order of this array IS the column order.
 */
export const PERSONALIZE_COLUMNS_V1 = [
  { name: 'kind', max: 8 },
  { name: 'tagQuiet', max: 1 },
  { name: 'tagView', max: 1 },
  { name: 'tagShade', max: 1 },
  { name: 'tagWater', max: 1 },
  { name: 'tagDog', max: 1 },
  { name: 'tagToilets', max: 1 },
  { name: 'distBucket', max: 5 },
  { name: 'hourBucket', max: 5 },
  { name: 'weekend', max: 1 },
  { name: 'weather', max: 2 },
  { name: 'tempBucket', max: 4 },
  { name: 'acceptedBefore', max: 1 },
] as const;

export const PERSONALIZE_MIN_TRAIN_ROWS = 15;
export const PERSONALIZE_MIN_POSITIVES = 3;

const row = z
  .array(z.number().int().min(0))
  .length(PERSONALIZE_COLUMNS_V1.length)
  .refine((r) => r.every((v, i) => v <= PERSONALIZE_COLUMNS_V1[i]!.max), 'value out of range');

export const personalizeRequestSchema = z
  .object({
    columns: z.literal('v1'),
    train: z.array(row).min(PERSONALIZE_MIN_TRAIN_ROWS).max(500),
    labels: z.array(z.union([z.literal(0), z.literal(1)])),
    test: z.array(row).min(1).max(50),
  })
  .refine((b) => b.labels.length === b.train.length, 'labels must match train rows')
  .refine(
    (b) => b.labels.filter((l) => l === 1).length >= PERSONALIZE_MIN_POSITIVES,
    'not enough positive examples',
  );
export type PersonalizeRequest = z.infer<typeof personalizeRequestSchema>;

export const personalizeResponseSchema = z.object({
  scores: z.array(z.number().min(0).max(1)),
});
export type PersonalizeResponse = z.infer<typeof personalizeResponseSchema>;
