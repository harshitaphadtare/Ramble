import { z } from 'zod';

/**
 * "Get me outside": schemas shared by the app and the API, plus the rule-based ranker that
 * gives instant results (and the offline / AI-unavailable fallback). See ARCHITECTURE.md §7.
 */

export const PLACE_KINDS = ['park', 'garden', 'reserve', 'viewpoint', 'water', 'beach', 'peak', 'trail', 'picnic', 'other'] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];

export const MOODS = ['quiet', 'views', 'nature', 'golden-hour', 'surprise'] as const;
export type Mood = (typeof MOODS)[number];

export const ENERGIES = ['easy', 'moderate', 'push'] as const;
export type Energy = (typeof ENERGIES)[number];

/** Letters (any language), digits, spaces and basic punctuation; trims and caps length. */
const placeName = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[\p{L}\p{M}\p{N} '’.,&()\-/]+$/u, 'unsupported characters');

export const suggestContextSchema = z.object({
  minutes: z.number().int().min(15).max(240),
  mood: z.enum(MOODS),
  energy: z.enum(ENERGIES),
  /** Minutes until sunset (negative = after sunset). Computed on the device. */
  sunsetInMin: z.number().int().min(-1440).max(1440),
});
export type SuggestContext = z.infer<typeof suggestContextSchema>;

export const candidateSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,40}$/),
  kind: z.enum(PLACE_KINDS),
  name: placeName,
  distM: z.number().int().min(0).max(50_000),
  visits: z.number().int().min(0).max(10_000),
});
export type Candidate = z.infer<typeof candidateSchema>;

export const suggestRequestSchema = z.object({
  context: suggestContextSchema,
  candidates: z
    .array(candidateSchema)
    .min(1)
    .max(15)
    .refine((c) => new Set(c.map((x) => x.id)).size === c.length, 'duplicate ids'),
});
export type SuggestRequest = z.infer<typeof suggestRequestSchema>;

export const pickSchema = z.object({
  id: z.string(),
  reason: z.string().min(1).max(160),
});
export type Pick = z.infer<typeof pickSchema>;

export const suggestResponseSchema = z.object({
  picks: z.array(pickSchema).max(3),
  source: z.enum(['gemma', 'rules']),
});
export type SuggestResponse = z.infer<typeof suggestResponseSchema>;

// ---------------------------------------------------------------- rule-based ranker

/** Walking speed used for time estimates (~4.8 km/h). */
const METRES_PER_MIN = 80;

const MOOD_KINDS: Record<Mood, PlaceKind[]> = {
  quiet: ['garden', 'reserve', 'water', 'park'],
  views: ['viewpoint', 'peak', 'beach', 'water'],
  nature: ['reserve', 'trail', 'water', 'park', 'peak'],
  'golden-hour': ['viewpoint', 'beach', 'water', 'peak'],
  surprise: [],
};

const ENERGY_FACTOR: Record<Energy, number> = { easy: 0.6, moderate: 0.8, push: 1 };

/** One-way walking minutes to a candidate. */
export function walkMinutes(distM: number) {
  return Math.max(1, Math.round(distM / METRES_PER_MIN));
}

function score(ctx: SuggestContext, c: Candidate): number {
  // A round trip should fit the time budget, scaled down for lower energy.
  const budget = (ctx.minutes * ENERGY_FACTOR[ctx.energy]) / 2;
  const mins = walkMinutes(c.distM);
  if (mins > budget) return -1;

  let s = 1 - mins / (budget + 1); // closer is better, but anything in budget is fine
  if (c.visits === 0) s += 0.5; // somewhere new
  else if (c.visits >= 5) s -= 0.2;
  if (MOOD_KINDS[ctx.mood].includes(c.kind)) s += 0.6;
  if (ctx.mood === 'golden-hour' && ctx.sunsetInMin > 0 && mins <= ctx.sunsetInMin) s += 0.3;
  if (ctx.mood === 'surprise') s += pseudoRandom(c.id) * 0.8;
  return s;
}

/** Stable per-id jitter so "surprise" varies by place but not on every re-render. */
function pseudoRandom(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

const KIND_LABEL: Record<PlaceKind, string> = {
  park: 'park',
  garden: 'garden',
  reserve: 'nature reserve',
  viewpoint: 'lookout',
  water: 'spot by the water',
  beach: 'beach',
  peak: 'summit',
  trail: 'trail',
  picnic: 'picnic spot',
  other: 'spot',
};

export function ruleReason(ctx: SuggestContext, c: Candidate): string {
  const mins = walkMinutes(c.distM);
  const parts = [`${mins} min walk to this ${KIND_LABEL[c.kind]}`];
  if (c.visits === 0) parts.push("somewhere you haven't been yet");
  else if (c.visits >= 5) parts.push('an old favourite');
  if (ctx.sunsetInMin > 0 && ctx.sunsetInMin <= 120 && mins < ctx.sunsetInMin) {
    parts.push(`you'll make it before sunset (${ctx.sunsetInMin} min)`);
  }
  const text = parts.join(', ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`.slice(0, 160);
}

/** Rule-based ranking: always available, offline included. Returns candidates best-first. */
export function rankByRules(ctx: SuggestContext, candidates: Candidate[]): Candidate[] {
  return candidates
    .map((c) => ({ c, s: score(ctx, c) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.c);
}

export function rulePicks(ctx: SuggestContext, candidates: Candidate[], n = 3): Pick[] {
  return rankByRules(ctx, candidates)
    .slice(0, n)
    .map((c) => ({ id: c.id, reason: ruleReason(ctx, c) }));
}
