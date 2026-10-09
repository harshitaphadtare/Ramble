/** Helpers for handling untrusted model output (docs/SECURITY.md §5.5). */

/** Strips control characters and bidi overrides, collapses whitespace. */
export function cleanText(s: string): string {
  return (
    s
      // Control characters and bidi overrides (U+202A-202E, U+2066-2069) can hide or reorder text.
      // eslint-disable-next-line no-control-regex -- matching control characters is the point
      .replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Finds the first JSON object in a reply that satisfies `accept`, ignoring code fences,
 * preambles, and braces inside strings or thinking text.
 */
export function extractJsonObject(text: string, accept: (o: Record<string, unknown>) => boolean): Record<string, unknown> | null {
  const cleaned = text.replace(/```(?:json)?/gi, ' ');
  for (let start = cleaned.indexOf('{'); start !== -1; start = cleaned.indexOf('{', start + 1)) {
    let depth = 0;
    let inString = false;
    for (let i = start; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (inString) {
        if (ch === '\\') i++; // skip the escaped character
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) {
        try {
          const parsed: unknown = JSON.parse(cleaned.slice(start, i + 1));
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && accept(parsed as Record<string, unknown>)) {
            return parsed as Record<string, unknown>;
          }
        } catch {
          /* not this one; keep scanning */
        }
        break;
      }
    }
  }
  return null;
}
