import { polishResponseSchema, type PolishRequest, type PolishResponse } from '@ramble/shared';

/**
 * Sends ONE journal note to Gemma, only because the user tapped ✨ Polish (ARCHITECTURE.md §7.4).
 * Returns the note unchanged (source "none") if offline or the AI is unavailable.
 */
export async function polishNote(req: PolishRequest, signal?: AbortSignal): Promise<PolishResponse> {
  const unchanged: PolishResponse = { title: '', body: req.note, tags: [], source: 'none' };
  if (!navigator.onLine) return unchanged;
  try {
    const timeout = AbortSignal.timeout(60_000);
    const res = await fetch('/api/ai/polish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
      credentials: 'same-origin',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (!res.ok) return unchanged;
    return polishResponseSchema.parse(await res.json());
  } catch {
    return unchanged;
  }
}
