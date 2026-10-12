import { z } from 'zod';
import type { PlaceUpdateItem, PlaceUpdatesQuery } from '@ramble/shared';
import { cleanText } from './text';
import { traced } from './telemetry';

/** SerpApi Google search, server-side only (the key never reaches the browser). */
export class SerpApiUnavailableError extends Error {}

export function serpApiKey(): string | null {
  const key = process.env.SERPAPI_KEY?.trim();
  return key && key !== 'unset' ? key : null;
}

const resultSchema = z.object({
  organic_results: z
    .array(
      z.object({
        title: z.string().optional(),
        link: z.string().optional(),
        snippet: z.string().optional(),
        date: z.string().optional(),
        source: z.string().optional(),
        displayed_link: z.string().optional(),
      }),
    )
    .optional(),
});

const KIND_WORD: Partial<Record<NonNullable<PlaceUpdatesQuery['kind']>, string>> = {
  park: 'park',
  garden: 'gardens',
  reserve: 'reserve',
  trail: 'trail',
  beach: 'beach',
  viewpoint: 'lookout',
  peak: 'summit',
};

export function buildSearchQuery({ name, kind }: PlaceUpdatesQuery): string {
  const word = kind && KIND_WORD[kind] && !name.toLowerCase().includes(KIND_WORD[kind]!) ? ` ${KIND_WORD[kind]}` : '';
  return `"${name}"${word} (closure OR closed OR works OR event OR alert OR upgrade)`;
}

/** Keeps only safe https links and caps every field (search results are untrusted). */
export function toItems(raw: unknown): PlaceUpdateItem[] {
  const parsed = resultSchema.safeParse(raw);
  if (!parsed.success) return [];
  const items: PlaceUpdateItem[] = [];
  for (const r of parsed.data.organic_results ?? []) {
    if (!r.title || !r.link) continue;
    let url: URL;
    try {
      url = new URL(r.link);
    } catch {
      continue;
    }
    if (url.protocol !== 'https:') continue;
    items.push({
      title: cleanText(r.title).slice(0, 200),
      snippet: cleanText(r.snippet ?? '').slice(0, 400),
      source: cleanText(r.source ?? url.hostname).slice(0, 100),
      date: r.date ? cleanText(r.date).slice(0, 40) : undefined,
      url: url.toString().slice(0, 2048),
    });
    if (items.length === 5) break;
  }
  return items;
}

const GENERIC_WORDS = new Set(['the', 'trail', 'track', 'walk', 'park', 'parks', 'garden', 'gardens', 'reserve', 'beach', 'lookout', 'summit', 'national']);
const normalise = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * Google loosens a quoted query when nothing matches, so "Merri Creek Trail" can come back as
 * any creek closure anywhere. Keep only results that name the place itself (minus generic words
 * like "trail" or "park").
 */
export function aboutPlace(items: PlaceUpdateItem[], name: string): PlaceUpdateItem[] {
  const words = normalise(name).split(' ');
  const core = words.filter((w) => !GENERIC_WORDS.has(w)).join(' ') || words.join(' ');
  return items.filter((i) => ` ${normalise(`${i.title} ${i.snippet}`)} `.includes(` ${core} `));
}

export function searchPlaceUpdates(query: PlaceUpdatesQuery, fetchImpl: typeof fetch = fetch): Promise<PlaceUpdateItem[]> {
  return traced('serpapi.search', 'http.client', { 'ramble.engine': 'google' }, async (set) => {
    const items = await runSearch(query, fetchImpl);
    set({ 'ramble.results': items.length });
    return items;
  });
}

async function runSearch(query: PlaceUpdatesQuery, fetchImpl: typeof fetch): Promise<PlaceUpdateItem[]> {
  const key = serpApiKey();
  if (!key) throw new SerpApiUnavailableError('SerpApi is not configured');
  const params = new URLSearchParams({
    engine: 'google',
    q: buildSearchQuery(query),
    num: '8',
    tbs: 'qdr:m', // past month: closures and events are time-sensitive
    api_key: key,
  });
  const res = await fetchImpl(`https://serpapi.com/search.json?${params}`, { signal: AbortSignal.timeout(15_000) }).catch((e: unknown) => {
    throw new SerpApiUnavailableError(`SerpApi request failed: ${(e as Error).name}`);
  });
  if (!res.ok) throw new SerpApiUnavailableError(`SerpApi responded ${res.status}`);
  return aboutPlace(toItems(await res.json()), query.name);
}
